// Instantané raster du Svg du canevas (web / Electron) : seule la TOILE
// (le viewBox du Svg) est sérialisée, puis dessinée dans un <canvas> de
// docW × docH px, soit un pixel par pixel de document, sans lissage
// (imageSmoothingEnabled = false). Aucune donnée du dessin n'est modifiée.
export async function capturePixelSnapshot(
  node: unknown, docW: number, docH: number,
): Promise<string | null> {
  const host = node as HTMLElement | null;
  const svg = host?.querySelector?.('svg');
  if (!svg) return null;
  const outW = Math.max(1, Math.round(docW));
  const outH = Math.max(1, Math.round(docH));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Le viewBox couvre exactement la toile : rendu docW × docH sans bandes.
  clone.setAttribute('viewBox', `0 0 ${docW} ${docH}`);
  clone.setAttribute('preserveAspectRatio', 'none');
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
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, outW, outH);
  return canvas.toDataURL('image/png');
}
