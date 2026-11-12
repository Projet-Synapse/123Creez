// Construction du chemin SVG d'un trait (logique PURE, sans React Native),
// partagée par le rendu Svg (CanvasArt) et l'instantané raster de la vue
// pixélisée (services/pixelRaster.ts) : les deux dessinent exactement la
// même courbe.

export interface StrokeLike {
  tool: string;
  points: { x: number; y: number }[];
}

export function buildSvgPath(stroke: StrokeLike, dx = 0, dy = 0): string {
  if (stroke.tool === 'fill') return '';
  const pts = stroke.points;
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x + dx} ${pts[0].y + dy} L ${pts[0].x + dx + 0.1} ${pts[0].y + dy + 0.1}`;
  }
  let d = `M ${pts[0].x + dx} ${pts[0].y + dy}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2 + dx;
    const my = (prev.y + curr.y) / 2 + dy;
    d += ` Q ${prev.x + dx} ${prev.y + dy} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x + dx} ${last.y + dy}`;
  return d;
}

/** Bout de trait : carré pour le crayon, rond pour le reste. */
export function strokeLinecap(tool: string): 'round' | 'square' {
  return tool === 'pencil' ? 'square' : 'round';
}
