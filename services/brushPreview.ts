// Aperçu du pinceau dans le panneau compact : chemin ondulé et bornes
// taille / opacité. Logique pure, testée dans services/__tests__.

/** Plage réelle du pinceau (inchangée côté toile). */
export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 80;
export const BRUSH_OPACITY_MIN = 0.05;
export const BRUSH_OPACITY_MAX = 1;

/** Hauteur du cadre d'aperçu : assez pour lire l'onde, encore compact. */
export const PREVIEW_HEIGHT = 68;
/** Marge entre le bord du trait et le cadre, pour que l'épaisseur ne soit pas coupée. */
export const PREVIEW_EDGE = 2;
/** Nombre de périodes de la sinusoïde (départ et arrivée à mid-hauteur). */
export const PREVIEW_PERIODS = 2;
/** Nombre de segments du polyline (assez pour que l'onde paraisse lisse). */
export const PREVIEW_SAMPLES = 48;

export function clampBrushSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_SIZE_MIN;
  return Math.round(Math.min(BRUSH_SIZE_MAX, Math.max(BRUSH_SIZE_MIN, value)));
}

export function clampBrushOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_OPACITY_MAX;
  const stepped = Math.round(value * 100) / 100;
  return Math.min(BRUSH_OPACITY_MAX, Math.max(BRUSH_OPACITY_MIN, stepped));
}

/**
 * Épaisseur affichée dans le cadre : la taille réelle, ramenée pour que
 * le trait (plus la marge PREVIEW_EDGE de chaque côté) tienne en hauteur.
 */
export function displayStrokeWidth(
  brushSize: number,
  height: number,
  edge: number = PREVIEW_EDGE,
): number {
  const size = clampBrushSize(brushSize);
  const max = Math.max(1, height - 2 * edge);
  return Math.min(size, max);
}

export interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewStroke {
  /** Attribut `d` SVG (`M` puis des `L`). */
  d: string;
  points: PreviewPoint[];
  strokeWidth: number;
  /** Amplitude verticale de la sinusoïde (0 quand le trait remplit le cadre). */
  amplitude: number;
}

function format(n: number): string {
  return n.toFixed(2);
}

function pointsToPath(points: PreviewPoint[]): string {
  if (points.length === 0) return '';
  let d = `M ${format(points[0].x)} ${format(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${format(points[i].x)} ${format(points[i].y)}`;
  }
  return d;
}

/**
 * Chemin ondulé horizontal (sinusoïde, 2 périodes) qui traverse presque
 * toute la largeur. Les points restent assez loin des bords pour que le
 * trait, une fois tracé à `strokeWidth`, tienne dans le cadre.
 */
export function previewStrokePath(
  width: number,
  height: number,
  brushSize: number,
  options?: { periods?: number; samples?: number; edge?: number },
): PreviewStroke {
  const edge = options?.edge ?? PREVIEW_EDGE;
  const periods = options?.periods ?? PREVIEW_PERIODS;
  const samples = Math.max(2, Math.round(options?.samples ?? PREVIEW_SAMPLES));
  const strokeWidth = displayStrokeWidth(brushSize, height, edge);

  if (!(width > 0) || !(height > 0)) {
    return { d: '', points: [], strokeWidth, amplitude: 0 };
  }

  const half = strokeWidth / 2;
  const inset = half + edge;
  const usableW = Math.max(0, width - 2 * inset);
  const amplitude = Math.max(0, height / 2 - inset);
  const left = inset;
  const cy = height / 2;

  const points: PreviewPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    points.push({
      x: left + t * usableW,
      y: cy + amplitude * Math.sin(t * periods * 2 * Math.PI),
    });
  }

  return { d: pointsToPath(points), points, strokeWidth, amplitude };
}
