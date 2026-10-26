// Instantané raster du Svg du canevas (web / Electron) : le Svg est
// sérialisé puis dessiné dans un <canvas> de outW × outH px, soit un pixel
// par pixel de document. Aucune donnée du dessin n'est modifiée.
export async function capturePixelSnapshot(
  node: unknown, outW: number, outH: number,
): Promise<string | null> {
  const host = node as HTMLElement | null;
  const svg = host?.querySelector?.('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(outW));
  clone.setAttribute('height', String(outH));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, outW, outH);
  return canvas.toDataURL('image/png');
}
