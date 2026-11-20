// File d'attente : génère une vignette JPEG à partir de la toile, une à la
// fois, hors du rendu de la grille. La galerie affiche un placeholder tant
// que la vignette n'est pas prête — elle ne parse plus le JSON complet pour
// chaque carte.
import type { Layer } from '@/contexts/CanvasContext';
import type { RasterScene } from './pixelRaster';
import { GALLERY_THUMB_MAX_PX, isThumbFresh, type ThumbMeta } from './galleryThumb';
import { loadCanvas, setCanvasThumbnail, type CanvasMeta } from './vaultService';
import { rasterSceneToJpegDataUrl } from './pixelSnapshot';

export type GalleryThumbListener = (id: string, thumbnail: string, thumbAt: number) => void;

let listener: GalleryThumbListener | null = null;

export function setGalleryThumbListener(fn: GalleryThumbListener | null): void {
  listener = fn;
}

const pending = new Set<string>();
const queued: ThumbMeta[] = [];
let running = false;

export function sceneForGalleryThumb(
  layers: Layer[],
  width: number,
  height: number,
  transparentBg?: boolean,
): RasterScene {
  return {
    docW: width,
    docH: height,
    background: transparentBg === true ? { kind: 'checker' } : { kind: 'color', color: '#ffffff' },
    grid: null,
    dots: null,
    layers,
    activeLayerId: layers[0]?.id ?? 'layer-1',
    selection: null,
    transformBox: null,
  };
}

export function enqueueGalleryThumb(meta: ThumbMeta): void {
  if (isThumbFresh(meta)) return;
  if (pending.has(meta.id)) return;
  pending.add(meta.id);
  queued.push(meta);
  void pump();
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queued.length > 0) {
      const meta = queued.shift();
      if (!meta) break;
      try {
        const data = await loadCanvas(meta.id);
        if (!data) continue;
        const scene = sceneForGalleryThumb(
          data.layers,
          data.meta.width,
          data.meta.height,
          data.meta.transparentBg === true,
        );
        const jpeg = await rasterSceneToJpegDataUrl(scene, GALLERY_THUMB_MAX_PX);
        if (!jpeg) continue;
        await setCanvasThumbnail(data.meta.id, jpeg);
        listener?.(data.meta.id, jpeg, Date.now());
      } catch {
        // Une toile qui échoue n'arrête pas les suivantes.
      } finally {
        pending.delete(meta.id);
      }
    }
  } finally {
    running = false;
  }
}

/** Demande une vignette à jour après une sauvegarde (la précédente devient périmée). */
export function enqueueGalleryThumbAfterSave(meta: CanvasMeta): void {
  pending.delete(meta.id);
  enqueueGalleryThumb({ ...meta, thumbnail: undefined, thumbAt: undefined });
}
