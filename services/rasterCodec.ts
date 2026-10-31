// Encodage des tuiles pixel (Android / iOS) via Skia natif, déjà embarqué.
import { Skia, AlphaType, ColorType, ImageFormat } from '@shopify/react-native-skia';
import { TILE } from './rasterTiles';
import type { TileCodec } from './rasterState';

const info = { width: TILE, height: TILE, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };

export const tileCodec: TileCodec = {
  encode(rgba) {
    const data = Skia.Data.fromBytes(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
    const img = Skia.Image.MakeImage(info, data, TILE * 4);
    if (!img) throw new Error('Skia MakeImage');
    return 'data:image/png;base64,' + img.encodeToBase64(ImageFormat.PNG, 100);
  },
  async decode(url) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
    if (!img) return null;
    const px = img.readPixels(0, 0, info);
    if (!px || px instanceof Float32Array) return null;
    return new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength).slice();
  },
};
