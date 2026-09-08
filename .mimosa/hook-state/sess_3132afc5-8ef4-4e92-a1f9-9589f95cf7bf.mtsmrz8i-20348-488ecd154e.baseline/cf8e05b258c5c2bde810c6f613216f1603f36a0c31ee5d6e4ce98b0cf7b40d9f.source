// Powered by OnSpace.AI
import React, {
  createContext, useState, useCallback, useEffect, ReactNode,
} from 'react';
import {
  CanvasMeta, Folder, CanvasData,
  getCanvasMetas, getFolders,
  saveCanvas, deleteCanvas, renameCanvas, moveCanvasToFolder,
  saveFolder, deleteFolder,
  loadCanvas, createDefaultCanvas, generateId,
  computeThumbnailColor, computeStrokeCount,
} from '@/services/vaultService';
import { Layer } from '@/contexts/CanvasContext';

interface VaultContextType {
  canvases: CanvasMeta[];
  folders: Folder[];
  loading: boolean;

  createCanvas: (name: string, folderId?: string | null, width?: number, height?: number) => Promise<string>;
  removeCanvas: (id: string) => Promise<void>;
  renameCanvas: (id: string, name: string) => Promise<void>;
  moveCanvas: (id: string, folderId: string | null) => Promise<void>;
  duplicateCanvas: (id: string) => Promise<string>;

  createFolder: (name: string, color?: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  persistCanvas: (id: string, layers: Layer[], activeLayerId: string) => Promise<void>;
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
    setCanvases(prev => prev.filter(c => c.id !== id));
  }, []);

  const renameCanvasFn = useCallback(async (id: string, name: string) => {
    await renameCanvas(id, name);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, name, updatedAt: Date.now() } : c));
  }, []);

  const moveCanvas = useCallback(async (id: string, folderId: string | null) => {
    await moveCanvasToFolder(id, folderId);
    setCanvases(prev => prev.map(c => c.id === id ? { ...c, folderId, updatedAt: Date.now() } : c));
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
    const affected = canvases.filter(c => c.folderId === id);
    for (const c of affected) await moveCanvasToFolder(c.id, null);
    setFolders(prev => prev.filter(f => f.id !== id));
    setCanvases(prev => prev.map(c => c.folderId === id ? { ...c, folderId: null } : c));
  }, [canvases]);

  const persistCanvas = useCallback(async (id: string, layers: Layer[], activeLayerId: string) => {
    const metas = await getCanvasMetas();
    const meta = metas.find(m => m.id === id);
    if (!meta) return;
    const updatedMeta = {
      ...meta,
      updatedAt: Date.now(),
      thumbnailColor: computeThumbnailColor(layers),
      strokeCount: computeStrokeCount(layers),
    };
    await saveCanvas({ meta: updatedMeta, layers, activeLayerId });
    setCanvases(prev => prev.map(c => c.id === id ? updatedMeta : c));
  }, []);

  const loadCanvasData = useCallback(async (id: string): Promise<CanvasData | null> => {
    return loadCanvas(id);
  }, []);

  return (
    <VaultContext.Provider value={{
      canvases, folders, loading,
      createCanvas, removeCanvas, renameCanvas: renameCanvasFn, moveCanvas, duplicateCanvas,
      createFolder, renameFolder, removeFolder,
      persistCanvas, loadCanvasData, reload,
    }}>
      {children}
    </VaultContext.Provider>
  );
}
