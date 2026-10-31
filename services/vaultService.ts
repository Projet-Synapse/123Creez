// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preserveUnknownFields } from './preserveUnknown';
import { Layer } from '@/contexts/CanvasContext';

export interface CanvasMeta {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  thumbnailColor: string;
  strokeCount: number;
  /** Raster preview (JPEG data URL) rendered from the strokes — generated
      lazily by the vault so older canvases get one too. */
  thumbnail?: string;
  /** Timestamp of the thumbnail generation; a canvas is stale when
      updatedAt > thumbAt. */
  thumbAt?: number;
  /** Manual sort position (drag & drop). Lower = earlier. */
  order?: number;
  /** Fond transparent : l'arrière-plan (éditeur, vignette, export PNG) est
      traité comme transparent — représenté par un damier gris à l'écran. */
  transparentBg?: boolean;
  /** Temps de dessin cumulé (secondes), affiché dans la galerie. */
  drawingTime?: number;
}

export interface CanvasData {
  meta: CanvasMeta;
  layers: Layer[];
  activeLayerId: string;
  /** Groupes organisationnels de calques (absent sur les anciennes toiles). */
  groups?: import('@/contexts/CanvasContext').LayerGroup[];
}

export type FolderPreviewMode = 'recent' | 'mosaic' | 'classic';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  color: string;
  /** Manual sort position (drag & drop). Lower = earlier. */
  order?: number;
  /** How the folder card shows its content (per-folder preference). */
  previewMode?: FolderPreviewMode;
  /** Dernière modification (ms) : nom, couleur, aperçu, ordre, parent. Sert
   *  à la synchro « le plus récent gagne » (absent sur les anciens dossiers). */
  updatedAt?: number;
}

const KEYS = {
  CANVASES: 'vault:canvases',
  CANVAS_DATA: (id: string) => `vault:canvas:${id}`,
  FOLDERS: 'vault:folders',
};

export async function getFolders(): Promise<Folder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveFolder(folder: Folder): Promise<void> {
  const folders = await getFolders();
  const idx = folders.findIndex(f => f.id === folder.id);
  if (idx >= 0) folders[idx] = folder;
  else folders.push(folder);
  await AsyncStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await getFolders();
  await AsyncStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders.filter(f => f.id !== id)));
}

export async function getCanvasMetas(): Promise<CanvasMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CANVASES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveCanvasMetas(metas: CanvasMeta[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CANVASES, JSON.stringify(metas));
}

export async function loadCanvas(id: string): Promise<CanvasData | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CANVAS_DATA(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveCanvas(data: CanvasData): Promise<void> {
  // Ne jamais effacer les champs ajoutés par une version plus récente.
  let prev: unknown = null;
  try {
    const raw = await AsyncStorage.getItem(KEYS.CANVAS_DATA(data.meta.id));
    prev = raw ? JSON.parse(raw) : null;
  } catch { prev = null; }
  data = preserveUnknownFields(data, prev);
  await AsyncStorage.setItem(KEYS.CANVAS_DATA(data.meta.id), JSON.stringify(data));
  const metas = await getCanvasMetas();
  const idx = metas.findIndex(m => m.id === data.meta.id);
  if (idx >= 0) metas[idx] = data.meta;
  else metas.push(data.meta);
  await saveCanvasMetas(metas);
}

export async function deleteCanvas(id: string): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CANVAS_DATA(id));
  const metas = await getCanvasMetas();
  await saveCanvasMetas(metas.filter(m => m.id !== id));
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  const metas = await getCanvasMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  meta.name = name;
  meta.updatedAt = Date.now();
  await saveCanvasMetas(metas);
  const data = await loadCanvas(id);
  if (data) {
    data.meta.name = name;
    data.meta.updatedAt = Date.now();
    await AsyncStorage.setItem(KEYS.CANVAS_DATA(id), JSON.stringify(data));
  }
}

export async function moveCanvasToFolder(id: string, folderId: string | null): Promise<void> {
  const metas = await getCanvasMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  meta.folderId = folderId;
  meta.updatedAt = Date.now();
  await saveCanvasMetas(metas);
}

export async function setCanvasThumbnail(id: string, thumbnail: string): Promise<void> {
  const metas = await getCanvasMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  meta.thumbnail = thumbnail;
  meta.thumbAt = Date.now();
  await saveCanvasMetas(metas);
}

/** Cumule le temps de dessin (secondes) d'une toile — meta + data. */
export async function addCanvasDrawingTime(id: string, seconds: number): Promise<void> {
  const metas = await getCanvasMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  meta.drawingTime = (meta.drawingTime ?? 0) + seconds;
  await saveCanvasMetas(metas);
  const data = await loadCanvas(id);
  if (data) {
    data.meta.drawingTime = meta.drawingTime;
    await AsyncStorage.setItem(KEYS.CANVAS_DATA(id), JSON.stringify(data));
  }
}

/** « 1 h 05 », « 12 min », « 40 s » — affichage galerie. */
export function formatDrawingTime(seconds?: number): string {
  if (!seconds || seconds < 60) return `${Math.floor(seconds ?? 0)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Bascule le fond transparent (damier) d'une toile — meta + data. */
export async function setCanvasTransparentBg(id: string, value: boolean): Promise<void> {
  const metas = await getCanvasMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  meta.transparentBg = value;
  await saveCanvasMetas(metas);
  const data = await loadCanvas(id);
  if (data) {
    data.meta.transparentBg = value;
    await AsyncStorage.setItem(KEYS.CANVAS_DATA(id), JSON.stringify(data));
  }
}

/** Persists a manual drag & drop ordering (index in the list = order). */
export async function setCanvasOrder(orderedIds: string[]): Promise<void> {
  const metas = await getCanvasMetas();
  const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
  for (const meta of metas) {
    const r = rank.get(meta.id);
    if (r !== undefined) meta.order = r;
  }
  await saveCanvasMetas(metas);
}

export async function setFoldersOrder(orderedIds: string[]): Promise<void> {
  const folders = await getFolders();
  const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
  for (const folder of folders) {
    const r = rank.get(folder.id);
    if (r !== undefined && folder.order !== r) {
      folder.order = r;
      folder.updatedAt = Date.now();
    }
  }
  await AsyncStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
}

/** Range un dossier dans `parentId` (null = racine), en dernière position. */
export async function setFolderParent(id: string, parentId: string | null, order?: number): Promise<Folder | null> {
  const folders = await getFolders();
  const folder = folders.find(f => f.id === id);
  if (!folder) return null;
  folder.parentId = parentId;
  if (order !== undefined) folder.order = order;
  folder.updatedAt = Date.now();
  await AsyncStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
  return folder;
}

export async function setFolderPreviewMode(id: string, mode: FolderPreviewMode): Promise<void> {
  const folders = await getFolders();
  const folder = folders.find(f => f.id === id);
  if (!folder) return;
  folder.previewMode = mode;
  folder.updatedAt = Date.now();
  await saveFolder(folder);
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function createDefaultCanvas(
  name: string,
  folderId: string | null = null,
  width = 1080,
  height = 1920,
): CanvasData {
  const id = generateId('canvas');
  const layerId = `layer-1-${id}`;
  const now = Date.now();
  return {
    meta: { id, name, folderId, createdAt: now, updatedAt: now, width, height, thumbnailColor: '#ffffff', strokeCount: 0 },
    layers: [{ id: layerId, name: 'Calque 1', visible: true, opacity: 1, strokes: [] }],
    activeLayerId: layerId,
  };
}

export function computeThumbnailColor(layers: Layer[]): string {
  for (const layer of [...layers].reverse()) {
    const fills = layer.strokes.filter(s => s.tool === 'fill');
    if (fills.length > 0) return fills[fills.length - 1].color;
  }
  for (const layer of [...layers].reverse()) {
    const drawn = layer.strokes.filter(s => s.tool !== 'eraser' && s.tool !== 'fill');
    if (drawn.length > 0) return drawn[drawn.length - 1].color;
  }
  return '#ffffff';
}

export function computeStrokeCount(layers: Layer[]): number {
  return layers.reduce((sum, l) => sum + l.strokes.filter(s => s.tool !== 'fill').length, 0);
}

// ─── Storage info ─────────────────────────────────────────────────────────────

export async function getStorageInfo(): Promise<{ canvasCount: number; totalSize: number; vaultKeys: string[] }> {
  try {
    const metas = await getCanvasMetas();
    const keys = await AsyncStorage.getAllKeys();
    const vaultKeys = keys.filter(k => k.startsWith('vault:'));
    let totalSize = 0;
    for (const k of vaultKeys) {
      const val = await AsyncStorage.getItem(k);
      if (val) totalSize += val.length * 2; // bytes (UTF-16)
    }
    return { canvasCount: metas.length, totalSize, vaultKeys };
  } catch {
    return { canvasCount: 0, totalSize: 0, vaultKeys: [] };
  }
}

export async function clearAllData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const vaultKeys = keys.filter(k => k.startsWith('vault:') || k === 'app:settings');
  await AsyncStorage.multiRemove(vaultKeys);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}
