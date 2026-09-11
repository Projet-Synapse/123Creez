// Powered by OnSpace.AI
import React, { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View, StyleSheet, PanResponder, GestureResponderEvent, Platform,
} from 'react-native';
import Svg, {
  Path, Rect, Line, Circle, Defs, ClipPath,
  Polyline, G, Mask,
} from 'react-native-svg';
import Animated, {
  useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { StrokePath, Tool } from '@/contexts/CanvasContext';

interface Props {
  width: number;
  height: number;
  // Called whenever zoom changes (pinch, wheel, or imperative zoom calls) so
  // the parent screen can show a live percentage / reset button.
  onZoomChange?: (percent: number) => void;
}

// Imperative handle exposed via ref so parent screens (e.g. the editor's
// export button) can capture the current canvas as an image, independent
// of any in-progress zoom/pan. Zoom controls let mouse/trackpad users (who
// have no pinch gesture) zoom in and out from toolbar buttons or shortcuts.
export interface DrawingCanvasHandle {
  capture: (format?: 'png' | 'jpg') => Promise<string | null>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 10;

// ─── SVG path builder ────────────────────────────────────────────────────────
function buildSvgPath(stroke: StrokePath): string {
  if (stroke.tool === 'fill') return '';
  const pts = stroke.points;
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y + 0.1}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function getStrokeLinecap(tool: string): 'round' | 'square' | 'butt' {
  if (tool === 'pencil') return 'square';
  return 'round';
}

// ─── Overlays ────────────────────────────────────────────────────────────────
function GridOverlay({ width, height, color }: { width: number; height: number; color: string }) {
  const lines = [];
  const step = 40;
  for (let x = step; x < width; x += step)
    lines.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={color} strokeWidth={0.5} />);
  for (let y = step; y < height; y += step)
    lines.push(<Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={0.5} />);
  return <>{lines}</>;
}

function DotsOverlay({ width, height, color }: { width: number; height: number; color: string }) {
  const dots = [];
  const step = 40;
  for (let x = step; x < width; x += step)
    for (let y = step; y < height; y += step)
      dots.push(<Circle key={`d${x}-${y}`} cx={x} cy={y} r={1} fill={color} />);
  return <>{dots}</>;
}

// Checkerboard for transparent background
function CheckerBg({ width, height }: { width: number; height: number }) {
  const size = 12;
  const cells: React.ReactNode[] = [];
  let rowIdx = 0;
  for (let y = 0; y < height; y += size) {
    let colIdx = 0;
    for (let x = 0; x < width; x += size) {
      const dark = (rowIdx + colIdx) % 2 === 0;
      if (dark) {
        cells.push(
          <Rect key={`c${x}-${y}`} x={x} y={y} width={size} height={size} fill="#cccccc" />
        );
      }
      colIdx++;
    }
    rowIdx++;
  }
  return (
    <>
      <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {cells}
    </>
  );
}

// ─── Layer renderer with proper eraser support ───────────────────────────────
// The eraser uses a SVG mask approach: paint strokes normally, then "cut out"
// eraser strokes using a white mask (white = visible, black = erased).
function LayerRenderer({
  layer,
  width,
  height,
  bgColor,
  isTransparent,
}: {
  layer: { id: string; visible: boolean; opacity: number; strokes: StrokePath[] };
  width: number;
  height: number;
  bgColor: string;
  isTransparent: boolean;
}) {
  if (!layer.visible) return null;

  const maskId = `mask-${layer.id}`;
  const drawStrokes = layer.strokes.filter(s => s.tool !== 'fill' && s.tool !== 'eraser');
  const eraserStrokes = layer.strokes.filter(s => s.tool === 'eraser');
  const fillStrokes = layer.strokes.filter(s => s.tool === 'fill');

  return (
    <G opacity={layer.opacity}>
      {/* Fill rect */}
      {fillStrokes.length > 0 && (() => {
        const lastFill = fillStrokes[fillStrokes.length - 1];
        return (
          <Rect
            x={0} y={0} width={width} height={height}
            fill={lastFill.color}
            opacity={lastFill.opacity}
          />
        );
      })()}

      {eraserStrokes.length > 0 ? (
        <>
          {/* Mask: white=show, black=erased */}
          <Defs>
            <Mask id={maskId} x="0" y="0" width={width} height={height}>
              {/* Start with full white (everything visible) */}
              <Rect x={0} y={0} width={width} height={height} fill="white" />
              {/* Eraser strokes are painted black to cut out */}
              {eraserStrokes.map(stroke => {
                const d = buildSvgPath(stroke);
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
          {/* Draw strokes with mask applied — only paint strokes are masked */}
          <G mask={`url(#${maskId})`}>
            {drawStrokes.map(stroke => {
              const d = buildSvgPath(stroke);
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
            })}
          </G>
        </>
      ) : (
        // No erasers — render normally
        drawStrokes.map(stroke => {
          const d = buildSvgPath(stroke);
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
        })
      )}
    </G>
  );
}

// ─── DrawingCanvas ────────────────────────────────────────────────────────────
const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(({ width, height, onZoomChange }, ref) => {
  const {
    layers, currentStroke, beginStroke, continueStroke, endStroke,
    fillLayer, activeTool, activeLayerId, activeColor,
    selection, currentLassoPoints,
    beginLasso, continueLasso, endLasso,
    moveSelection, snapshotHistory,
  } = useCanvas();
  const { settings } = useTheme();

  // ─── Container layout ref ─────────────────────────────────────────
  const containerRef = useRef<View>(null);
  const containerLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // ─── Fresh-ref pattern to avoid stale closures ────────────────────
  const activeToolRef = useRef(activeTool);
  const activeLayerIdRef = useRef(activeLayerId);
  const activeColorRef = useRef(activeColor);
  activeToolRef.current = activeTool;
  activeLayerIdRef.current = activeLayerId;
  activeColorRef.current = activeColor;

  const beginStrokeRef = useRef(beginStroke);
  const continueStrokeRef = useRef(continueStroke);
  const endStrokeRef = useRef(endStroke);
  const fillLayerRef = useRef(fillLayer);
  const beginLassoRef = useRef(beginLasso);
  const continueLassoRef = useRef(continueLasso);
  const endLassoRef = useRef(endLasso);
  const moveSelectionRef = useRef(moveSelection);
  const snapshotHistoryRef = useRef(snapshotHistory);
  beginStrokeRef.current = beginStroke;
  continueStrokeRef.current = continueStroke;
  endStrokeRef.current = endStroke;
  fillLayerRef.current = fillLayer;
  beginLassoRef.current = beginLasso;
  continueLassoRef.current = continueLasso;
  endLassoRef.current = endLasso;
  moveSelectionRef.current = moveSelection;
  snapshotHistoryRef.current = snapshotHistory;

  // ─── Zoom & Pan ───────────────────────────────────────────────────
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const isPinching = useRef(false);
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const panLastTX = useRef(0);
  const panLastTY = useRef(0);
  const isDrawing = useRef(false);
  const moveLastX = useRef(0);
  const moveLastY = useRef(0);
  const moveSnapshotTaken = useRef(false);

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  // Zoom around a given point (in local/canvas-container coordinates) while
  // keeping that point visually fixed — used by both wheel-zoom (anchored at
  // the cursor) and the +/- buttons (anchored at the canvas center).
  const zoomBy = useCallback((factor: number, anchorX: number, anchorY: number) => {
    const oldScale = lastScale.current;
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * factor));
    if (newScale === oldScale) return;
    const canvasX = (anchorX - lastTranslateX.current) / oldScale;
    const canvasY = (anchorY - lastTranslateY.current) / oldScale;
    const newTX = anchorX - canvasX * newScale;
    const newTY = anchorY - canvasY * newScale;
    scale.value = newScale;
    translateX.value = newTX;
    translateY.value = newTY;
    lastScale.current = newScale;
    lastTranslateX.current = newTX;
    lastTranslateY.current = newTY;
    onZoomChangeRef.current?.(Math.round(newScale * 100));
  }, [scale, translateX, translateY]);

  const resetZoomInternal = useCallback(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
    onZoomChangeRef.current?.(100);
  }, [scale, translateX, translateY]);

  // Mouse wheel: plain scroll pans the canvas, Ctrl/Cmd+scroll zooms toward
  // the cursor — the same convention used by Figma and most design tools.
  // Touch devices already get pinch-to-zoom via the PanResponder below, so
  // this only matters on web where there is no pinch gesture.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect?.();
      const localX = rect ? e.clientX - rect.left : width / 2;
      const localY = rect ? e.clientY - rect.top : height / 2;

      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        zoomBy(factor, localX, localY);
        return;
      }

      const newTX = lastTranslateX.current - e.deltaX;
      const newTY = lastTranslateY.current - e.deltaY;
      translateX.value = newTX;
      translateY.value = newTY;
      lastTranslateX.current = newTX;
      lastTranslateY.current = newTY;
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [width, height, zoomBy, translateX, translateY]);

  // Capture the canvas as a PNG for export/share. Any active zoom/pan is
  // temporarily reset so the export always reflects the full, un-zoomed
  // canvas rather than whatever crop the user happens to be viewing.
  useImperativeHandle(ref, () => ({
    capture: async (format: 'png' | 'jpg' = 'png') => {
      if (!containerRef.current) return null;
      const prevScale = lastScale.current;
      const prevTX = lastTranslateX.current;
      const prevTY = lastTranslateY.current;
      const needsReset = prevScale !== 1 || prevTX !== 0 || prevTY !== 0;

      if (needsReset) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        lastScale.current = 1;
        lastTranslateX.current = 0;
        lastTranslateY.current = 0;
        // Give the animated transform a frame to settle before capturing.
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      try {
        const uri = await captureRef(containerRef, {
          format,
          quality: format === 'jpg' ? 0.92 : 1,
        });
        return uri;
      } catch {
        return null;
      } finally {
        if (needsReset) {
          scale.value = prevScale;
          translateX.value = prevTX;
          translateY.value = prevTY;
          lastScale.current = prevScale;
          lastTranslateX.current = prevTX;
          lastTranslateY.current = prevTY;
        }
      }
    },
    zoomIn: () => zoomBy(1.2, width / 2, height / 2),
    zoomOut: () => zoomBy(1 / 1.2, width / 2, height / 2),
    resetZoom: resetZoomInternal,
  }), [scale, translateX, translateY, zoomBy, resetZoomInternal, width, height]);

  function getDistance(touches: GestureResponderEvent['nativeEvent']['touches']) {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMidpointPage(touches: GestureResponderEvent['nativeEvent']['touches']) {
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2,
    };
  }

  // Convert pageX/pageY (absolute screen) → canvas-space coordinates
  // This correctly accounts for the container's on-screen position + zoom/pan transform
  function toCanvasCoords(pageX: number, pageY: number) {
    const layout = containerLayout.current;
    // Local coords relative to container
    const localX = layout ? pageX - layout.x : pageX;
    const localY = layout ? pageY - layout.y : pageY;
    // Canvas coords = undo translate then undo scale
    return {
      x: (localX - lastTranslateX.current) / lastScale.current,
      y: (localY - lastTranslateY.current) / lastScale.current,
    };
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          isPinching.current = true;
          isDrawing.current = false;
          endStrokeRef.current();
          endLassoRef.current();
          pinchStartDistance.current = getDistance(touches);
          pinchStartScale.current = lastScale.current;
          const mid = getMidpointPage(touches);
          panStartX.current = mid.x;
          panStartY.current = mid.y;
          panLastTX.current = lastTranslateX.current;
          panLastTY.current = lastTranslateY.current;
          return;
        }

        isPinching.current = false;
        const { pageX, pageY } = evt.nativeEvent;
        const tool = activeToolRef.current;

        if (tool === 'fill') {
          fillLayerRef.current(activeLayerIdRef.current, activeColorRef.current);
          return;
        }

        if (tool === 'lasso') {
          isDrawing.current = true;
          const c = toCanvasCoords(pageX, pageY);
          beginLassoRef.current(c.x, c.y);
          return;
        }

        if (tool === 'move') {
          isDrawing.current = true;
          moveSnapshotTaken.current = false;
          const c = toCanvasCoords(pageX, pageY);
          moveLastX.current = c.x;
          moveLastY.current = c.y;
          return;
        }

        isDrawing.current = true;
        const c = toCanvasCoords(pageX, pageY);
        beginStrokeRef.current(c.x, c.y);
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          if (!isPinching.current) {
            isPinching.current = true;
            isDrawing.current = false;
            endStrokeRef.current();
            endLassoRef.current();
            pinchStartDistance.current = getDistance(touches);
            pinchStartScale.current = lastScale.current;
            const mid = getMidpointPage(touches);
            panStartX.current = mid.x;
            panStartY.current = mid.y;
            panLastTX.current = lastTranslateX.current;
            panLastTY.current = lastTranslateY.current;
          }

          const newDist = getDistance(touches);
          const mid = getMidpointPage(touches);

          if (pinchStartDistance.current > 0) {
            const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
              pinchStartScale.current * (newDist / pinchStartDistance.current)));
            scale.value = newScale;
            lastScale.current = newScale;
            onZoomChangeRef.current?.(Math.round(newScale * 100));
          }

          const dx = mid.x - panStartX.current;
          const dy = mid.y - panStartY.current;
          const newTX = panLastTX.current + dx;
          const newTY = panLastTY.current + dy;
          translateX.value = newTX;
          translateY.value = newTY;
          lastTranslateX.current = newTX;
          lastTranslateY.current = newTY;
          return;
        }

        if (!isDrawing.current) return;
        const { pageX, pageY } = evt.nativeEvent;
        const tool = activeToolRef.current;

        if (tool === 'fill') return;

        if (tool === 'lasso') {
          const c = toCanvasCoords(pageX, pageY);
          continueLassoRef.current(c.x, c.y);
          return;
        }

        if (tool === 'move') {
          const c = toCanvasCoords(pageX, pageY);
          const ddx = c.x - moveLastX.current;
          const ddy = c.y - moveLastY.current;
          // One history snapshot per drag gesture, taken on the first actual
          // movement — undo rolls back the whole move, and a plain tap
          // without dragging doesn't pollute the history.
          if ((ddx !== 0 || ddy !== 0) && !moveSnapshotTaken.current) {
            snapshotHistoryRef.current();
            moveSnapshotTaken.current = true;
          }
          moveSelectionRef.current(ddx, ddy);
          moveLastX.current = c.x;
          moveLastY.current = c.y;
          return;
        }

        const c = toCanvasCoords(pageX, pageY);
        continueStrokeRef.current(c.x, c.y);
      },

      onPanResponderRelease: () => {
        if (isPinching.current) {
          isPinching.current = false;
          return;
        }
        isDrawing.current = false;
        const tool = activeToolRef.current;
        if (tool === 'lasso') {
          endLassoRef.current();
          return;
        }
        if (tool !== 'fill' && tool !== 'move') {
          endStrokeRef.current();
        }
      },

      onPanResponderTerminate: () => {
        isPinching.current = false;
        isDrawing.current = false;
        endStrokeRef.current();
        endLassoRef.current();
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Canvas background based on settings
  const canvasBg = settings.canvasBg;
  const isTransparent = canvasBg === 'transparent';
  const bgColor = canvasBg === 'black' ? '#000000' : '#ffffff';
  const overlayColor = canvasBg === 'black' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const showGrid = settings.showGrid || canvasBg === 'grid';
  const showDots = canvasBg === 'dots';

  // Current stroke eraser indicator
  const currentEraserStroke = currentStroke && currentStroke.tool === 'eraser';
  const currentMaskId = 'mask-current';

  if (width <= 0 || height <= 0) return null;

  return (
    <View
      ref={containerRef}
      style={[styles.container, { width, height }]}
      onLayout={() => {
        containerRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
          containerLayout.current = { x: pageX, y: pageY, width: w, height: h };
        });
      }}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {/* Background */}
          {isTransparent
            ? <CheckerBg width={width} height={height} />
            : <Rect x={0} y={0} width={width} height={height} fill={bgColor} />
          }

          {/* Grid / Dots overlay */}
          {showGrid && <GridOverlay width={width} height={height} color={overlayColor} />}
          {showDots && <DotsOverlay width={width} height={height} color={overlayColor} />}

          {/* Layers with correct eraser via SVG mask */}
          {layers.map(layer => (
            <LayerRenderer
              key={layer.id}
              layer={layer}
              width={width}
              height={height}
              bgColor={bgColor}
              isTransparent={isTransparent}
            />
          ))}

          {/* Current stroke preview */}
          {currentStroke && (() => {
            const d = buildSvgPath(currentStroke);
            if (!d) return null;

            if (currentEraserStroke) {
              // Show eraser as semi-transparent white stroke for visual feedback
              return (
                <Path
                  d={d}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={currentStroke.size}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              );
            }

            return (
              <Path
                d={d}
                stroke={currentStroke.color}
                strokeWidth={currentStroke.size}
                strokeLinecap={getStrokeLinecap(currentStroke.tool)}
                strokeLinejoin="round"
                strokeOpacity={currentStroke.opacity}
                fill="none"
              />
            );
          })()}

          {/* Lasso preview */}
          {currentLassoPoints.length > 1 && (
            <Polyline
              points={currentLassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
              stroke="#4ecdc4"
              strokeWidth={1.5}
              strokeDasharray="6,4"
              fill="rgba(78,205,196,0.08)"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Selection rect */}
          {selection && (
            <>
              <Rect
                x={selection.x} y={selection.y}
                width={selection.width} height={selection.height}
                fill="rgba(78,205,196,0.08)"
                stroke="#4ecdc4"
                strokeWidth={1.5}
                strokeDasharray="6,4"
              />
              {[
                [selection.x, selection.y],
                [selection.x + selection.width, selection.y],
                [selection.x, selection.y + selection.height],
                [selection.x + selection.width, selection.y + selection.height],
              ].map(([cx, cy], i) => (
                <Circle key={i} cx={cx} cy={cy} r={5} fill="#4ecdc4" stroke="#fff" strokeWidth={1.5} />
              ))}
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});

export default React.memo(DrawingCanvas);
