// Powered by OnSpace.AI — Miroir explorateur du vault (desktop) et
// utilitaires image partagés (import de toile, toutes plateformes).
//
// Un dossier disque choisi par l'utilisateur est lié au vault :
//  - chaque toile sauvegardée y est exportée en PNG (pleine résolution) ;
//  - les images déposées dedans sont importées comme nouvelles toiles
//    (calque image), puis retirées du dossier (sémantique « déplacer »).
// Les exports de l'app sont reconnaissables à leur suffixe `--<id>.png` et
// ne sont jamais réimportés — sinon la boucle export→import doublerait
// chaque toile à chaque ouverture.
import { Image as RNImage, Platform } from 'react-native';
import { isDesktop, desktop } from '@/services/platform';
import { Layer, LayerImage } from '@/contexts/CanvasContext';

export function vaultFolderAvailable(): boolean {
  return isDesktop() && !!desktop()?.vaultFolder;
}

export async function getVaultFolder(): Promise<string | null> {
  if (!vaultFolderAvailable()) return null;
  return desktop()!.vaultFolder!.get();
}

export async function chooseVaultFolder(): Promise<string | null> {
  if (!vaultFolderAvailable()) return null;
  return desktop()!.vaultFolder!.choose();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\u00C0-\u017F\- ]+/g, '_').trim() || 'toile';
}

/** Les fichiers portant ce suffixe sont nos propres exports : jamais réimportés. */
function isAppExport(fileName: string): boolean {
  return /--canvas-\d+-\d+\.png$/i.test(fileName);
}

/** Exporte une toile en PNG pleine résolution dans le dossier lié. */
export async function exportCanvasToFolder(
  name: string,
  canvasId: string,
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  transparentBg = false,
): Promise<boolean> {
  if (!vaultFolderAvailable()) return false;
  try {
    const { renderFullPng } = await import('@/services/thumbnailService');
    const png = await renderFullPng(layers, canvasWidth, canvasHeight, transparentBg);
    if (!png) return false;
    const fileName = `${sanitizeFileName(name)}--${canvasId}.png`;
    const result = await desktop()!.vaultFolder!.writeImage(fileName, png);
    return !!result.ok;
  } catch {
    return false;
  }
}

/** Dimensionne une image (dataURL, ou fichier natif) sans l'altérer. */
export function readImageSize(src: string): Promise<{ width: number; height: number }> {
  if (Platform.OS !== 'web') {
    // Natif : window.Image n'existe pas — le loader RN décode dataURL et
    // file:// indifféremment.
    return new Promise((resolve, reject) => {
      RNImage.getSize(
        src,
        (width, height) => resolve({ width, height }),
        () => reject(new Error('image load failed')),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

/** Construit un calque image ajusté (contain) dans le format de la toile. */
export function buildImageLayer(
  layerId: string,
  src: string,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
): LayerImage {
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  const width = Math.round(imgW * scale);
  const height = Math.round(imgH * scale);
  return {
    id: `img-${Date.now()}`,
    src,
    x: Math.round((canvasW - width) / 2),
    y: Math.round((canvasH - height) / 2),
    width,
    height,
  };
}
