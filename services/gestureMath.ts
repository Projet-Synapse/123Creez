// Calculs purs des gestes de la zone de dessin (pan / pinch), sans
// dépendance React : testables à part (services/__tests__/gestureMath.test.ts).

/** Bornes des curseurs de sensibilité (multiplicateurs). 1 = comportement d'origine. */
export const SENSITIVITY_MIN = 0.25;
export const SENSITIVITY_MAX = 3;

/** Ramène une sensibilité lue des réglages dans les bornes ; 1 si invalide. */
export function clampSensitivity(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, n));
}

/** Déplacement du milieu des deux doigts multiplié par la sensibilité. */
export function scalePan(delta: number, sensitivity: unknown): number {
  return delta * clampSensitivity(sensitivity);
}

/**
 * Rapport de pinch (distance actuelle / distance de départ) ajusté :
 * ratio^s. s=1 → identique ; s>1 → zoom plus rapide ; s<1 → plus lent.
 * L'exposant garde la symétrie zoom avant / arrière (1/r → 1/r^s).
 */
export function scalePinchRatio(ratio: number, sensitivity: unknown): number {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 1;
  return Math.pow(ratio, clampSensitivity(sensitivity));
}

/** Facteur d'un cran de molette / bouton (ex. 1.08) ajusté de la même façon. */
export function scaleZoomStep(factor: number, sensitivity: unknown): number {
  return scalePinchRatio(factor, sensitivity);
}

/** Seuil de zoom à partir duquel la vue pixélisée remplace la vue lisse. */
export const PIXEL_VIEW_MIN_ZOOM = 1.5;
/** Au-delà de ce nombre de pixels de document, pas de vue pixélisée (mémoire). */
export const PIXEL_VIEW_MAX_PIXELS = 16_000_000;

/** La vue pixélisée doit-elle s'afficher ? (pure, sans état d'interaction) */
export function pixelViewEligible(
  mode: unknown, zoom: number, docW: number, docH: number,
): boolean {
  if (mode !== 'pixelated') return false;
  if (!(zoom >= PIXEL_VIEW_MIN_ZOOM)) return false;
  if (!(docW > 0 && docH > 0)) return false;
  return docW * docH <= PIXEL_VIEW_MAX_PIXELS;
}

/**
 * Rectangle (en px de zone) où la toile est dessinée par le viewBox
 * « xMidYMid meet » du Svg : même calcul que react-native-svg.
 */
export function meetFitRect(zoneW: number, zoneH: number, docW: number, docH: number) {
  const k = Math.min(zoneW / docW, zoneH / docH);
  const w = docW * k;
  const h = docH * k;
  return { x: (zoneW - w) / 2, y: (zoneH - h) / 2, w, h, k };
}

// ─── Rotation de la VUE (affichage seul, jamais le dessin) ─────────────
// La zone (largeur w × hauteur h) est tournée de `deg` autour de son centre.
// Les gestes arrivent en coordonnées écran : on les « dé-tourne » avant la
// chaîne habituelle pan/zoom → toile.

/** Angle ramené dans ]-180, 180]. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = (deg % 360) + 0;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** Angle (degrés) du vecteur doigt 1 → doigt 2. */
export function touchAngle(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

/** Tourne un vecteur de `deg` degrés. */
export function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Point écran (local à la zone) → point dans la zone NON tournée. */
export function unrotatePoint(x: number, y: number, w: number, h: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const cx = w / 2;
  const cy = h / 2;
  const v = rotateVec(x - cx, y - cy, -deg);
  return { x: cx + v.x, y: cy + v.y };
}

/** Seuil (°) avant que la rotation ne démarre : un pinch-zoom ne tourne pas. */
export const ROTATE_DEADZONE_DEG = 8;
/** Aimantage (°) vers 0 / 90 / 180 / 270. */
export const ROTATE_SNAP_DEG = 6;

/** Aimante l'angle vers le multiple de 90° le plus proche s'il en est à moins de `snap`. */
export function snapAngle(deg: number, snap = ROTATE_SNAP_DEG): number {
  const a = normalizeAngle(deg);
  const q = Math.round(a / 90) * 90;
  return Math.abs(a - q) <= snap ? normalizeAngle(q) + 0 : a; // +0 : pas de -0
}
