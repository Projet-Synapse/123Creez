// Shared static renderer for canvas content.
//
// DrawingCanvas, the vault thumbnails and the floating-selection copy all
// paint the same stroke data, so the SVG path builder and the layer renderer
// live here. Everything is pure vector rendering — no gesture handling.
import React from 'react';
import { Svg, Path, Rect, Defs, Mask, G, Pattern, Image as SvgImage } from 'react-native-svg';
import { StrokePath, LayerImage } from '@/contexts/CanvasContext';

export function buildSvgPath(stroke: StrokePath, dx = 0, dy = 0): string {
  if (stroke.tool === 'fill') return '';
  const pts = stroke.points;
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x + dx} ${pts[0].y + dy} L ${pts[0].x + dx + 0.1} ${pts[0].y + dy + 0.1}`;
  }
  let d = `M ${pts[0].x + dx} ${pts[0].y + dy}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2 + dx;
    const my = (prev.y + curr.y) / 2 + dy;
    d += ` Q ${prev.x + dx} ${prev.y + dy} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x + dx} ${last.y + dy}`;
  return d;
}

function getStrokeLinecap(tool: string): 'round' | 'square' | 'butt' {
  if (tool === 'pencil') return 'square';
  return 'round';
}

interface LayerLike {
  id: string;
  visible: boolean;
  opacity: number;
  strokes: StrokePath[];
  images?: LayerImage[];
}

interface CanvasArtProps {
  layers: LayerLike[];
  width: number;
  height: number;
  /** Dimensions LOGIQUES du contenu (coordonnées des traits) quand elles
      diffèrent de la taille rendue — le SVG scale via viewBox (vignettes). */
  contentWidth?: number;
  contentHeight?: number;
  /** Unique per mount — keeps SVG mask ids from colliding when the same
      layer is painted twice (floating selection renders two copies). */
  variant: string;
  /** Whole-content translation (floating selection copy). */
  translate?: { x: number; y: number };
  /** Paint fill strokes (the canvas background). The floating copy leaves
      them out: the fill stays put, only drawn content moves. */
  includeFill?: boolean;
  /** Wrap the drawn strokes in an existing SVG mask (used to clip the
      selection's inside/outside halves). Fills are never masked. */
  maskId?: string;
  /** Opaque background painted below everything (thumbnails) : une couleur,
      'checker' pour le damier de transparence, ou null (aucun fond —
      transparence réelle). */
  bg?: string | 'checker' | null;
  /** 'slice' (remplit, rogne) ou 'meet' (entier visible) pour l'échelle du
      viewBox — les vignettes des cartes utilisent 'meet'. */
  preserveAspect?: 'slice' | 'meet';
}

/** Renders background fill rects + all stroke layers (eraser-aware via SVG
    masks). Pure output — no gestures, no state. */
export function CanvasArt({
  layers, width, height, variant,
  contentWidth, contentHeight,
  translate = { x: 0, y: 0 }, includeFill = true, maskId, bg = null,
  preserveAspect = 'slice',
}: CanvasArtProps) {
  const dx = translate.x;
  const dy = translate.y;
  const vbW = contentWidth ?? width;
  const vbH = contentHeight ?? height;

  const content = layers.map(layer => {
    if (!layer.visible) return null;
    const eraserMaskId = `mask-${variant}-${layer.id}`;
    const drawStrokes = layer.strokes.filter(s => s.tool !== 'fill' && s.tool !== 'eraser');
    const eraserStrokes = layer.strokes.filter(s => s.tool === 'eraser');
    const fillStrokes = layer.strokes.filter(s => s.tool === 'fill');

    const paths = drawStrokes.map(stroke => {
      const d = buildSvgPath(stroke, dx, dy);
      if (!d) return null;
      return (
        <Path
          key={stroke.id}
          d={d}
          stroke={stroke.color}
          strokeWidth={stroke.size}
          strokeLinecap={getStrokeLinecap(stroke.tool)}
          strokeLinejoin="round"
          strokeOpacity={stroke.opacity}
          fill="none"
        />
      );
    });

    return (
      <G key={layer.id} opacity={layer.opacity}>
        {/* Images posées sur le calque : sous tout le reste du calque. */}
        {(layer.images ?? []).map(img => (
          <SvgImage
            key={img.id}
            href={{ uri: img.src }}
            x={img.x + dx}
            y={img.y + dy}
            width={img.width}
            height={img.height}
          />
        ))}
        {includeFill && fillStrokes.length > 0 && (() => {
          const lastFill = fillStrokes[fillStrokes.length - 1];
          return (
            <Rect x={0} y={0} width={vbW} height={vbH} fill={lastFill.color} opacity={lastFill.opacity} />
          );
        })()}
        {eraserStrokes.length > 0 ? (
          <>
            <Defs>
              <Mask id={eraserMaskId} x="0" y="0" width={vbW} height={vbH}>
                <Rect x={0} y={0} width={vbW} height={vbH} fill="white" />
                {eraserStrokes.map(stroke => {
                  const d = buildSvgPath(stroke, dx, dy);
                  if (!d) return null;
                  return (
                    <Path
                      key={stroke.id}
                      d={d}
                      stroke="black"
                      strokeWidth={stroke.size}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  );
                })}
              </Mask>
            </Defs>
            <G mask={`url(#${eraserMaskId})`}>{paths}</G>
          </>
        ) : paths}
      </G>
    );
  });

  const wrapped = maskId ? <G mask={`url(#${maskId})`}>{content}</G> : content;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio={`xMidYMid ${preserveAspect}`}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      {bg === 'checker' ? (
        <>
          <Defs>
            {/* Id suffixé par variant : plusieurs SVG cohabitent (grille du
                vault, copies flottantes de sélection). Le motif est dimensionné
                en unités logiques pour rester ~12 px À L'ÉCRAN quelle que soit
                l'échelle du viewBox. */}
            <Pattern
              id={`checker-${variant}`}
              width={24 * (vbW / width)}
              height={24 * (vbH / height)}
              patternUnits="userSpaceOnUse"
            >
              <Rect x="0" y="0" width={12 * (vbW / width)} height={12 * (vbH / height)} fill="#cccccc" />
              <Rect x={12 * (vbW / width)} y="0" width={12 * (vbW / width)} height={12 * (vbH / height)} fill="#f5f5f5" />
              <Rect x="0" y={12 * (vbH / height)} width={12 * (vbW / width)} height={12 * (vbH / height)} fill="#f5f5f5" />
              <Rect x={12 * (vbW / width)} y={12 * (vbH / height)} width={12 * (vbW / width)} height={12 * (vbH / height)} fill="#cccccc" />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={vbW} height={vbH} fill={`url(#checker-${variant})`} />
        </>
      ) : bg ? (
        <Rect x={0} y={0} width={vbW} height={vbH} fill={bg} />
      ) : null}
      {wrapped}
    </Svg>
  );
}

export default React.memo(CanvasArt);
