// Encodage des tuiles pixel (web / Electron) : canvas 2D (secours validé ;
// CanvasKit/Skia web sera évalué à l'étape 2 pour la composition).
import { TILE } from './rasterTiles';
import type { TileCodec } from './rasterState';

function canvas2d() {
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d');
  return { c, ctx };
}

export const tileCodec: TileCodec = {
  encode(rgba) {
    const { c, ctx } = canvas2d();
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), TILE, TILE), 0, 0);
    return c.toDataURL('image/png');
  },
  async decode(url) {
    const img = new window.Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('tile')); img.src = url; });
    const { ctx } = canvas2d();
    ctx.drawImage(img, 0, 0);
    // NB : le navigateur prémultiplie ; les pixels semi-transparents peuvent
    // varier de ±1 après un aller-retour — invisible à l'œil.
    return ctx.getImageData(0, 0, TILE, TILE).data;
  },
};
