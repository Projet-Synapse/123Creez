// Powered by OnSpace.AI
import React, {
  createContext, useState, useCallback, useEffect, useRef, ReactNode,
} from 'react';
import {
  CanvasMeta, Folder, CanvasData, FolderPreviewMode,
  getCanvasMetas, getFolders,
  saveCanvas, deleteCanvas, renameCanvas, moveCanvasToFolder,
  saveFolder, deleteFolder, setCanvasThumbnail as persistThumbnail,
  setCanvasOrder as persistCanvasOrder, setFoldersOrder as persistFoldersOrder,
  setFolderPreviewMode as persistFolderPreviewMode,
  loadCanvas, createDefaultCanvas, generateId, setCanvasTransparentBg, addCanvasDrawingTime,
  computeThumbnailColor, computeStrokeCount,
} from '@/services/vaultService';
import { Layer, LayerGroup } from '@/contexts/CanvasContext';
import {
  vaultFolderAvailable, getVaultFolder, exportCanvasToFolder,
  readImageSize, buildImageLayer,
} from '@/services/vaultFolderService';
import { desktop } from '@/services/platform';
import { AppState } from 'react-native';
import { hydrateSyncStatus, subscribeSyncStatus } from '@/services/syncLog';
import { recordTombstone, autoPush, syncNow, getSupabaseClient } from '@/services/supabaseService';

interface VaultContextType {
  canvases: CanvasMeta[];
  folders: Folder[];
  loading: boolean;

  createCanvas: (name: string, folderId?: string | null, width?: number, height?: number) => Promise<string>;
  /** Crée une toile depuis une image (import du dossier vault). */
  createImageCanvas: (name: string, src: string, transparentBg?: boolean) => Promise<string | null>;
  removeCanvas: (id: string) => Promise<void>;
  renameCanvas: (id: string, name: string) => Promise<void>;
  setCanvasTransparentBg: (id: string, value: boolean) => Promise<void>;
  moveCanvas: (id: string, folderId: string | null) => Promise<void>;
  duplicateCanvas: (id: string) => Promise<string>;
  /** Cumule le temps de dessin (secondes) de la toile (galerie). */
  addCanvasDrawingTime: (id: string, seconds: number) => Promise<void>;

  createFolder: (name: string, color?: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  /** Drag & drop: persists a manual ordering (canvases / folders). */
  reorderCanvases: (orderedIds: string[]) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;
  setFolderPreview: (id: string, mode: FolderPreviewMode) => Promise<void>;
  /** Stores a generated raster preview for a canvas. */
  setCanvasThumbnail: (id: string, thumbnail: string) => Promise<void>;

  persistCanvas: (id: string, layers: Layer[], activeLayerId: string, groups?: LayerGroup[]) => Promise<void>;
  loadCanvasData: (id: string) => Promise<CanvasData | null>;
  reload: () => Promise<void>;
}

export const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [metas, flds] = await Promise.all([getCanvasMetas(), getFolders()]);
    setCanvases(metas.sort((a, b) => b.updatedAt - a.updatedAt));
    setFolders(flds);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Synchro par compte : tirer les toiles du compte au démarrage et à chaque
  // connexion (avant, seule une sauvegarde locale déclenchait une synchro,
  // donc un appareil neuf ne recevait jamais les toiles du téléphone).
  useEffect(() => {
    let cancelled = false;
    let running = false; // SIGNED_IN peut se répéter (retour d'onglet, refresh)
    const pull = async () => {
      if (running) return;
      running = true;
      try {
        const result = await syncNow().catch(() => null);
        if (!cancelled && result?.ok && result.pulled > 0) await reload();
      } finally {
        running = false;
      }
    };
    hydrateSyncStatus().finally(pull);
    // Retour au premier plan : relancer un cycle (vide la file hors ligne).
    // Une synchro lancée ailleurs (Reprendre, nouvel essai) peut avoir reçu
    // des toiles : recharger la liste à chaque fin de cycle.
    let prevPhase = '';
    const unsubStatus = subscribeSyncStatus((st) => {
      if (prevPhase === 'syncing' && st.phase !== 'syncing' && !cancelled) reload();
      prevPhase = st.phase;
    });
    // Re-tirer régulièrement (2 min) tant que l'app est au premier plan : un PC
    // resté ouvert voit ainsi arriver les toiles du téléphone.
    const poll = setInterval(() => { if (AppState.currentState === 'active') pull(); }, 120_000);
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') pull(); });
    let unsub: (() => void) | undefined;
    try {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') pull();
      });
      unsub = () => data.subscription.unsubscribe();
    } catch { /* Supabase non configuré */ }
    return () => { cancelled = true; unsub?.(); appSub.remove(); unsubStatus(); clearInterval(poll); };
  }, [reload]);

  // Push Supabase automatique, débattu (une rafale de sauvegardes = un push).
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => { autoPush(); }, 4000);
  }, []);

  const createCanvas = useCallback(async (
    name: string,
    folderId: string | null = null,
    width = 1080,
    height = 1920,
  ): Promise<string> => {
    const data = createDefaultCanvas(name, folderId, width, height);
    await saveCanvas(data);
    await reload();
    return data.meta.id;
  }, [reload]);

  const removeCanvas = useCallback(async (id: string) => {
    await deleteCanvas(id);
    await recordTombstone('canvas', id);
    setCanvases(prev => prev.filter(c => c.id !== id));
    schedulePush();
  }, []);

  const renameCanvasFn = useCallback(async (id: string, name: string) => {
    await renameCanvas(id, name);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, name, updatedAt: Date.now() } : c));
  }, []);

  const setCanvasDrawingTimeFn = useCallback(async (id: string, seconds: number) => {
    await addCanvasDrawingTime(id, seconds);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, drawingTime: (c.drawingTime ?? 0) + seconds } : c));
  }, []);

  const setCanvasTransparentBgFn = useCallback(async (id: string, value: boolean) => {
    await setCanvasTransparentBg(id, value);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, transparentBg: value } : c));
  }, []);

  const moveCanvas = useCallback(async (id: string, folderId: string | null) => {
    const metas = await getCanvasMetas();
    // Append at the end of the target folder's manual order.
    const inFolder = metas
      .filter(m => m.folderId === folderId && m.id !== id)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    const orderedIds = [...inFolder.map(m => m.id), id];
    await moveCanvasToFolder(id, folderId);
    await persistCanvasOrder(orderedIds);
    const rank = new Map(orderedIds.map((cid, idx) => [cid, idx]));
    setCanvases(prev => prev.map(c => {
      if (c.id === id) return { ...c, folderId, updatedAt: Date.now(), order: rank.get(id) };
      const r = rank.get(c.id);
      return r !== undefined ? { ...c, order: r } : c;
    }));
  }, []);

  const duplicateCanvas = useCallback(async (id: string): Promise<string> => {
    const existing = await loadCanvas(id);
    if (!existing) return id;
    const newData = createDefaultCanvas(
      `${existing.meta.name} (copie)`,
      existing.meta.folderId,
      existing.meta.width,
      existing.meta.height,
    );
    newData.layers = existing.layers.map(l => ({
      ...l,
      id: `${l.id}-copy`,
      strokes: l.strokes.map(s => ({ ...s, id: `${s.id}-copy`, layerId: `${l.id}-copy` })),
    }));
    newData.activeLayerId = `${existing.activeLayerId}-copy`;
    await saveCanvas(newData);
    await reload();
    return newData.meta.id;
  }, [reload]);

  const createFolder = useCallback(async (name: string, color = '#4ecdc4'): Promise<Folder> => {
    const folder: Folder = {
      id: generateId('folder'),
      name,
      parentId: null,
      createdAt: Date.now(),
      color,
    };
    await saveFolder(folder);
    setFolders(prev => [...prev, folder]);
    return folder;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const flds = await getFolders();
    const f = flds.find(x => x.id === id);
    if (!f) return;
    f.name = name;
    await saveFolder(f);
    setFolders(prev => prev.map(x => x.id === id ? { ...x, name } : x));
  }, []);

  const removeFolder = useCallback(async (id: string) => {
    await deleteFolder(id);
    await recordTombstone('folder', id);
    const affected = canvases.filter(c => c.folderId === id);
    for (const c of affected) await moveCanvasToFolder(c.id, null);
    setFolders(prev => prev.filter(f => f.id !== id));
    setCanvases(prev => prev.map(c => c.folderId === id ? { ...c, folderId: null } : c));
  }, [canvases]);

  const reorderCanvases = useCallback(async (orderedIds: string[]) => {
    await persistCanvasOrder(orderedIds);
    const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
    setCanvases(prev => prev.map(c => {
      const r = rank.get(c.id);
      return r !== undefined ? { ...c, order: r } : c;
    }));
  }, []);

  const reorderFolders = useCallback(async (orderedIds: string[]) => {
    await persistFoldersOrder(orderedIds);
    const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
    setFolders(prev => prev.map(f => {
      const r = rank.get(f.id);
      return r !== undefined ? { ...f, order: r } : f;
    }));
  }, []);

  const setFolderPreview = useCallback(async (id: string, mode: FolderPreviewMode) => {
    await persistFolderPreviewMode(id, mode);
    setFolders(prev => prev.map(f => f.id === id ? { ...f, previewMode: mode } : f));
  }, []);

  const setCanvasThumbnail = useCallback(async (id: string, thumbnail: string) => {
    await persistThumbnail(id, thumbnail);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, thumbnail, thumbAt: Date.now() } : c));
  }, []);

  const persistCanvas = useCallback(async (id: string, layers: Layer[], activeLayerId: string, groups?: LayerGroup[]) => {
    const metas = await getCanvasMetas();
    const meta = metas.find(m => m.id === id);
    if (!meta) return;
    const updatedMeta = {
      ...meta,
      updatedAt: Date.now(),
      thumbnailColor: computeThumbnailColor(layers),
      strokeCount: computeStrokeCount(layers),
    };
    await saveCanvas({ meta: updatedMeta, layers, activeLayerId, groups });
    setCanvases(prev => prev.map(c => c.id === id ? updatedMeta : c));
    // Miroir explorateur : PNG pleine résolution dans le dossier lié.
    if (vaultFolderAvailable()) {
      exportCanvasToFolder(updatedMeta.name, id, layers, updatedMeta.width, updatedMeta.height, updatedMeta.transparentBg === true)
        .catch(() => { });
    }
    schedulePush();
  }, []);

  const loadCanvasData = useCallback(async (id: string): Promise<CanvasData | null> => {
    return loadCanvas(id);
  }, []);

  /** Import dossier : image → nouvelle toile (calque image ajusté). */
  const createImageCanvas = useCallback(async (name: string, src: string, transparentBg = false): Promise<string | null> => {
    try {
      const { width, height } = await readImageSize(src);
      // Plafond raisonnable pour les très grandes photos.
      const cap = 4096;
      const scale = Math.min(1, cap / Math.max(width, height));
      const w = Math.max(100, Math.round(width * scale));
      const h = Math.max(100, Math.round(height * scale));
      const id = generateId('canvas');
      const layerId = `layer-1-${id}`;
      const now = Date.now();
      const data: CanvasData = {
        meta: {
          id, name: name.replace(/\.[a-zA-Z0-9]+$/, ''), folderId: null,
          createdAt: now, updatedAt: now, width: w, height: h,
          thumbnailColor: '#ffffff', strokeCount: 0,
          transparentBg,
        },
        layers: [{
          id: layerId, name: 'Image', visible: true, opacity: 1, strokes: [],
          images: [buildImageLayer(`img-${id}`, src, width, height, w, h)],
        }],
        activeLayerId: layerId,
        groups: [],
      };
      await saveCanvas(data);
      await reload();
      return id;
    } catch {
      return null;
    }
  }, [reload]);

  // ── Dossier vault : surveillance des images déposées ────────────────
  useEffect(() => {
    if (!vaultFolderAvailable()) return;
    let busy = false;
    const importPending = async () => {
      if (busy) return;
      busy = true;
      try {
        const images = await desktop()!.vaultFolder!.listImages();
        for (const file of images) {
          if (/--canvas-\d+-\d+\.png$/i.test(file.name)) continue; // nos propres exports
          const src = await desktop()!.vaultFolder!.readImage(file.path);
          if (!src) continue;
          const id = await createImageCanvas(file.name, src);
          if (id) await desktop()!.vaultFolder!.deleteImage(file.path);
        }
      } finally {
        busy = false;
      }
    };
    const unsub = desktop()!.vaultFolder!.onEvent(() => { importPending(); });
    getVaultFolder().then(folder => { if (folder) importPending(); });
    return unsub;
  }, [createImageCanvas]);

  return (
    <VaultContext.Provider value={{
      canvases, folders, loading,
      createCanvas, removeCanvas, renameCanvas: renameCanvasFn, moveCanvas, duplicateCanvas,
      addCanvasDrawingTime: setCanvasDrawingTimeFn,
      setCanvasTransparentBg: setCanvasTransparentBgFn,
      createFolder, renameFolder, removeFolder, createImageCanvas,
      reorderCanvases, reorderFolders, setFolderPreview, setCanvasThumbnail,
      persistCanvas, loadCanvasData, reload,
    }}>
      {children}
    </VaultContext.Provider>
  );
}
