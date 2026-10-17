// Raster thumbnail generation for the vault.
//
// The strokes are vector data, so the preview is drawn by serializing the
// same SVG structure the editor paints (fills, eraser masks, quadratic
// paths) into a data URL, rasterizing it through an offscreen canvas and
// compressing to JPEG. Fully self-contained — no DOM measuring, no
// view-shot — so it behaves identically in the browser and in Electron.
import { Layer } from '@/contexts/CanvasContext';

function strokeLinecap(tool: string): 'square' | 'round' {
  return tool === 'pencil' ? 'square' : 'round';
}

function strokeToSvgPath(
  stroke: { points: { x: number; y: number }[]; size: number; tool: string },
  color: string,
  extra = '',
): string | null {
  const pts = stroke.points;
  if (pts.length === 0) return null;
  const esc = color.replace(/"/g, '&quot;');
  if (pts.length === 1) {
    // Single point → a dot the size of the stroke.
    const r = Math.max(0.5, stroke.size / 2);
    return `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="${r}" fill="${esc}"/>`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return `<path d="${d}" fill="none" stroke="${esc}"${extra ? ' ' + extra : ''}/>`;
}

/** Construit le document SVG du contenu (partagé vignette / export).
    background : 'white' (défaut) ou 'none' (transparence réelle). */
export function buildCanvasSvg(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  background: 'white' | 'none' = 'white',
): string {
  const body: string[] = background === 'none'
    ? []
    : [`<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="#ffffff"/>`];

  for (const layer of layers) {
    if (!layer.visible || layer.strokes.length === 0) continue;
    const draws = layer.strokes.filter(s => s.tool !== 'fill' && s.tool !== 'eraser');
    const erasers = layer.strokes.filter(s => s.tool === 'eraser');
    const fills = layer.strokes.filter(s => s.tool === 'fill');

    // Images du calque : sous les traits (même ordre que CanvasArt).
    for (const img of layer.images ?? []) {
      body.push(`<image href="${img.src.replace(/&/g, '&amp;')}" x="${img.x}" y="${img.y}" width="${img.width}" height="${img.height}" preserveAspectRatio="none"/>`);
    }

    for (const f of fills) {
      body.push(`<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="${f.color}" opacity="${f.opacity}"/>`);
    }

    const paths = draws
      .map(s => strokeToSvgPath(s, s.color, `stroke-width="${s.size}" stroke-opacity="${s.opacity}" stroke-linecap="${strokeLinecap(s.tool)}" stroke-linejoin="round"`))
      .filter(Boolean)
      .join('');

    let group = '';
    if (erasers.length > 0) {
      const maskId = `thumb-mask-${layer.id.replace(/[^a-zA-Z0-9-]/g, '')}`;
      const cuts = erasers
        .map(s => strokeToSvgPath(s, 'black', `stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"`))
        .filter(Boolean)
        .join('');
      group =
        `<defs><mask id="${maskId}" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}">` +
        `<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="white"/>${cuts}` +
        `</mask></defs><g mask="url(#${maskId})" opacity="${layer.opacity}">${paths}</g>`;
    } else {
      group = `<g opacity="${layer.opacity}">${paths}</g>`;
    }
    body.push(group);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">${body.join('')}</svg>`;
}

/** SVG dataURL → bitmap via un canvas hors écran. skipBackground : ne peint
    pas la couche blanche (export transparent). */
async function rasterizeSvg(svg: string, w: number, h: number, mime: string, quality: number, skipBackground = false): Promise<string | null> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('svg load failed'));
    if (typeof image.decode === 'function') image.decode().then(resolve, () => { /* onload fallback */ });
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (!skipBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(image, 0, 0, w, h);
  return canvas.toDataURL(mime, quality);
}

/** Rasterise le contenu en PNG pleine résolution (export dossier vault).
    transparentBg : aucune couche de fond — le PNG garde sa transparence. */
export async function renderFullPng(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  transparentBg = false,
): Promise<string | null> {
  try {
    // Plafond mémoire : au-delà de 4K on dégrade proprement au 4K.
    const cap = 4096;
    const w = Math.min(canvasWidth, cap);
    const h = Math.round(w * (canvasHeight / Math.max(1, canvasWidth)));
    const svg = buildCanvasSvg(layers, canvasWidth, canvasHeight, transparentBg ? 'none' : 'white');
    return await rasterizeSvg(svg, w, h, 'image/png', 1, transparentBg);
  } catch {
    return null;
  }
}

/** Renders the canvas content to a JPEG data URL (white background). */
export async function renderThumbnail(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  maxWidth = 320,
): Promise<string | null> {
  try {
    const w = Math.max(1, Math.round(Math.min(maxWidth, canvasWidth)));
    const h = Math.max(1, Math.round(w * (canvasHeight / Math.max(1, canvasWidth))));
    const svg = buildCanvasSvg(layers, canvasWidth, canvasHeight);
    return await rasterizeSvg(svg, w, h, 'image/jpeg', 0.8);
  } catch {
    return null;
  }
}
