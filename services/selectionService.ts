// Geometric helpers for the freeform (lasso) selection.
//
// The lasso stores the hand-drawn polygon in canvas coordinates. Moving the
// selection only translates what lies INSIDE the polygon, so committing a
// move means cutting every stroke along the polygon boundary: the parts
// inside keep a translated copy, the parts outside stay untouched.
import { StrokePath } from '@/contexts/CanvasContext';

export interface Point {
  x: number;
  y: number;
}

/** Ray-casting point-in-polygon test (polygon implicitly closed). */
export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersects = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** First intersection of segment [a→b] with the polygon boundary, as a
    parameter t in [0,1] along the segment (null if no crossing). */
function firstBoundaryCrossing(a: Point, b: Point, poly: Point[]): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const x1 = poly[j].x, y1 = poly[j].y;
    const x2 = poly[i].x, y2 = poly[i].y;
    const ex = x2 - x1, ey = y2 - y1;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((x1 - a.x) * ey - (y1 - a.y) * ex) / denom;
    const u = ((x1 - a.x) * dy - (y1 - a.y) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

interface Run {
  points: Point[];
  inside: boolean;
}

/** Split a stroke's point list into inside/outside runs, cutting at the
    polygon boundary. Lasso vertices are dense (one per pointermove) so a
    single crossing per segment is the common case; the earliest crossing is
    used when a segment crosses the boundary more than once. */
function splitPoints(points: Point[], poly: Point[]): Run[] {
  const runs: Run[] = [];
  if (points.length === 0) return runs;

  let current: Run = { points: [points[0]], inside: pointInPolygon(points[0].x, points[0].y, poly) };
  runs.push(current);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const prevInside = current.inside;
    const currInside = pointInPolygon(curr.x, curr.y, poly);

    if (currInside === prevInside) {
      current.points.push(curr);
      continue;
    }

    const t = firstBoundaryCrossing(prev, curr, poly);
    // Numerical safety: if no crossing was found (degenerate segment right
    // on the boundary), just switch the run at the vertex.
    const cut = t === null
      ? curr
      : { x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t };
    current.points.push(cut);
    current = { points: [cut, curr], inside: currInside };
    runs.push(current);
  }

  return runs.filter(r => r.points.length > 0);
}

let splitCounter = 0;

/** Apply a selection move destructively: every stroke is cut along the
    polygon, inside parts are translated by the selection offset, outside
    parts stay in place. Fill strokes (the background) are never moved.
    Strokes entirely inside/outside pass through unchanged (aside from the
    translation). */
export function splitStrokesByPolygon(
  strokes: StrokePath[],
  poly: Point[],
  offset: Point,
): StrokePath[] {
  if (poly.length < 3 || (offset.x === 0 && offset.y === 0)) return strokes;

  const out: StrokePath[] = [];
  for (const stroke of strokes) {
    if (stroke.tool === 'fill') {
      out.push(stroke);
      continue;
    }
    if (stroke.points.length === 0) {
      out.push(stroke);
      continue;
    }

    const fullyInside = stroke.points.every(p => pointInPolygon(p.x, p.y, poly));
    if (fullyInside) {
      out.push({
        ...stroke,
        points: stroke.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })),
      });
      continue;
    }
    const fullyOutside = stroke.points.every(p => !pointInPolygon(p.x, p.y, poly));
    if (fullyOutside) {
      out.push(stroke);
      continue;
    }

    const runs = splitPoints(stroke.points, poly);
    for (const run of runs) {
      if (run.points.length === 0) continue;
      out.push({
        ...stroke,
        id: `${stroke.id}-s${++splitCounter}`,
        points: run.inside
          ? run.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))
          : run.points,
      });
    }
  }
  return out;
}

/** Distance from a point to a stroke's polyline (in canvas units). */
export function distanceToStroke(x: number, y: number, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    return Math.hypot(points[0].x - x, points[0].y - y);
  }
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].x, ay = points[i - 1].y;
    const bx = points[i].x, by = points[i].y;
    const abx = bx - ax, aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    let t = lenSq > 0 ? ((x - ax) * abx + (y - ay) * aby) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t, py = ay + aby * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}
