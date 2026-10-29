// Powered by OnSpace.AI
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View, StyleSheet, PanResponder, GestureResponderEvent, Platform,
  Modal, TextInput, Pressable,
} from 'react-native';
import Svg, {
  Rect, Line, Circle, Ellipse, Defs, Mask, Polyline, Polygon, G, Path,
} from 'react-native-svg';
import Animated, {
  useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { CanvasArt, buildSvgPath } from '@/components/feature/CanvasArt';
import { scalePan, scalePinchRatio, scaleZoomStep, pixelViewEligible } from '@/services/gestureMath';
import { screenToZone, zoomAboutAnchor, strokeGate, shouldCommitStroke } from '@/services/canvasInput';
import { capturePixelSnapshot } from '@/services/pixelSnapshot';
import PixelatedView from '@/components/feature/PixelatedView';
import { MeasureGraphics, MeasurePanel } from '@/components/feature/MeasureOverlay';
import {
  Measure, MeasureMode, Pt, viewParams, screenToDoc, screenLenToDoc, distance,
  snapToPoints, snapPointToAngle, measureEndpoints, measureToLines,
  setDistanceFromInput, setAngleFromInput, segmentAngleDeg, angleAtVertex,
  HANDLE_HIT_PX, ENDPOINT_SNAP_PX,
} from '@/services/measureMath';

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
  // Fond transparent de CETTE toile (damier) — prioritaire sur le réglage
  // global canvasBg : une photo importée avec transparence se voit sur un
  // damier même si le fond global est blanc.
  transparentBg?: boolean;
  // Dimensions LOGIQUES de la toile : quand elles changent (nouvelle toile
  // chargée), le canvas s'ajuste tout seul si elle dépasse la zone — sans
  // dépendre d'un appel extérieur par ref (timing de montage non garanti).
  contentSize?: { width: number; height: number };
}

// Imperative handle exposed via ref so parent screens (e.g. the editor's
// export button) can capture the current canvas as an image, independent
// of any in-progress zoom/pan. Zoom controls let mouse/trackpad users (who
// have no pinch gesture) zoom in and out from toolbar buttons or shortcuts.
export interface DrawingCanvasHandle {
  capture: (format?: 'png' | 'jpg') => Promise<string | null>;
  fitToContent: (contentW: number, contentH: number) => void;
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
const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(({ width, height, onZoomChange, transparentBg, contentSize }, ref) => {
  const {
    layers, currentStroke, beginStroke, continueStroke, endStroke, cancelStroke, cancelLasso,
    undo, redo,
    fillLayer, activeTool, activeLayerId, activeColor,
    selection, currentLassoPoints,
    beginLasso, continueLasso, endLasso,
    moveSelection, snapshotHistory, pickLayerAt,
    addShape, addLines, addText, transformLayerImage, eyedropColor, setActiveColor,
  } = useCanvas();
  const { settings, theme } = useTheme();

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
  const cancelStrokeRef = useRef(cancelStroke);
  const continueStrokeRef = useRef(continueStroke);
  const endStrokeRef = useRef(endStroke);
  const fillLayerRef = useRef(fillLayer);
  const beginLassoRef = useRef(beginLasso);
  const cancelLassoRef = useRef(cancelLasso);
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  // Tap multi-doigts = gestes d'annulation (style IbisPaint) : 2 doigts =
  // annuler, 3 doigts = rétablir — un TAP (court, sans mouvement du milieu),
  // sinon c'est un pinch/pan et rien ne se déclenche.
  const gestureInfo = useRef({ start: 0, maxTouches: 0, midStart: null as { x: number; y: number } | null, midMoved: 0 });
  const addShapeRef = useRef(addShape);
  addShapeRef.current = addShape;
  const addTextRef = useRef(addText);
  addTextRef.current = addText;
  const transformLayerImageRef = useRef(transformLayerImage);
  transformLayerImageRef.current = transformLayerImage;
  const eyedropColorRef = useRef(eyedropColor);
  eyedropColorRef.current = eyedropColor;
  const setActiveColorRef = useRef(setActiveColor);
  setActiveColorRef.current = setActiveColor;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Miroirs à jour pour les handlers figés du PanResponder (créé une fois) :
  // la conversion et le facteur de taille lisent les refs, jamais les props
  // capturées au premier rendu.
  const contentSizeRef = useRef(contentSize);
  contentSizeRef.current = contentSize;
  const zoneRef = useRef({ w: width, h: height });
  zoneRef.current = { w: width, h: height };
  const paintScaleRef = useRef(1);
  paintScaleRef.current = contentSize ? 1 / Math.max(0.0001, Math.min(zoneRef.current.w / contentSize.width, zoneRef.current.h / contentSize.height)) : 1;
  const continueLassoRef = useRef(continueLasso);
  const endLassoRef = useRef(endLasso);
  const moveSelectionRef = useRef(moveSelection);
  const snapshotHistoryRef = useRef(snapshotHistory);
  const selectionRef = useRef(selection);
  const pickLayerAtRef = useRef(pickLayerAt);
  beginStrokeRef.current = beginStroke;
  cancelStrokeRef.current = cancelStroke;
  continueStrokeRef.current = continueStroke;
  endStrokeRef.current = endStroke;
  fillLayerRef.current = fillLayer;
  beginLassoRef.current = beginLasso;
  cancelLassoRef.current = cancelLasso;
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
  // Trait au doigt pas encore commencé (cf. strokeGate) : points en coord. toile.
  const pendingStroke = useRef<{ t: number; points: { x: number; y: number }[] } | null>(null);
  const moveLastX = useRef(0);
  const moveLastY = useRef(0);
  const moveSnapshotTaken = useRef(false);

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  // Vue pixélisée : on ne garde en état React que le franchissement du seuil
  // de zoom (booléen) et le fait qu'un geste est en cours — jamais le zoom
  // continu, pour ne pas re-rendre le canevas à chaque mouvement de pinch.
  const [zoomForPixel, setZoomForPixel] = useState(1);
  const notePixelZoom = useCallback((z: number) => {
    // Arrondi à 0.5 près : quelques rendus par geste au plus, et seulement
    // si la vue pixélisée est choisie.
    if (settingsRef.current.zoomRendering !== 'pixelated') return;
    setZoomForPixel(Math.round(z * 2) / 2);
  }, []);
  const notePixelZoomRef = useRef(notePixelZoom);
  notePixelZoomRef.current = notePixelZoom;
  // Passage en mode « pixélisé » alors qu'on est déjà zoomé : notePixelZoom
  // n'est appelé qu'à la fin d'un geste, donc on relit le zoom courant ici.
  const zoomRenderingMode = settings.zoomRendering;
  useEffect(() => {
    if (zoomRenderingMode === 'pixelated') setZoomForPixel(Math.round(lastScale.current * 2) / 2);
  }, [zoomRenderingMode]);
  const [pixelGesture, setPixelGesture] = useState(false);

  // ─── Outil Mesure (surcouche d'affichage, état LOCAL) ─────────────
  // Jamais dans les calques / l'historique / la sauvegarde / l'export ; seule
  // l'action « Tracer » crée de vrais traits (via addLines, annulable).
  const [measure, setMeasureState] = useState<Measure | null>(null);
  const measureRef = useRef<Measure | null>(null);
  const setMeasure = useCallback((m: Measure | null) => { measureRef.current = m; setMeasureState(m); }, []);
  const prevMeasureRef = useRef<Measure | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('distance');
  const measureModeRef = useRef(measureMode);
  measureModeRef.current = measureMode;
  const [snap15, setSnap15] = useState(false);
  const [snapEnds, setSnapEnds] = useState(true);
  const snapOptsRef = useRef({ snap15, snapEnds });
  snapOptsRef.current = { snap15, snapEnds };
  const shiftDownRef = useRef(false);
  const measureDragRef = useRef<{ key: 'a' | 'b' | 'v'; before: Measure | null; fresh: boolean } | null>(null);
  const [, setMeasureViewTick] = useState(0);
  const measureRafRef = useRef<number | null>(null);
  const bumpMeasureView = useCallback(() => {
    if (activeToolRef.current !== 'measure' || !measureRef.current) return;
    if (measureRafRef.current !== null) return;
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = null;
      setMeasureViewTick(t => t + 1);
    });
  }, []);
  const bumpMeasureViewRef = useRef(bumpMeasureView);
  bumpMeasureViewRef.current = bumpMeasureView;
  const setPixelGestureRef = useRef(setPixelGesture);

  // Zoom around a given point (in local/canvas-container coordinates) while
  // keeping that point visually fixed — used by both wheel-zoom (anchored at
  // the cursor) and the +/- buttons (anchored at the canvas center).
  const zoomBy = useCallback((factor: number, anchorX: number, anchorY: number) => {
    const oldScale = lastScale.current;
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * factor));
    if (newScale === oldScale) return;
    // Scale natif centré sur la zone : ancrage calculé avec ce pivot.
    const z = zoneRef.current;
    const { tx: newTX, ty: newTY } = zoomAboutAnchor(oldScale, newScale, lastTranslateX.current, lastTranslateY.current, anchorX, anchorY, z.w, z.h);
    scale.value = newScale;
    translateX.value = newTX;
    translateY.value = newTY;
    lastScale.current = newScale;
    lastTranslateX.current = newTX;
    lastTranslateY.current = newTY;
    onZoomChangeRef.current?.(Math.round(newScale * 100));
    notePixelZoomRef.current(newScale);
    bumpMeasureViewRef.current();
  }, [scale, translateX, translateY]);

  const resetZoomInternal = useCallback(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
    onZoomChangeRef.current?.(100);
    notePixelZoomRef.current(1);
    bumpMeasureViewRef.current();
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
        const factor = scaleZoomStep(e.deltaY < 0 ? 1.08 : 1 / 1.08, settingsRef.current.zoomSensitivity);
        zoomBy(factor, localX, localY);
        return;
      }

      const newTX = lastTranslateX.current - scalePan(e.deltaX, settingsRef.current.panSensitivity);
      const newTY = lastTranslateY.current - scalePan(e.deltaY, settingsRef.current.panSensitivity);
      translateX.value = newTX;
      translateY.value = newTY;
      lastTranslateX.current = newTX;
      lastTranslateY.current = newTY;
      bumpMeasureViewRef.current();
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
      const hideChecker = transparentBg === true && format === 'png';
      // La vue pixélisée n'est qu'un affichage : jamais dans l'export.
      setPixelSuppressed(true);

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

      // Le damier disparaît le temps de la capture (un re-render suffit).
      if (hideChecker || pixelVisibleRef.current) {
        if (hideChecker) setHideCheckerForCapture(true);
        await new Promise(resolve => setTimeout(resolve, 80));
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
        if (hideChecker) setHideCheckerForCapture(false);
        setPixelSuppressed(false);
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
    /** « Ajuster » : la toile entière est toujours visible à 100 % (viewBox
        en coordonnées toile) — recale simplement la vue après un zoom. */
    fitToContent: (_contentW: number, _contentH: number) => {
      resetZoomInternal();
    },
    zoomIn: () => zoomBy(1.2, width / 2, height / 2),
    zoomOut: () => zoomBy(1 / 1.2, width / 2, height / 2),
    resetZoom: resetZoomInternal,
  }), [scale, translateX, translateY, zoomBy, resetZoomInternal, width, height, transparentBg]);

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

  // Convert pageX/pageY (absolute screen) → coordonnées de la TOILE.
  // Chaîne inverse exacte du rendu :
  //   écran = pan/zoom (T + S×zone) ; zone = offset + k×toile (viewBox
  //   « meet » : k uniforme = min(zone/toile), contenu centré).
  function toCanvasCoords(pageX: number, pageY: number) {
    const layout = containerLayout.current;
    const localX = layout ? pageX - layout.x : pageX;
    const localY = layout ? pageY - layout.y : pageY;
    const zone = zoneRef.current;
    const cs = contentSizeRef.current;
    // 1) undo pan/zoom (transform en px de zone, scale centré sur la zone)
    const { x: vx, y: vy } = screenToZone(localX, localY, lastTranslateX.current, lastTranslateY.current, lastScale.current, zone.w, zone.h);
    // 2) undo viewBox « meet » (k uniforme + centrage)
    if (cs) {
      const k = Math.min(zone.w / cs.width, zone.h / cs.height);
      const offX = (zone.w - cs.width * k) / 2;
      const offY = (zone.h - cs.height * k) / 2;
      return { x: (vx - offX) / k, y: (vy - offY) / k };
    }
    return { x: vx, y: vy };
  }

  // ─── Outil Mesure : gestes à un doigt ─────────────────────────────
  function currentView() {
    const zone = zoneRef.current;
    const cs = contentSizeRef.current ?? { width: zone.w, height: zone.h };
    return viewParams(lastScale.current, lastTranslateX.current, lastTranslateY.current, zone.w, zone.h, cs.width, cs.height);
  }
  function measureLocal(pageX: number, pageY: number): Pt {
    const layout = containerLayout.current;
    return { x: layout ? pageX - layout.x : pageX, y: layout ? pageY - layout.y : pageY };
  }
  function measurePlace(key: 'a' | 'b' | 'v', raw: Pt, m: Measure): Pt {
    const view = currentView();
    let p = raw;
    if (snapOptsRef.current.snapEnds) {
      // Accroche aux extrémités de la mesure précédente et aux autres
      // poignées de la mesure courante (enchaîner des segments / polygones).
      const others = measureEndpoints(m).filter(q => q !== m[key]);
      p = snapToPoints(p, [...measureEndpoints(prevMeasureRef.current), ...others], screenLenToDoc(ENDPOINT_SNAP_PX, view));
    }
    if ((snapOptsRef.current.snap15 || shiftDownRef.current) && p === raw) {
      const anchor = m.mode === 'distance' ? (key === 'b' ? m.a : m.b) : (key === 'v' ? null : m.v);
      if (anchor) p = snapPointToAngle(anchor, p);
    }
    return p;
  }
  function measureGrant(pageX: number, pageY: number) {
    const view = currentView();
    const d = screenToDoc(measureLocal(pageX, pageY), view);
    const m = measureRef.current;
    const hit = screenLenToDoc(HANDLE_HIT_PX, view);
    if (m && m.mode === measureModeRef.current) {
      const keys: ('a' | 'b' | 'v')[] = ['b', 'a', 'v'];
      for (const k of keys) {
        const q = m[k];
        if (q && distance(q, d) <= hit) { measureDragRef.current = { key: k, before: m, fresh: false }; return; }
      }
      // Angle : deuxième glisser = second bras depuis le sommet.
      if (m.mode === 'angle' && m.v && !m.b) {
        measureDragRef.current = { key: 'b', before: m, fresh: false };
        setMeasure({ ...m, b: measurePlace('b', d, m) });
        return;
      }
    }
    if (m && measureToLines(m).length > 0) prevMeasureRef.current = m;
    const mode = measureModeRef.current;
    const draft: Measure = mode === 'distance'
      ? { mode: 'distance', a: d, b: d, v: null }
      : { mode: 'angle', v: d, a: d, b: null };
    const start = measurePlace(mode === 'distance' ? 'a' : 'v', d, draft);
    const fresh: Measure = mode === 'distance'
      ? { ...draft, a: start, b: start } : { ...draft, v: start, a: start };
    measureDragRef.current = { key: mode === 'distance' ? 'b' : 'a', before: m, fresh: true };
    setMeasure(fresh);
  }
  function measureMove(pageX: number, pageY: number) {
    const drag = measureDragRef.current;
    const m = measureRef.current;
    if (!drag || !m) return;
    const d = screenToDoc(measureLocal(pageX, pageY), currentView());
    setMeasure({ ...m, [drag.key]: measurePlace(drag.key, d, m) });
  }
  function measureEnd(cancel: boolean) {
    const drag = measureDragRef.current;
    measureDragRef.current = null;
    if (!drag) return;
    const m = measureRef.current;
    const tiny = !!m && m.mode === 'distance' && !!m.b && distance(m.a, m.b) === 0;
    const tinyAngle = !!m && m.mode === 'angle' && !!m.v && drag.fresh && distance(m.v, m.a) === 0;
    if (cancel || (drag.fresh && (tiny || tinyAngle))) setMeasure(drag.before);
  }
  const measureGrantRef = useRef(measureGrant);
  measureGrantRef.current = measureGrant;
  const measureMoveRef = useRef(measureMove);
  measureMoveRef.current = measureMove;
  const measureEndRef = useRef(measureEnd);
  measureEndRef.current = measureEnd;

  // Passage en pinch/pan (2e doigt) : le fragment tracé par le premier doigt
  // est JETÉ (pas commité) — ce n'était pas une tentative de traçage.
  function startPinch(touches: GestureResponderEvent['nativeEvent']['touches']) {
    const g = gestureInfo.current;
    g.maxTouches = Math.max(g.maxTouches, touches.length);
    if (!g.midStart) g.midStart = getMidpointPage(touches);
    isPinching.current = true;
    isDrawing.current = false;
    pendingStroke.current = null;
    cancelStrokeRef.current();
    cancelLassoRef.current();
    measureEndRef.current(true);
    pinchStartDistance.current = getDistance(touches);
    pinchStartScale.current = lastScale.current;
    const mid = getMidpointPage(touches);
    panStartX.current = mid.x;
    panStartY.current = mid.y;
    panLastTX.current = lastTranslateX.current;
    panLastTY.current = lastTranslateY.current;
  }
  // Démarre réellement un trait en attente (points mémorisés rejoués).
  function flushPendingStroke() {
    const p = pendingStroke.current;
    pendingStroke.current = null;
    if (!p) return;
    beginStrokeRef.current(p.points[0].x, p.points[0].y, paintScaleRef.current);
    for (let i = 1; i < p.points.length; i++) continueStrokeRef.current(p.points[i].x, p.points[i].y);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        // Pendant un geste, la vue lisse (Svg en direct) est affichée.
        if (settingsRef.current.zoomRendering === 'pixelated') setPixelGestureRef.current(true);

        gestureInfo.current = {
          start: Date.now(),
          maxTouches: touches.length,
          midStart: touches.length >= 2 ? getMidpointPage(touches) : null,
          midMoved: 0,
        };

        pendingStroke.current = null;
        if (touches.length >= 2) {
          startPinch(touches);
          return;
        }

        isPinching.current = false;
        const { pageX, pageY } = evt.nativeEvent;
        const tool = activeToolRef.current;

        if (tool === 'measure') {
          isDrawing.current = true;
          measureGrantRef.current(pageX, pageY);
          return;
        }

        if (tool === 'eyedropper') {
          const c = toCanvasCoords(pageX, pageY);
          const col = eyedropColorRef.current(c.x, c.y);
          if (col) setActiveColorRef.current(col);
          return;
        }

        if (tool === 'text') {
          const c = toCanvasCoords(pageX, pageY);
          setTextModal({ visible: true, x: c.x, y: c.y, value: '' });
          return;
        }

        if (tool === 'transform') {
          const c = toCanvasCoords(pageX, pageY);
          const layer = (layersRef.current ?? []).find(l => l.id === activeLayerIdRef.current);
          const img = layer?.images?.[0];
          if (!img) return;
          const k = Math.min(zoneRef.current.w / img.width, 1e9);
          const tol = 18 / Math.max(0.0001, Math.min(zoneRef.current.w / (contentSizeRef.current?.width ?? zoneRef.current.w), 1));
          const handleBr = Math.hypot(c.x - (img.x + img.width), c.y - (img.y + img.height));
          const handleTr = Math.hypot(c.x - (img.x + img.width), c.y - img.y);
          if (handleBr <= tol + 8) {
            transformMode.current = { mode: 'resize', startX: c.x, startY: c.y, orig: { x: img.x, y: img.y, w: img.width, h: img.height, angle: img.angle ?? 0 }, snapshotted: false };
            setTransformSel(0);
          } else if (handleTr <= tol + 8) {
            transformMode.current = { mode: 'rotate', startX: c.x, startY: c.y, orig: { x: img.x, y: img.y, w: img.width, h: img.height, angle: img.angle ?? 0 }, snapshotted: false };
            setTransformSel(0);
          } else if (c.x >= img.x - tol && c.x <= img.x + img.width + tol && c.y >= img.y - tol && c.y <= img.y + img.height + tol) {
            transformMode.current = { mode: 'move', startX: c.x, startY: c.y, orig: { x: img.x, y: img.y, w: img.width, h: img.height, angle: img.angle ?? 0 }, snapshotted: false };
            setTransformSel(0);
          } else {
            setTransformSel(null);
            transformMode.current = null;
          }
          return;
        }

        if (tool === 'shape') {
          isDrawing.current = true;
          const c = toCanvasCoords(pageX, pageY);
          shapeStartRef.current = c;
          setShapePreview({ kind: (settingsRef.current.shapeKind ?? 'line') as 'line' | 'rect' | 'ellipse', x: c.x, y: c.y, w: 0, h: 0 });
          return;
        }

        if (tool === 'rectselect') {
          isDrawing.current = true;
          const c = toCanvasCoords(pageX, pageY);
          rectStartRef.current = c;
          beginLassoRef.current(c.x, c.y);
          return;
        }

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
        // Au doigt, le trait attend ~80 ms : si un 2e doigt arrive, c'était
        // un pinch/pan et rien n'est tracé. Souris/web : immédiat.
        if (Platform.OS === 'web') beginStrokeRef.current(c.x, c.y, paintScaleRef.current);
        else pendingStroke.current = { t: Date.now(), points: [c] };
      },

      // Doigt supplémentaire posé SANS mouvement (ex. tap à deux doigts) :
      // PanResponder ne le signale pas dans Move → on bascule en pinch ici.
      onPanResponderStart: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2 && !isPinching.current) startPinch(touches);
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        // Certains Android remontent un 2e doigt dans numberActiveTouches
        // avant `touches` : on jette le trait sans attendre.
        if (touches.length < 2 && gs.numberActiveTouches >= 2) {
          gestureInfo.current.maxTouches = Math.max(gestureInfo.current.maxTouches, gs.numberActiveTouches);
          pendingStroke.current = null;
          if (isDrawing.current) { isDrawing.current = false; cancelStrokeRef.current(); cancelLassoRef.current(); }
          return;
        }

        if (touches.length >= 2) {
          const g = gestureInfo.current;
          g.maxTouches = Math.max(g.maxTouches, touches.length);
          if (g.midStart) {
            const mid = getMidpointPage(touches);
            g.midMoved = Math.max(g.midMoved, Math.hypot(mid.x - g.midStart.x, mid.y - g.midStart.y));
          }
          if (!isPinching.current) startPinch(touches);

          const newDist = getDistance(touches);
          const mid = getMidpointPage(touches);

          if (pinchStartDistance.current > 0) {
            const ratio = scalePinchRatio(newDist / pinchStartDistance.current, settingsRef.current.zoomSensitivity);
            const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
              pinchStartScale.current * ratio));
            scale.value = newScale;
            lastScale.current = newScale;
            onZoomChangeRef.current?.(Math.round(newScale * 100));
          }

          const dx = scalePan(mid.x - panStartX.current, settingsRef.current.panSensitivity);
          const dy = scalePan(mid.y - panStartY.current, settingsRef.current.panSensitivity);
          const newTX = panLastTX.current + dx;
          const newTY = panLastTY.current + dy;
          translateX.value = newTX;
          translateY.value = newTY;
          lastTranslateX.current = newTX;
          lastTranslateY.current = newTY;
          bumpMeasureViewRef.current();
          return;
        }

        if (!isDrawing.current) return;
        const { pageX, pageY } = evt.nativeEvent;
        const tool = activeToolRef.current;

        if (tool === 'measure') {
          measureMoveRef.current(pageX, pageY);
          return;
        }

        if (tool === 'rectselect' && rectStartRef.current) {
          // Rectangle de sélection : 4 coins mis à jour en continu.
          const c = toCanvasCoords(pageX, pageY);
          const st = rectStartRef.current;
          continueLassoRef.current(st.x, st.y);
          continueLassoRef.current(c.x, st.y);
          continueLassoRef.current(c.x, c.y);
          continueLassoRef.current(st.x, c.y);
          return;
        }

        if (tool === 'shape' && shapeStartRef.current) {
          const c = toCanvasCoords(pageX, pageY);
          const st = shapeStartRef.current;
          setShapePreview({ kind: shapePreview?.kind ?? 'line', x: st.x, y: st.y, w: c.x - st.x, h: c.y - st.y });
          return;
        }

        if (tool === 'transform' && transformMode.current) {
          const tm = transformMode.current;
          const c = toCanvasCoords(pageX, pageY);
          const active = layersRef.current?.find(l => l.id === activeLayerIdRef.current);
          const img = active?.images?.[0];
          if (!img) return;
          if (!tm.snapshotted) {
            snapshotHistoryRef.current();
            tm.snapshotted = true;
          }
          if (tm.mode === 'move') {
            transformLayerImageRef.current(activeLayerIdRef.current, 0, {
              x: tm.orig.x + (c.x - tm.startX),
              y: tm.orig.y + (c.y - tm.startY),
            });
          } else if (tm.mode === 'resize') {
            transformLayerImageRef.current(activeLayerIdRef.current, 0, {
              width: Math.max(24, tm.orig.w + (c.x - tm.startX)),
              height: Math.max(24, tm.orig.h + (c.y - tm.startY)),
            });
          } else {
            const cx = tm.orig.x + tm.orig.w / 2;
            const cy = tm.orig.y + tm.orig.h / 2;
            const a0 = Math.atan2(tm.startY - cy, tm.startX - cx);
            const a1 = Math.atan2(c.y - cy, c.x - cx);
            const deg = (a1 - a0) * 180 / Math.PI;
            transformLayerImageRef.current(activeLayerIdRef.current, 0, {
              angle: Math.round(((tm.orig.angle + deg) % 360 + 540) % 360 - 180),
            });
          }
          return;
        }

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
        const pend = pendingStroke.current;
        if (pend) {
          pend.points.push(c);
          const gate = strokeGate({ elapsedMs: Date.now() - pend.t, maxTouches: gestureInfo.current.maxTouches, defer: true });
          if (gate === 'start') flushPendingStroke();
          else if (gate === 'cancel') pendingStroke.current = null;
          return;
        }
        continueStrokeRef.current(c.x, c.y);
      },

      onPanResponderRelease: () => {
        setPixelGestureRef.current(false);
        notePixelZoomRef.current(lastScale.current);
        // Tap multi-doigts (court, immobile) : 2 doigts annulent, 3 rétablissent.
        const g = gestureInfo.current;
        const dur = Date.now() - g.start;
        const isMultiTap = g.maxTouches >= 2 && dur < 350 && g.midMoved < 12;
        if (isPinching.current) {
          isPinching.current = false;
          if (isMultiTap) {
            if (g.maxTouches === 2 && settingsRef.current.undoTwoFingerTap) undoRef.current();
            if (g.maxTouches >= 3 && settingsRef.current.redoThreeFingerTap) redoRef.current();
          }
          return;
        }
        isDrawing.current = false;
        const tool = activeToolRef.current;
        if (tool === 'measure') {
          measureEndRef.current(false);
          return;
        }
        if (tool === 'lasso') {
          endLassoRef.current();
          return;
        }
        if (tool === 'rectselect') {
          // Le pipeline lasso (points en rectangle) se termine pareil.
          endLassoRef.current();
          rectStartRef.current = null;
          return;
        }
        if (tool === 'shape') {
          const p = shapePreview;
          const st = shapeStartRef.current;
          if (p && st) {
            const kind = (settingsRef.current.shapeKind ?? 'line') as 'line' | 'rect' | 'ellipse';
            if (Math.abs(p.w) > 2 || Math.abs(p.h) > 2) {
              addShapeRef.current(kind, kind === 'line' ? p.x : Math.min(p.x, p.x + p.w), kind === 'line' ? p.y : Math.min(p.y, p.y + p.h), p.w, p.h);
            }
          }
          setShapePreview(null);
          shapeStartRef.current = null;
          return;
        }
        if (tool === 'transform') {
          transformMode.current = null;
          return;
        }
        if (tool !== 'fill' && tool !== 'move') {
          // Un geste qui a vu 2 doigts ne laisse JAMAIS de trait (points noirs).
          if (!shouldCommitStroke(g.maxTouches)) { pendingStroke.current = null; cancelStrokeRef.current(); return; }
          // Tap bref à un doigt : le point voulu est tracé.
          if (pendingStroke.current) flushPendingStroke();
          endStrokeRef.current();
        }
      },

      onPanResponderTerminate: () => {
        setPixelGestureRef.current(false);
        notePixelZoomRef.current(lastScale.current);
        isPinching.current = false;
        isDrawing.current = false;
        measureEndRef.current(true);
        if (activeToolRef.current === 'measure') return;
        // Geste interrompu : un trait en attente ou multi-doigts est jeté.
        if (pendingStroke.current || !shouldCommitStroke(gestureInfo.current.maxTouches)) {
          pendingStroke.current = null;
          cancelStrokeRef.current();
          cancelLassoRef.current();
          return;
        }
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

  // Nouvelle toile chargée : vue remise à 100 % — avec le viewBox en
  // coordonnées toile, 100 %montre TOUJOURS la toile entière, quelle que
  // soit la taille de l'écran (fini la toile coupée sur mobile).
  const fittedKey = useRef('');
  useEffect(() => {
    if (!contentSize || width <= 0 || height <= 0) return;
    const key = `${contentSize.width}x${contentSize.height}`;
    if (fittedKey.current === key) return;
    fittedKey.current = key;
    resetZoomInternal();
  }, [contentSize, width, height, resetZoomInternal]);

  // Canvas background based on settings, overridden by the per-canvas
  // transparent flag (a transparent import shows the checker even when the
  // global background is white).
  const canvasBg = settings.canvasBg;
  const isTransparent = transparentBg === true || canvasBg === 'transparent';
  // Pendant une capture (export), le damier est masqué : le PNG garde une
  // transparence réelle au lieu de figer la représentation à l'écran.
  const [hideCheckerForCapture, setHideCheckerForCapture] = useState(false);
  const [pixelSuppressed, setPixelSuppressed] = useState(false);
  const pixelVisibleRef = useRef(false);
  // Outil Formes : fantôme de la forme en cours de tracé (coords toile).
  const [shapePreview, setShapePreview] = useState<{ kind: 'line' | 'rect' | 'ellipse'; x: number; y: number; w: number; h: number } | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Outil Rect : départ du rectangle de sélection.
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  // Outil Texte : modale de saisie à la position du tap.
  const [textModal, setTextModal] = useState<{ visible: boolean; x: number; y: number; value: string }>({ visible: false, x: 0, y: 0, value: '' });
  // Outil Transformer : image du calque actif sélectionnée + mode de poignée.
  const [transformSel, setTransformSel] = useState<number | null>(null);
  const transformMode = useRef<{ mode: 'move' | 'resize' | 'rotate'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number; angle: number }; snapshotted: boolean } | null>(null);
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

  // ─── Vue pixélisée (affichage seul) ───────────────────────────────
  // Un instantané raster du Svg, à raison d'un pixel par pixel de document,
  // est agrandi sans lissage par-dessus le Svg quand le zoom dépasse le
  // seuil. Pendant un geste (tracé, pinch…) on revient au Svg en direct.
  const svgWrapRef = useRef<View>(null);
  const [pixelSnap, setPixelSnap] = useState<string | null>(null);
  const docW = contentSize?.width ?? width;
  const docH = contentSize?.height ?? height;
  const pixelMode = settings.zoomRendering ?? 'smooth';
  const pixelEligible = pixelViewEligible(pixelMode, zoomForPixel, docW, docH) && width > 0 && height > 0;
  // Le contenu change → l'instantané est périmé (on n'affiche jamais un
  // ancien état du dessin, quitte à montrer la vue lisse un instant).
  useEffect(() => {
    setPixelSnap(null);
  }, [layers, selection, width, height, docW, docH, transparentBg, hideCheckerForCapture, settings.canvasBg, settings.showGrid, pixelMode]);
  useEffect(() => {
    if (!pixelEligible || pixelGesture || pixelSuppressed || pixelSnap) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Natif : capture à la taille native, réduite en Nearest dans
        // PixelatedView. Web : la toile à docW × docH, sans lissage.
        const snap = await capturePixelSnapshot(svgWrapRef.current, docW, docH);
        if (!cancelled && snap) setPixelSnap(snap);
      } catch {
        // Échec de capture : on reste simplement en vue lisse.
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pixelEligible, pixelGesture, pixelSuppressed, pixelSnap, width, height, docW, docH]);
  // Mode remis sur « lisse » ou zoom repassé sous le seuil : la mémoire de
  // l'instantané est libérée.
  useEffect(() => {
    if (!pixelEligible) setPixelSnap(null);
  }, [pixelEligible]);
  // Shift (desktop) = magnétisme 15° temporaire.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const on = (e: KeyboardEvent) => { shiftDownRef.current = e.shiftKey; };
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); };
  }, []);
  // Changer de mode (distance/angle) repart d'une mesure vierge.
  const changeMeasureMode = useCallback((m: MeasureMode) => {
    if (m === measureModeRef.current) return;
    if (measureRef.current && measureToLines(measureRef.current).length > 0) prevMeasureRef.current = measureRef.current;
    setMeasure(null);
    setMeasureMode(m);
  }, [setMeasure]);
  const measureTrace = useCallback(() => {
    const m = measureRef.current;
    const lines = measureToLines(m);
    if (lines.length === 0) return;
    addLines(lines.map(l => ({ x: l.from.x, y: l.from.y, w: l.to.x - l.from.x, h: l.to.y - l.from.y })));
    // La mesure tracée devient la « précédente » : le prochain segment
    // s'accroche à ses extrémités (polygones).
    prevMeasureRef.current = m;
    setMeasure(null);
  }, [addLines, setMeasure]);
  const measureClear = useCallback(() => { prevMeasureRef.current = null; setMeasure(null); }, [setMeasure]);
  const measureLen = useCallback((n: number) => {
    const m = measureRef.current;
    if (!m || !m.b) return;
    if (m.mode === 'distance') setMeasure(setDistanceFromInput(m, n, segmentAngleDeg(m.a, m.b)));
    else if (m.v) setMeasure(setAngleFromInput(m, angleAtVertex(m.a, m.v, m.b), n));
  }, [setMeasure]);
  const measureDeg = useCallback((n: number) => {
    const m = measureRef.current;
    if (!m || !m.b) return;
    if (m.mode === 'distance') setMeasure(setDistanceFromInput(m, distance(m.a, m.b), n));
    else setMeasure(setAngleFromInput(m, n));
  }, [setMeasure]);

  const showPixel = pixelEligible && !pixelGesture && !pixelSuppressed && !!pixelSnap;
  pixelVisibleRef.current = showPixel;

  if (width <= 0 || height <= 0) return null;

  // Coordonnées LOGIQUES = la toile (meta). Le viewBox du Svg mappe la toile
  // entière dans la zone écran : sur mobile, une toile plus grande que
  // l'écran est visible en entier et le dessin reste fidèle à l'export.
  const contentW = contentSize?.width ?? width;
  const contentH = contentSize?.height ?? height;

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
        <View ref={svgWrapRef} collapsable={false} style={{ width, height }}>
        <Svg
          width={width}
          height={height}
          viewBox={`0 0 ${contentW} ${contentH}`}
          preserveAspectRatio="xMidYMid meet"
          style={StyleSheet.absoluteFill}
        >
          {/* Background */}
          {transparentBg === true
            ? (!hideCheckerForCapture && <CheckerBg width={contentW} height={contentH} />)
            : (isTransparent
              ? <CheckerBg width={contentW} height={contentH} />
              : <Rect x={0} y={0} width={contentW} height={contentH} fill={bgColor} />)
          }

          {/* Grid / Dots overlay */}
          {showGrid && <GridOverlay width={contentW} height={contentH} color={overlayColor} />}
          {showDots && <DotsOverlay width={contentW} height={contentH} color={overlayColor} />}

          {/* Selection masks (outside = keep in place, inside = moves) */}
          {selection && (
            <Defs>
              <Mask id={`${selMaskBase}-out`} x="0" y="0" width={contentW} height={contentH}>
                <Rect x={0} y={0} width={width} height={height} fill="white" />
                <Polygon points={basePolygonPoints} fill="black" />
              </Mask>
              <Mask id={`${selMaskBase}-in`} x="0" y="0" width={contentW} height={contentH}>
                <Rect x={0} y={0} width={width} height={height} fill="black" />
                <Polygon points={selPolygonPoints} fill="white" />
              </Mask>
            </Defs>
          )}

          {/* Fantôme de l'outil Formes (contour pointillé). */}
          {shapePreview && (() => {
            const p = shapePreview;
            const common = { stroke: activeColorRef.current, strokeWidth: Math.max(1.5, 2 / Math.max(0.0001, Math.min(width / (contentSizeRef.current?.width ?? width), height / (contentSizeRef.current?.height ?? height)))), strokeDasharray: '8 6', fill: 'none' } as const;
            if (p.kind === 'line') {
              return <Path d={`M ${p.x} ${p.y} L ${p.x + p.w} ${p.y + p.h}`} {...common} />;
            }
            if (p.kind === 'rect') {
              return <Rect x={Math.min(p.x, p.x + p.w)} y={Math.min(p.y, p.y + p.h)} width={Math.abs(p.w)} height={Math.abs(p.h)} {...common} />;
            }
            return <Ellipse cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={Math.abs(p.w) / 2} ry={Math.abs(p.h) / 2} {...common} />;
          })()}

          {/* Poignées de l'outil Transformer (image du calque actif). */}
          {activeTool === 'transform' && transformSel === 0 && (() => {
            const img = layersRef.current?.find(l => l.id === activeLayerIdRef.current)?.images?.[0];
            if (!img) return null;
            const k = 14 / Math.max(0.0001, Math.min(width / (contentSizeRef.current?.width ?? width), height / (contentSizeRef.current?.height ?? height)));
            const handles = [
              { cx: img.x + img.width, cy: img.y + img.height, color: activeColorRef.current },
              { cx: img.x + img.width, cy: img.y, color: '#ffffff' },
            ];
            return (
              <G>
                <Rect x={img.x} y={img.y} width={img.width} height={img.height} stroke={activeColorRef.current} strokeWidth={2 / Math.max(0.0001, Math.min(width / (contentSizeRef.current?.width ?? width), 1))} strokeDasharray="10 6" fill="none" />
                {handles.map((h, i) => (
                  <Circle key={i} cx={h.cx} cy={h.cy} r={k} fill={h.color} stroke={activeColorRef.current} strokeWidth={2 / Math.max(0.0001, Math.min(width / (contentSizeRef.current?.width ?? width), 1))} />
                ))}
              </G>
            );
          })()}

          {/* Layers. The active layer renders in two masked halves while a
              selection is being dragged; everything else paints normally. */}
          {layers.map(layer => {
            if (layer.id !== activeLayerId || !floating) {
              return (
                <CanvasArt
                  key={layer.id}
                  layers={[layer]}
                  width={contentW}
                  height={contentH}
                  variant={layer.id}
                />
              );
            }
            return (
              <G key={layer.id}>
                <CanvasArt
                  layers={[layer]}
                  width={contentW}
                  height={contentH}
                  variant={`${layer.id}-out`}
                  maskId={`${selMaskBase}-out`}
                />
                <CanvasArt
                  layers={[layer]}
                  width={contentW}
                  height={contentH}
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
        </View>
      </Animated.View>
      {/* Vue pixélisée dans l'ESPACE ÉCRAN : le zoom est appliqué en Nearest
          par PixelatedView (jamais par le scale natif, qui lisse). Sous la
          surcouche Mesure, qui reste au-dessus. */}
      {showPixel && pixelSnap && (
        <PixelatedView
          source={pixelSnap} width={width} height={height} docW={docW} docH={docH}
          translateX={translateX} translateY={translateY} scale={scale}
        />
      )}
      {/* Outil Mesure : hors de la vue zoomée (taille constante à l'écran),
          hors de l'instantané pixélisé, masqué pendant l'export. */}
      {activeTool === 'measure' && !pixelSuppressed && measure && (
        <MeasureGraphics measure={measure} view={viewParams(lastScale.current, lastTranslateX.current, lastTranslateY.current, width, height, docW, docH)} width={width} height={height} />
      )}
      {activeTool === 'measure' && !pixelSuppressed && (
        <MeasurePanel
          accent={theme.accent}
          mode={measureMode} setMode={changeMeasureMode}
          snap15={snap15} setSnap15={setSnap15}
          snapEnds={snapEnds} setSnapEnds={setSnapEnds}
          measure={measure}
          onLen={measureLen} onDeg={measureDeg}
          onTrace={measureTrace} onClear={measureClear}
        />
      )}
    </View>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});

export default React.memo(DrawingCanvas);
