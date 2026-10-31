import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readImageSize } from '@/services/vaultFolderService';
import { fitPhotoSize, hasTransparency, mimeMayHaveAlpha, PHOTO_JPEG_QUALITY } from '@/services/photoCompress';

export { fitPhotoSize, PHOTO_MAX_SIDE } from '@/services/photoCompress';

export interface PickedPhoto { src: string; width: number; height: number }

/** Web : canvas HTML (redimensionnement + test alpha + encodage). */
async function recompressWeb(src: string, mime: string): Promise<PickedPhoto> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new (globalThis as any).Image() as HTMLImageElement;
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const { width, height } = fitPhotoSize(img.naturalWidth, img.naturalHeight);
  const doc = (globalThis as any).document;
  const canvas = doc.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const alpha = mimeMayHaveAlpha(mime) && hasTransparency(ctx.getImageData(0, 0, width, height).data);
  const out = alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
  return { src: out, width, height };
}

/** Natif : Skia (déjà embarqué pour la vue pixélisée). */
async function recompressNative(base64: string, mime: string): Promise<PickedPhoto> {
  const { Skia, ImageFormat } = await import('@shopify/react-native-skia');
  const data = Skia.Data.fromBase64(base64);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('image illisible');
  const { width, height } = fitPhotoSize(image.width(), image.height());
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('surface indisponible');
  const canvas = surface.getCanvas();
  canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, width, height), Skia.Paint());
  surface.flush();
  const scaled = surface.makeImageSnapshot();
  let alpha = false;
  if (mimeMayHaveAlpha(mime)) {
    const px = scaled.readPixels();
    alpha = px ? hasTransparency(px as ArrayLike<number>) : true; // doute → PNG
  }
  const out = alpha
    ? `data:image/png;base64,${scaled.encodeToBase64(ImageFormat.PNG, 100)}`
    : `data:image/jpeg;base64,${scaled.encodeToBase64(ImageFormat.JPEG, Math.round(PHOTO_JPEG_QUALITY * 100))}`;
  return { src: out, width, height };
}

/**
 * Sélecteur d'image → photo recompressée (côté long ≤ 2048 px, JPEG ~0,85,
 * PNG conservé si transparence) en dataURL. Le dataURL part dans le JSON de
 * la toile, donc il est synchronisé comme le reste du dessin. En cas d'échec
 * de recompression, l'original est gardé (import jamais bloqué).
 */
export async function pickImageAsDataUrl(): Promise<PickedPhoto | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  let src = asset.uri;
  if (!src) return null;
  const mime = asset.mimeType || (src.startsWith('data:') ? src.slice(5, src.indexOf(';')) : 'image/png');
  let base64: string | null = null;
  if (!src.startsWith('data:')) {
    base64 = await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 });
    src = `data:${mime};base64,${base64}`;
  }
  try {
    if (Platform.OS === 'web') return await recompressWeb(src, mime);
    return await recompressNative(base64 ?? src.slice(src.indexOf(',') + 1), mime);
  } catch (e) {
    console.error('[calques] recompression impossible, original conservé', e);
    const dims = await readImageSize(src);
    return { src, ...fitPhotoSize(dims.width, dims.height) };
  }
}
