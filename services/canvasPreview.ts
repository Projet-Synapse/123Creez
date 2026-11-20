// Infos d'aperçu d'une toile (galerie), sans ouvrir l'espace de travail.
// Logique pure : testable à part (services/__tests__/canvasPreview.test.ts).

export const PREVIEW_MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
] as const;

/** Date + heure locales, en français, ex. « 20 nov. 2026, 16:20 ». */
export function formatPreviewDate(ts: number): string {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = PREVIEW_MONTHS_FR[d.getMonth()] ?? '';
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

/** Dimensions affichées, ex. « 1000 × 700 px ». */
export function formatPreviewDimensions(width: number, height: number): string {
  return `${width} × ${height} px`;
}

/** Taille de stockage, mêmes unités que le coffre. */
export function formatPreviewSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function formatPreviewLayerCount(count: number): string {
  return count <= 1 ? `${count} calque` : `${count} calques`;
}

export interface CanvasPreviewMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  folderId?: string | null;
  drawingTime?: number;
}

export interface CanvasPreviewExtras {
  folderName?: string | null;
  layerCount?: number | null;
  dataBytes?: number | null;
  drawingTimeLabel?: string | null;
}

export interface PreviewInfoRow {
  key: string;
  label: string;
  value: string;
}

export interface CanvasPreviewInfo {
  name: string;
  rows: PreviewInfoRow[];
}

/** Construit les lignes d'infos de l'écran d'aperçu (français). */
export function buildCanvasPreview(
  meta: CanvasPreviewMeta,
  extras: CanvasPreviewExtras = {},
): CanvasPreviewInfo {
  const rows: PreviewInfoRow[] = [
    { key: 'created', label: 'Création', value: formatPreviewDate(meta.createdAt) },
  ];
  if (meta.updatedAt > meta.createdAt + 1000) {
    rows.push({ key: 'updated', label: 'Modification', value: formatPreviewDate(meta.updatedAt) });
  }
  rows.push({
    key: 'dimensions',
    label: 'Dimensions',
    value: formatPreviewDimensions(meta.width, meta.height),
  });
  if (extras.layerCount != null && extras.layerCount >= 0) {
    rows.push({ key: 'layers', label: 'Calques', value: formatPreviewLayerCount(extras.layerCount) });
  }
  if (extras.folderName) {
    rows.push({ key: 'folder', label: 'Dossier', value: extras.folderName });
  }
  if (extras.dataBytes != null && extras.dataBytes > 0) {
    rows.push({ key: 'size', label: 'Taille', value: formatPreviewSize(extras.dataBytes) });
  }
  if (extras.drawingTimeLabel) {
    rows.push({ key: 'time', label: 'Temps de dessin', value: extras.drawingTimeLabel });
  }
  return { name: meta.name, rows };
}
