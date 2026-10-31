import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readImageSize } from '@/services/vaultFolderService';

/** Taille max (côté le plus long) d'une photo de référence posée sur un calque. */
export const PHOTO_MAX_SIDE = 1024;

/** Dimensions d'affichage : ratio conservé, côté le plus long ≤ maxSide. */
export function fitPhotoSize(w: number, h: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: maxSide, height: maxSide };
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/**
 * Sélecteur d'image → dataURL + dimensions (même chemin que l'import de
 * toile du menu : le dataURL est autoporteur et part dans le JSON de la toile,
 * donc il est synchronisé entre appareils comme le reste du dessin).
 */
export async function pickImageAsDataUrl(): Promise<{ src: string; width: number; height: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  let src = asset.uri;
  if (!src) return null;
  if (!src.startsWith('data:')) {
    const base64 = await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 });
    src = `data:${asset.mimeType || 'image/png'};base64,${base64}`;
  }
  const dims = await readImageSize(src);
  return { src, width: dims.width, height: dims.height };
}
