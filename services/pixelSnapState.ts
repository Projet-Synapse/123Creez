// État de l'instantané de la vue pixélisée (logique PURE, sans React
// Native, testée dans services/__tests__/pixelSnapState.test.ts).
//
// Chaque instantané est associé à la scène (RasterScene) d'où il a été tiré :
// cette scène est sa « version ». La vue pixélisée ne s'affiche que si cette
// version est celle de la toile À L'INSTANT, jamais un ancien état du dessin.
import { planIncremental, type RasterScene } from './pixelRaster';

/** Reconstruction normale : une image après le changement. */
export const PIXEL_REBUILD_FAST_MS = 16;
/** Changements rapprochés (curseur d'opacité, roue…) : on attend le calme. */
export const PIXEL_REBUILD_DEBOUNCE_MS = 150;
/** Délai avant un nouvel essai après un échec de l'instantané. */
export const PIXEL_RETRY_MS = 400;
/** Nombre de nouveaux essais pour une même scène. */
export const PIXEL_MAX_RETRIES = 2;

export interface VersionedSnapshot<I> {
  image: I;
  /** Scène d'où vient l'image (sa version). */
  scene: RasterScene;
}

/** L'instantané correspond-il à la scène actuelle ? */
export function snapshotIsCurrent<I>(snap: VersionedSnapshot<I> | null, scene: RasterScene | null): boolean {
  return !!snap && !!scene && snap.scene === scene;
}

/**
 * Les deux scènes donnent-elles exactement le même raster ? (calque renommé,
 * calque actif changé, scène recréée à l'identique après un export…). Dans ce
 * cas l'image existante est simplement reprise sous la nouvelle version.
 */
export function sceneRendersSame(a: RasterScene, b: RasterScene): boolean {
  const ops = planIncremental(a, b);
  return ops !== null && ops.length === 0;
}

/**
 * Délai avant de reconstruire l'instantané. `gapMs` : temps écoulé entre ce
 * changement de scène et le précédent (null : premier). Une mise à jour
 * incrémentale (un trait ajouté) est toujours immédiate ; un rendu complet
 * qui suit de près un autre changement attend PIXEL_REBUILD_DEBOUNCE_MS.
 */
export function pixelRebuildDelay(gapMs: number | null, incremental: boolean): number {
  if (incremental) return PIXEL_REBUILD_FAST_MS;
  if (gapMs !== null && gapMs >= 0 && gapMs < PIXEL_REBUILD_DEBOUNCE_MS) return PIXEL_REBUILD_DEBOUNCE_MS;
  return PIXEL_REBUILD_FAST_MS;
}

/** Après `failures` échecs consécutifs pour une scène, faut-il réessayer ? */
export function shouldRetryPixelSnapshot(failures: number): boolean {
  return failures >= 1 && failures <= PIXEL_MAX_RETRIES;
}

/** La vue pixélisée est-elle affichée ? */
export function pixelViewVisible<I>(opts: {
  eligible: boolean;
  gesture: boolean;
  suppressed: boolean;
  snap: VersionedSnapshot<I> | null;
  scene: RasterScene | null;
}): boolean {
  return opts.eligible && !opts.gesture && !opts.suppressed && snapshotIsCurrent(opts.snap, opts.scene);
}
