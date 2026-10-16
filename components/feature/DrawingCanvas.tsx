// Powered by OnSpace.AI
import React, { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View, StyleSheet, PanResponder, GestureResponderEvent, Platform,
} from 'react-native';
import Svg, {
  Rect, Line, Circle, Defs, Mask, Polyline, Polygon, G, Path,
} from 'react-native-svg';
import Animated, {
  useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { CanvasArt, buildSvgPath } from '@/components/feature/CanvasArt';

function getStrokeLinecap(tool: string): 'round' | 'square' | 'butt' {
  if (tool === 'pencil') return 'square';
  return 'round';
}

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

const SEL_COLOR = '#4ecdc4';

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

// ─── DrawingCanvas ────────────────────────────────────────────────────────────
const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(({ width, height, onZoomChange }, ref) => {
  const {
    layers, currentStroke, beginStroke, continueStroke, endStroke,
    fillLayer, activeTool, activeLayerId, activeColor,
    selection, currentLassoPoints,
    beginLasso, continueLasso, endLasso,
    moveSelection, snapshotHistory, pickLayerAt,
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
  const selectionRef = useRef(selection);
  const pickLayerAtRef = useRef(pickLayerAt);
  beginStrokeRef.current = beginStroke;
  continueStrokeRef.current = continueStroke;
  endStrokeRef.current = endStroke;
  fillLayerRef.current = fillLayer;
  beginLassoRef.current = beginLasso;
  continueLassoRef.current = continueLasso;
  endLassoRef.current = endLasso;
  moveSelectionRef.current = moveSelection;
  snapshotHistoryRef.current = snapshotHistory;
  selectionRef.current = selection;
  pickLayerAtRef.current = pickLayerAt;

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

        // Doigt : sélectionne le calque sous le point, ne dessine jamais.
        if (tool === 'pick') {
          const c = toCanvasCoords(pageX, pageY);
          pickLayerAtRef.current(c.x, c.y);
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

        if (tool === 'fill' || tool === 'pick') return;

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
          // movement — and only for the whole-layer move path: a floating
          // lasso selection doesn't mutate strokes during the drag (the cut
          // is snapshotted once at commit time instead).
          if ((ddx !== 0 || ddy !== 0) && !moveSnapshotTaken.current && !selectionRef.current) {
            snapshotHistoryRef.current();
          }
          if ((ddx !== 0 || ddy !== 0)) {
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

  // ─── Floating selection rendering ─────────────────────────────────
  // While a lasso selection is being dragged, the active layer is painted
  // twice: once masked to the OUTSIDE of the polygon (stays in place) and
  // once translated, masked to the INSIDE. Fills are never part of the move
  // — the canvas background stays put. Committing the selection splits the
  // strokes for real (CanvasContext.commitSelection).
  const selPolygonPoints = selection
    ? selection.points.map(p => `${p.x + selection.offset.x},${p.y + selection.offset.y}`).join(' ')
    : '';
  const basePolygonPoints = selection
    ? selection.points.map(p => `${p.x},${p.y}`).join(' ')
    : '';
  const selMaskBase = `sel-mask-${width}x${height}`;
  const activeLayers = layers.filter(l => l.id === activeLayerId);
  const floating = !!selection && (selection.offset.x !== 0 || selection.offset.y !== 0);

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

          {/* Selection masks (outside = keep in place, inside = moves) */}
          {selection && (
            <Defs>
              <Mask id={`${selMaskBase}-out`} x="0" y="0" width={width} height={height}>
                <Rect x={0} y={0} width={width} height={height} fill="white" />
                <Polygon points={basePolygonPoints} fill="black" />
              </Mask>
              <Mask id={`${selMaskBase}-in`} x="0" y="0" width={width} height={height}>
                <Rect x={0} y={0} width={width} height={height} fill="black" />
                <Polygon points={selPolygonPoints} fill="white" />
              </Mask>
            </Defs>
          )}

          {/* Layers. The active layer renders in two masked halves while a
              selection is being dragged; everything else paints normally. */}
          {layers.map(layer => {
            if (layer.id !== activeLayerId || !floating) {
              return (
                <CanvasArt
                  key={layer.id}
                  layers={[layer]}
                  width={width}
                  height={height}
                  variant={layer.id}
                />
              );
            }
            return (
              <G key={layer.id}>
                <CanvasArt
                  layers={[layer]}
                  width={width}
                  height={height}
                  variant={`${layer.id}-out`}
                  maskId={`${selMaskBase}-out`}
                />
                <CanvasArt
                  layers={[layer]}
                  width={width}
                  height={height}
                  variant={`${layer.id}-in`}
                  includeFill={false}
                  maskId={`${selMaskBase}-in`}
                  translate={selection!.offset}
                />
              </G>
            );
          })}

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

          {/* Lasso preview (freeform, while drawing) */}
          {currentLassoPoints.length > 1 && (
            <Polyline
              points={currentLassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
              stroke={SEL_COLOR}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              fill="rgba(78,205,196,0.08)"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active selection: the actual hand-drawn outline, translated
              live while dragged — no bounding box, no handles. */}
          {selection && (
            <Polygon
              points={selPolygonPoints}
              stroke={SEL_COLOR}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              fill="rgba(78,205,196,0.05)"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
