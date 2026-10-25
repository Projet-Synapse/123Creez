// Instantané raster du Svg du canevas (Android / iOS) via
// react-native-view-shot, redimensionné à outW × outH px (un pixel par
// pixel de document). Renvoie un PNG base64. Aucune donnée n'est modifiée.
import { captureRef } from 'react-native-view-shot';

export async function capturePixelSnapshot(
  node: unknown, outW: number, outH: number,
): Promise<string | null> {
  if (!node) return null;
  return captureRef(node as never, {
    format: 'png', quality: 1, result: 'base64', width: outW, height: outH,
  });
}
