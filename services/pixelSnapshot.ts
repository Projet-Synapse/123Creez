// Instantané raster de la toile pour la vue pixélisée (Android / iOS).
//
// Avant : capture écran du Svg (react-native-view-shot) à la taille de la
// vue, souvent PLUS PETITE que le document et déjà lissée (photos
// bilinéaires), puis ramenée à docW × docH en Nearest. Les vrais pixels du
// document étaient perdus : au zoom, couleurs « sales » et bords flous.
//
// Maintenant : la toile est redessinée avec Skia, directement dans une
// surface de docW × docH px (un pixel = un pixel de document), d'après le
// plan de services/pixelRaster.ts. Les photos sont échantillonnées en plus
// proche voisin (FilterMode.Nearest). Affichage seul : rien n'est exporté,
// aucune donnée du dessin n'est modifiée.
import {
  Skia, FilterMode, MipmapMode, PaintStyle, StrokeCap, StrokeJoin, BlendMode, ClipOp, matchFont,
  type SkCanvas, type SkFont, type SkImage, type SkPaint, type SkPath, type SkSurface,
} from '@shopify/react-native-skia';
import { planDocRaster, planIncremental, dataUrlBase64, type RasterGeom, type RasterOp, type RasterPaint, type RasterScene } from './pixelRaster';
import { docRasterSize, imageMeetRect } from './pixelGrid';

/** Natif : image Skia de docW × docH px, prête à être affichée. */
export type PixelSnapshot = SkImage;

export interface PixelSnapshotRequest {
  /** Vue du Svg (utilisée sur web seulement). */
  node: unknown;
  scene: RasterScene;
}

// Photos décodées, gardées entre deux instantanés (un instantané est refait
// après chaque trait : pas question de redécoder une photo 2048 px à chaque
// fois). Clé : l'URL data: elle-même. Peu d'entrées : c'est lourd.
const IMAGE_CACHE_MAX = 6;
const imageCache = new Map<string, SkImage>();

async function decodeImage(src: string): Promise<SkImage | null> {
  const hit = imageCache.get(src);
  if (hit) {
    imageCache.delete(src);
    imageCache.set(src, hit);
    return hit;
  }
  const b64 = dataUrlBase64(src);
  const data = b64 !== null ? Skia.Data.fromBase64(b64) : await Skia.Data.fromURI(src);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) return null;
  imageCache.set(src, img);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
  return img;
}

const fontCache = new Map<number, SkFont | null>();
function fontFor(size: number): SkFont | null {
  if (!fontCache.has(size)) {
    let font: SkFont | null = null;
    try { font = matchFont({ fontFamily: 'sans-serif', fontSize: size }); } catch { font = null; }
    fontCache.set(size, font);
  }
  return fontCache.get(size) ?? null;
}

function colorWithOpacity(color: string, opacity: number) {
  const c = Skia.Color(color);
  return Float32Array.of(c[0], c[1], c[2], c[3] * Math.max(0, Math.min(1, opacity)));
}

function makePaint(p: RasterPaint): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(colorWithOpacity(p.color, p.opacity));
  if (p.style === 'stroke') {
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(p.width ?? 1);
    paint.setStrokeCap(p.cap === 'round' ? StrokeCap.Round : p.cap === 'square' ? StrokeCap.Square : StrokeCap.Butt);
    paint.setStrokeJoin(p.join === 'round' ? StrokeJoin.Round : StrokeJoin.Miter);
  } else {
    paint.setStyle(PaintStyle.Fill);
  }
  if (p.dash && p.dash.length > 0) paint.setPathEffect(Skia.PathEffect.MakeDash(p.dash, 0));
  // Gomme : retire ce qui est déjà peint dans le calque isolé.
  if (p.erase) paint.setBlendMode(BlendMode.DstOut);
  return paint;
}

function polyPath(points: { x: number; y: number }[]): SkPath {
  return Skia.Path.Make().addPoly(points.map(pt => ({ x: pt.x, y: pt.y })), true);
}

function drawGeom(canvas: SkCanvas, g: RasterGeom, paint: SkPaint) {
  switch (g.kind) {
    case 'path': {
      const path = Skia.Path.MakeFromSVGString(g.d);
      if (path) canvas.drawPath(path, paint);
      return;
    }
    case 'rect': canvas.drawRect(Skia.XYWHRect(g.x, g.y, g.w, g.h), paint); return;
    case 'oval': canvas.drawOval(Skia.XYWHRect(g.x, g.y, g.w, g.h), paint); return;
    case 'circle': canvas.drawCircle(g.cx, g.cy, g.r, paint); return;
    case 'line': canvas.drawLine(g.x1, g.y1, g.x2, g.y2, paint); return;
    case 'poly': if (g.points.length > 1) canvas.drawPath(polyPath(g.points), paint); return;
  }
}

function drawChecker(canvas: SkCanvas, w: number, h: number, size: number) {
  const light = Skia.Paint();
  light.setColor(Skia.Color('#ffffff'));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), light);
  const dark = Skia.Paint();
  dark.setColor(Skia.Color('#cccccc'));
  // Mêmes cases que CheckerBg : (ligne + colonne) paire = foncée.
  const path = Skia.Path.Make();
  for (let row = 0, y = 0; y < h; y += size, row++)
    for (let col = 0, x = 0; x < w; x += size, col++)
      if ((row + col) % 2 === 0) path.addRect(Skia.XYWHRect(x, y, size, size));
  canvas.drawPath(path, dark);
}

async function runOps(canvas: SkCanvas, ops: RasterOp[]) {
  // Photos décodées d'abord (une seule fois par source).
  const images = new Map<string, SkImage | null>();
  for (const o of ops) {
    if (o.op === 'image' && !images.has(o.src)) {
      try { images.set(o.src, await decodeImage(o.src)); } catch { images.set(o.src, null); }
    }
  }
  const nearest = Skia.Paint();
  nearest.setAntiAlias(false); // bord de photo franc, pas de demi-pixel fondu
  for (const o of ops) {
    switch (o.op) {
      case 'draw': drawGeom(canvas, o.geom, makePaint(o.paint)); break;
      case 'layer': {
        if (o.opacity < 1) {
          const p = Skia.Paint();
          p.setAlphaf(Math.max(0, o.opacity));
          canvas.saveLayer(p);
        } else if (o.isolate) canvas.saveLayer();
        else canvas.save();
        break;
      }
      case 'clip':
        canvas.save();
        canvas.clipPath(polyPath(o.points), o.inside ? ClipOp.Intersect : ClipOp.Difference, true);
        break;
      case 'restore': canvas.restore(); break;
      case 'checker': drawChecker(canvas, o.w, o.h, o.size); break;
      case 'image': {
        const img = images.get(o.src);
        if (!img) break;
        const r = imageMeetRect(o.x, o.y, o.w, o.h, img.width(), img.height());
        canvas.save();
        if (o.angle) canvas.rotate(o.angle, o.x + o.w / 2, o.y + o.h / 2);
        // Plus proche voisin : chaque pixel de la toile prend UNE couleur de
        // la photo, jamais un mélange bilinéaire.
        canvas.drawImageRectOptions(
          img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(r.x, r.y, r.w, r.h),
          FilterMode.Nearest, MipmapMode.None, nearest,
        );
        canvas.restore();
        break;
      }
      case 'text': {
        const font = fontFor(o.size);
        if (!font || !o.value) break;
        const p = Skia.Paint();
        p.setAntiAlias(true);
        p.setColor(colorWithOpacity(o.color, o.opacity));
        canvas.drawText(o.value, o.x, o.y, p, font);
        break;
      }
    }
  }
}

// Surface gardée d'un instantané à l'autre : elle contient le raster de
// `scene`. Un trait ajouté (cas sûr, cf. planIncremental) y est dessiné
// par-dessus au lieu de tout refaire. null = rien de valable en mémoire.
interface Retained { surface: SkSurface; w: number; h: number; scene: RasterScene }
let retained: Retained | null = null;
// Un seul rendu à la fois sur la surface gardée (le décodage des photos est
// asynchrone : deux rendus pourraient sinon s'entremêler).
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => null);
  return run;
}

function dropRetained() {
  const r = retained;
  retained = null;
  if (r) { try { r.surface.dispose(); } catch { /* déjà libérée */ } }
}

/** Le prochain instantané de `scene` sera-t-il un simple ajout de trait ? */
export function canRenderIncrementally(scene: RasterScene): boolean {
  const r = retained;
  if (!r) return false;
  const { w, h } = docRasterSize(scene.docW, scene.docH);
  return r.w === w && r.h === h && planIncremental(r.scene, scene) !== null;
}

async function renderSnapshot(scene: RasterScene): Promise<PixelSnapshot | null> {
  const { w, h } = docRasterSize(scene.docW, scene.docH);
  const prev = retained;
  const sameSize = !!prev && prev.w === w && prev.h === h;
  const inc = sameSize && prev ? planIncremental(prev.scene, scene) : null;
  let surface: SkSurface | null;
  if (sameSize && prev) {
    surface = prev.surface;
  } else {
    dropRetained();
    surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  }
  if (!surface) return null;
  // Pendant le dessin, la surface n'est plus « valable » : un échec en cours
  // de route forcera un rendu complet la prochaine fois.
  retained = null;
  try {
    const canvas = surface.getCanvas();
    canvas.save();
    if (!inc) canvas.clear(Skia.Color('transparent'));
    // Document à dimensions non entières : on le cale sur le raster arrondi.
    if (w !== scene.docW || h !== scene.docH) canvas.scale(w / scene.docW, h / scene.docH);
    await runOps(canvas, inc ?? planDocRaster(scene));
    canvas.restore();
    surface.flush();
    const tex = surface.makeImageSnapshot();
    // Copie hors texture : utilisable par le Canvas Skia de l'écran.
    const img = tex.makeNonTextureImage();
    if (img !== tex) { try { tex.dispose(); } catch { /* rien */ } }
    retained = { surface, w, h, scene };
    return img;
  } catch (e) {
    try { surface.dispose(); } catch { /* rien */ }
    throw e;
  }
}

export function capturePixelSnapshot(req: PixelSnapshotRequest): Promise<PixelSnapshot | null> {
  return enqueue(() => renderSnapshot(req.scene));
}

/** Libère la surface gardée (vue pixélisée quittée, éditeur fermé). */
export function releasePixelSnapshotCache(): void {
  void enqueue(async () => { dropRetained(); });
}

/** Libère une image d'instantané qui n'est plus affichée. */
export function disposePixelSnapshot(img: PixelSnapshot): void {
  try { img.dispose(); } catch { /* déjà libérée */ }
}
