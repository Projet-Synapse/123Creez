// Instantané raster du Svg du canevas (web / Electron) : seule la TOILE
// (le viewBox du Svg) est sérialisée, puis dessinée dans un <canvas> de
// docW × docH px, soit un pixel par pixel de document, sans lissage
// (imageSmoothingEnabled = false, photos en image-rendering pixelated).
// Aucune donnée du dessin n'est modifiée.
import type { RasterScene } from './pixelRaster';
import { docRasterSize } from './pixelGrid';

/** Web : URL data:image/png de docW × docH px. */
export type PixelSnapshot = string;

export interface PixelSnapshotRequest {
  /** Vue qui contient le Svg du canevas. */
  node: unknown;
  scene: RasterScene;
}

export async function capturePixelSnapshot(req: PixelSnapshotRequest): Promise<PixelSnapshot | null> {
  const host = req.node as HTMLElement | null;
  const svg = host?.querySelector?.('svg');
  if (!svg) return null;
  const { docW, docH } = req.scene;
  const { w: outW, h: outH } = docRasterSize(docW, docH);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Le viewBox couvre exactement la toile : rendu docW × docH sans bandes.
  clone.setAttribute('viewBox', `0 0 ${docW} ${docH}`);
  clone.setAttribute('preserveAspectRatio', 'none');
  clone.setAttribute('width', String(outW));
  clone.setAttribute('height', String(outH));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  // Photos : plus proche voisin, pas de lissage bilinéaire au rendu du Svg.
  clone.querySelectorAll('image').forEach(el => {
    el.setAttribute('image-rendering', 'optimizeSpeed');
    el.setAttribute('style', `${el.getAttribute('style') ?? ''};image-rendering:pixelated`);
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, outW, outH);
  return canvas.toDataURL('image/png');
}

/** Web : pas de surface gardée, chaque instantané est complet. */
export function canRenderIncrementally(_scene: RasterScene): boolean {
  return false;
}

/** Web : rien à libérer (URL data:). */
export function releasePixelSnapshotCache(): void {}

/** Web : rien à libérer (URL data:). */
export function disposePixelSnapshot(_img: PixelSnapshot): void {}
