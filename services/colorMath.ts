// Math pure du sélecteur de couleur (onglet Couleur → Roue) : conversions
// hex ↔ rgb ↔ hsv, anneau de teinte, losange saturation / valeur.
// Aucune dépendance React : testé par services/__tests__/colorMath.test.ts.

export type RGB = [number, number, number]; // 0–255 entiers
export type HSV = [number, number, number]; // h 0–360, s 0–1, v 0–1

export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const clamp01 = (n: number) => clamp(n, 0, 1);

// ─── hex ↔ rgb ───────────────────────────────────────────────────────────────
/** « #abc », « abc », « #AABBCC » → « #aabbcc » ; null si invalide. */
export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}

export function hexToRgb(hex: string): RGB {
  const n = normalizeHex(hex) ?? '#000000';
  return [
    parseInt(n.slice(1, 3), 16),
    parseInt(n.slice(3, 5), 16),
    parseInt(n.slice(5, 7), 16),
  ];
}

export function rgbToHex([r, g, b]: RGB): string {
  const p = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

// ─── rgb ↔ hsv ───────────────────────────────────────────────────────────────
export function rgbToHsv([r8, g8, b8]: RGB): HSV {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s), vv = clamp01(v);
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(hsvToRgb(h, s, v));
}

export function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex));
}

/**
 * hex → hsv sans « perdre » la teinte (ni la saturation) quand la couleur
 * ne la porte plus : sur un gris, H est indéfini ; sur un noir, H et S le
 * sont. On garde alors celles d'avant pour que l'anneau et le losange ne
 * sautent pas (ex. descendre R/G/B à 0 puis remonter).
 */
export function hexToHsvKeep(hex: string, prev: HSV): HSV {
  const [h, s, v] = hexToHsv(hex);
  if (v === 0) return [prev[0], prev[1], 0];
  if (s === 0) return [prev[0], 0, v];
  return [h, s, v];
}

// ─── Anneau de teinte ────────────────────────────────────────────────────────
// Repère écran (Y vers le bas), centre de la roue en (0, 0). Teinte 0° à
// droite, croissante dans le sens des aiguilles d'une montre (comme le
// dessin des segments de l'anneau).

/** Vecteur depuis le centre → teinte 0–360. */
export function angleToHue(dx: number, dy: number): number {
  let h = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h >= 360 ? 0 : h;
}

/** Teinte → point sur un cercle de rayon r (centre en 0, 0). */
export function hueToPoint(h: number, r: number): { x: number; y: number } {
  const a = (h * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

// ─── Géométrie de la roue ────────────────────────────────────────────────────
export type WheelGeometry = {
  size: number;      // côté du widget (px)
  r: number;         // rayon extérieur de l'anneau
  innerR: number;    // rayon intérieur de l'anneau
  ringMid: number;   // rayon où se pose le curseur de teinte
  half: number;      // demi-diagonale du losange (centre → sommet)
};

export const WHEEL_MIN = 120;
export const WHEEL_MAX = 210;

/** Taille de roue pour une largeur utile donnée (panneau 150–248 px). */
export function wheelSizeFor(availableWidth: number): number {
  return Math.round(clamp(availableWidth, WHEEL_MIN, WHEEL_MAX));
}

export function wheelGeometry(size: number): WheelGeometry {
  const r = size / 2;
  // Anneau assez épais pour le doigt (≥ 16 px), proportionné au-delà.
  const ring = Math.max(16, Math.round(size * 0.13));
  const innerR = r - ring;
  const half = innerR - Math.max(3, Math.round(size * 0.03));
  return { size, r, innerR, ringMid: r - ring / 2, half };
}

/**
 * Zone touchée au début d'un geste : l'anneau (couronne extérieure) ou le
 * losange (tout l'intérieur du trou, le thumb y est ensuite clampé). Le
 * geste garde cette zone jusqu'au lâcher.
 */
export function wheelZone(dx: number, dy: number, g: WheelGeometry): 'ring' | 'diamond' {
  return Math.hypot(dx, dy) >= g.innerR - 2 ? 'ring' : 'diamond';
}

// ─── Losange saturation / valeur ─────────────────────────────────────────────
// C'est le carré S/V classique tourné de 45° (façon IbisPaint) : dans le
// repère du carré, S croît vers la droite (blanc → teinte pleine) et V vers
// le haut (noir → clair). Une fois tourné :
//   sommet haut  = S 0, V 1 (blanc)
//   sommet droit = S 1, V 1 (teinte pleine)
//   sommet bas   = S 1, V 0 (noir)
//   sommet gauche= S 0, V 0 (noir)
// `half` = distance centre → sommet. Repère écran, centre en (0, 0).

/** (S, V) → point dans le losange. */
export function svToDiamond(s: number, v: number, half: number): { x: number; y: number } {
  const ss = clamp01(s), vv = clamp01(v);
  return { x: half * (ss + vv - 1), y: half * (ss - vv) };
}

/** Point (n'importe où) → (S, V), clampé au losange. */
export function diamondToSv(x: number, y: number, half: number): { s: number; v: number } {
  if (half <= 0) return { s: 0, v: 0 };
  return {
    s: clamp01((x + y + half) / (2 * half)),
    v: clamp01((x - y + half) / (2 * half)),
  };
}

/** Ramène un point dans le losange (|x| + |y| ≤ half). */
export function clampToDiamond(x: number, y: number, half: number): { x: number; y: number } {
  const { s, v } = diamondToSv(x, y, half);
  return svToDiamond(s, v, half);
}

// ─── RVB ─────────────────────────────────────────────────────────────────────
/** Remplace un canal (0 = R, 1 = G, 2 = B), clampé à 0–255 entier. */
export function setChannel(rgb: RGB, channel: 0 | 1 | 2, value: number): RGB {
  const next: RGB = [rgb[0], rgb[1], rgb[2]];
  next[channel] = Math.round(clamp(value, 0, 255));
  return next;
}
