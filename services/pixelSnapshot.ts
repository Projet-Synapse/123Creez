// Instantané raster du Svg du canevas (Android / iOS) via
// react-native-view-shot, à la TAILLE NATIVE de la vue. On ne passe pas
// width/height, car view-shot redimensionnerait en filtrant (flou). La
// réduction à un pixel par pixel de document se fait en Nearest dans
// PixelatedView. Renvoie un PNG base64. Aucune donnée n'est modifiée.
import { captureRef } from 'react-native-view-shot';

export async function capturePixelSnapshot(
  node: unknown, _docW: number, _docH: number,
): Promise<string | null> {
  if (!node) return null;
  return captureRef(node as never, { format: 'png', quality: 1, result: 'base64' });
}
