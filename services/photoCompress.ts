// Fonctions pures (testables sous node) pour la recompression des photos.

/** Côté long maximal d'une photo importée sur un calque. */
export const PHOTO_MAX_SIDE = 2048;
/** Qualité JPEG (0–1) quand l'image n'a pas de transparence. */
export const PHOTO_JPEG_QUALITY = 0.85;

/** Dimensions cibles : ratio conservé, côté long ≤ maxSide, jamais agrandie. */
export function fitPhotoSize(w: number, h: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: maxSide, height: maxSide };
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Vrai si au moins un pixel RGBA n'est pas totalement opaque. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

/** Un JPEG ne peut pas avoir de transparence : inutile de lire les pixels. */
export function mimeMayHaveAlpha(mime: string): boolean {
  return !/jpe?g/i.test(mime);
}
