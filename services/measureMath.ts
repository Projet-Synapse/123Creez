/**
 * Outil Mesure : logique pure (aucune dépendance React / RN).
 * Toutes les coordonnées « doc » sont en pixels du document (indépendantes
 * du zoom) ; les coordonnées « écran » sont locales au conteneur du canevas.
 * Convention d'angle : 0° = vers la droite, positif dans le sens
 * trigonométrique À L'ÉCRAN (vers le haut), l'axe Y du document pointant
 * vers le bas.
 */
export interface Pt { x: number; y: number }

export type MeasureMode = 'distance' | 'angle';

/** Distance : a → b. Angle : bras v → a et v → b (v = sommet). */
export interface Measure {
  mode: MeasureMode;
  a: Pt;
  b: Pt | null;
  v: Pt | null;
}

export const SNAP_STEP_DEG = 15;
/** Rayon (px écran) pour attraper une poignée / s'accrocher à un point. */
export const HANDLE_HIT_PX = 22;
export const ENDPOINT_SNAP_PX = 16;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Angle du segment a→b par rapport à l'horizontale, dans [0, 360). */
export function segmentAngleDeg(a: Pt, b: Pt): number {
  if (a.x === b.x && a.y === b.y) return 0;
  return normDeg(Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI);
}

/** Angle non orienté entre les bras v→a et v→b, dans [0, 180]. */
export function angleAtVertex(a: Pt, v: Pt, b: Pt): number {
  const d = Math.abs(segmentAngleDeg(v, a) - segmentAngleDeg(v, b));
  return d > 180 ? 360 - d : d;
}

export function snapAngle(deg: number, step = SNAP_STEP_DEG): number {
  return normDeg(Math.round(deg / step) * step);
}

/** Point à `len` de `from`, dans la direction `deg` (convention ci-dessus). */
export function pointFromPolar(from: Pt, len: number, deg: number): Pt {
  const r = deg * Math.PI / 180;
  return { x: from.x + len * Math.cos(r), y: from.y - len * Math.sin(r) };
}

/** Contraint p sur la direction la plus proche multiple de `step`, autour d'anchor. */
export function snapPointToAngle(anchor: Pt, p: Pt, step = SNAP_STEP_DEG): Pt {
  const len = distance(anchor, p);
  if (len === 0) return { ...p };
  return pointFromPolar(anchor, len, snapAngle(segmentAngleDeg(anchor, p), step));
}

/** Accroche p au candidat le plus proche si à moins de `radius` (même unité). */
export function snapToPoints(p: Pt, candidates: Pt[], radius: number): Pt {
  let best: Pt | null = null;
  let bestD = radius;
  for (const c of candidates) {
    const d = distance(p, c);
    if (d <= bestD) { best = c; bestD = d; }
  }
  return best ? { ...best } : p;
}

/** Extrémités d'une mesure (pour enchaîner des segments). */
export function measureEndpoints(m: Measure | null): Pt[] {
  if (!m) return [];
  const out: Pt[] = [m.a];
  if (m.b) out.push(m.b);
  if (m.v) out.push(m.v);
  return out;
}

/** Saisie numérique, distance : B recalculé depuis A. */
export function setDistanceFromInput(m: Measure, len: number, deg: number): Measure {
  if (!isFinite(len) || len < 0 || !isFinite(deg)) return m;
  return { ...m, b: pointFromPolar(m.a, len, deg) };
}

/**
 * Saisie numérique, angle : le bras v→b est tourné pour former `deg` avec
 * v→a (même côté qu'avant), sa longueur devient `armLen` (ou reste).
 */
export function setAngleFromInput(m: Measure, deg: number, armLen?: number): Measure {
  if (!m.v || !m.b || !isFinite(deg)) return m;
  const base = segmentAngleDeg(m.v, m.a);
  const cur = segmentAngleDeg(m.v, m.b);
  const side = normDeg(cur - base) <= 180 ? 1 : -1;
  const len = armLen !== undefined && isFinite(armLen) && armLen >= 0 ? armLen : distance(m.v, m.b);
  return { ...m, b: pointFromPolar(m.v, len, base + side * Math.max(0, Math.min(180, deg))) };
}

/** Segments à tracer pour « Tracer » (doc). Vide si la mesure est incomplète. */
export function measureToLines(m: Measure | null): Array<{ from: Pt; to: Pt }> {
  if (!m || !m.b) return [];
  if (m.mode === 'distance') {
    return distance(m.a, m.b) > 0 ? [{ from: m.a, to: m.b }] : [];
  }
  if (!m.v) return [];
  return [{ from: m.v, to: m.a }, { from: m.v, to: m.b }].filter(l => distance(l.from, l.to) > 0);
}

/** Paramètres de vue : pan/zoom (écran) puis viewBox « meet » (k, offset). */
export interface ViewParams { scale: number; tx: number; ty: number; k: number; offX: number; offY: number }

export function viewParams(scale: number, tx: number, ty: number, zoneW: number, zoneH: number, docW: number, docH: number): ViewParams {
  const k = Math.min(zoneW / docW, zoneH / docH);
  return { scale, tx, ty, k, offX: (zoneW - docW * k) / 2, offY: (zoneH - docH * k) / 2 };
}

export function docToScreen(p: Pt, v: ViewParams): Pt {
  return { x: v.tx + v.scale * (v.offX + v.k * p.x), y: v.ty + v.scale * (v.offY + v.k * p.y) };
}

export function screenToDoc(p: Pt, v: ViewParams): Pt {
  return { x: ((p.x - v.tx) / v.scale - v.offX) / v.k, y: ((p.y - v.ty) / v.scale - v.offY) / v.k };
}

/** Pixels écran → pixels doc (pour les rayons de prise/accroche). */
export function screenLenToDoc(px: number, v: ViewParams): number {
  return px / (v.scale * v.k);
}

export function formatLen(px: number): string {
  return `${Math.round(px * 10) / 10} px`;
}
export function formatDeg(d: number): string {
  return `${Math.round(d * 10) / 10}°`;
}
