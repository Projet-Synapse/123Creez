// Powered by OnSpace.AI
import React, {
  createContext, useState, useCallback,
  ReactNode, useRef,
} from 'react';
import { useTheme } from '@/hooks/useTheme';
import { splitStrokesByPolygon, Point, distanceToStroke } from '@/services/selectionService';

export type Tool = 'brush' | 'pencil' | 'eraser' | 'fill' | 'lasso' | 'move' | 'pick';

/** Image posée sur un calque (import du dossier vault). Coordonnées canvas. */
export interface LayerImage {
  id: string;
  /** dataURL PNG/JPG — autoporteur, survit à la sync. */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: StrokePath[];
  /** Images de fond (importées du dossier vault), peintes sous les traits. */
  images?: LayerImage[];
  /** Organisational group (no effect on stacking order). */
  groupId?: string | null;
}

export interface LayerGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

export interface StrokePath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  size: number;
  opacity: number;
  tool: Tool;
  layerId: string;
}

/** A freeform (lasso) selection: the hand-drawn polygon in canvas space plus
    the live translation applied while the user drags it. The strokes are NOT
    mutated while the selection floats — `commitSelection` bakes the move in
    by cutting strokes along the polygon (only what's inside moves). */
export interface Selection {
  points: Point[];
  offset: Point;
}

interface CanvasContextType {
  layers: Layer[];
  layerGroups: LayerGroup[];
  activeLayerId: string;
  activeTool: Tool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  history: Layer[][];
  redoStack: Layer[][];
  currentStroke: StrokePath | null;
  isDirty: boolean;
  canvasId: string | null;
  selection: Selection | null;
  currentLassoPoints: { x: number; y: number }[];

  setActiveTool: (tool: Tool) => void;
  setActiveColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setActiveLayerId: (id: string) => void;
  setSelection: (sel: Selection | null) => void;
  clearSelection: () => void;
  /** Bakes a floating selection move into the strokes (cut along the
      polygon, inside parts translated). Returns the new layers when a move
      was applied so callers can persist immediately, null otherwise. */
  commitSelection: () => Layer[] | null;

  beginStroke: (x: number, y: number, sizeScale?: number) => void;
  cancelStroke: () => void;
  cancelLasso: () => void;
  continueStroke: (x: number, y: number) => void;
  endStroke: () => void;

  // Lasso
  beginLasso: (x: number, y: number) => void;
  continueLasso: (x: number, y: number) => void;
  endLasso: () => void;

  // Move selection
  moveSelection: (dx: number, dy: number) => void;

  addLayer: () => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  /** Doigt : sélectionne le calque visible le plus haut sous le point. */
  pickLayerAt: (x: number, y: number) => Layer | null;
  addLayerGroup: (name?: string) => LayerGroup;
  renameLayerGroup: (id: string, name: string) => void;
  removeLayerGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  setLayerGroup: (layerId: string, groupId: string | null) => void;
  toggleGroupVisibility: (id: string) => void;

  undo: () => void;
  redo: () => void;
  /** Push the current layers onto the history stack without altering them —
      used by the editor to snapshot once at the start of a drag gesture
      (e.g. moving a selection) instead of once per pointer event. */
  snapshotHistory: () => void;
  clearCanvas: () => void;
  clearLayer: (id: string) => void;
  fillLayer: (layerId: string, color: string) => void;

  loadLayers: (canvasId: string, layers: Layer[], activeLayerId: string, groups?: LayerGroup[]) => void;
  markClean: () => void;
}

export const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const createDefaultLayers = (): Layer[] => [
  { id: 'layer-1', name: 'Calque 1', visible: true, opacity: 1, strokes: [] },
];

export function CanvasProvider({ children }: { children: ReactNode }) {
  const { settings } = useTheme();
  const historyLimit = Math.max(5, settings.historyLimit ?? 30);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>(createDefaultLayers());
  const [layerGroups, setLayerGroups] = useState<LayerGroup[]>([]);
  const [activeLayerId, setActiveLayerId] = useState('layer-1');
  const [activeTool, setActiveToolState] = useState<Tool>('brush');
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(12);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [history, setHistory] = useState<Layer[][]>([]);
  const [redoStack, setRedoStack] = useState<Layer[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePath | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [currentLassoPoints, setCurrentLassoPoints] = useState<{ x: number; y: number }[]>([]);

  const strokeIdRef = useRef(0);
  const layerIdRef = useRef(2);
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);

  const saveHistory = useCallback((prevLayers: Layer[]) => {
    setHistory(h => [...h.slice(-(historyLimit - 1)), prevLayers.map(l => ({ ...l, strokes: [...l.strokes] }))]);
    setRedoStack([]);
  }, [historyLimit]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const markClean = useCallback(() => setIsDirty(false), []);

  const activeLayerIdRef = useRef(activeLayerId);
  activeLayerIdRef.current = activeLayerId;
  const selectionRef = useRef<Selection | null>(selection);
  selectionRef.current = selection;
  // Live offset accumulator for the floating selection. Pointer events fire
  // faster than React renders, so accumulating through state reads would
  // drop all but the last delta — this ref is the source of truth during a
  // drag and is reset wherever the selection is created or cleared.
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ─── Commit ──────────────────────────────────────────────────────────
  // Bakes a floating selection move into the stroke data. Splitting runs at
  // commit time (not during the drag) keeps the gesture non-destructive and
  // lets Ctrl+Z simply discard the float. The selection outline stays in
  // place with its offset reset — an auto-save can fire mid-drag, and the
  // drag continues cleanly from the newly-baked positions.
  const commitSelection = useCallback((): Layer[] | null => {
    const sel = selectionRef.current;
    if (!sel) return null;
    const offset = offsetRef.current;
    if (offset.x === 0 && offset.y === 0) return null;
    const base = layersRef.current;
    const next = base.map(layer =>
      layer.id === activeLayerIdRef.current
        ? { ...layer, strokes: splitStrokesByPolygon(layer.strokes, sel.points, offset) }
        : layer
    );
    saveHistory(base);
    setLayers(next);
    setSelection({ points: sel.points, offset: { x: 0, y: 0 } });
    offsetRef.current = { x: 0, y: 0 };
    markDirty();
    return next;
  }, [saveHistory, markDirty]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setCurrentLassoPoints([]);
    offsetRef.current = { x: 0, y: 0 };
  }, []);


  const loadLayers = useCallback((id: string, newLayers: Layer[], newActiveLayerId: string, newGroups?: LayerGroup[]) => {
    setCanvasId(id);
    setLayers(newLayers);
    setLayerGroups(newGroups ?? []);
    setActiveLayerId(newActiveLayerId);
    setHistory([]);
    setRedoStack([]);
    setCurrentStroke(null);
    setIsDirty(false);
    setSelection(null);
    setCurrentLassoPoints([]);
  }, []);

  const beginStroke = useCallback((x: number, y: number, sizeScale = 1) => {
    if (activeTool === 'fill' || activeTool === 'lasso' || activeTool === 'move' || activeTool === 'pick') return;
    // Painting while a lasso move is floating would render the new stroke
    // half-shifted — finalize the move first.
    commitSelection();
    const id = `stroke-${++strokeIdRef.current}`;
    const stroke: StrokePath = {
      id,
      points: [{ x, y }],
      color: activeTool === 'eraser' ? '#eraser' : activeColor,
      // size en px de TOILE : l'écran passe un facteur (zone → toile) pour
      // que le trait ait la même épaisseur relative sur tous les appareils.
      size: Math.max(0.5, brushSize * sizeScale),
      opacity: brushOpacity,
      tool: activeTool,
      layerId: activeLayerId,
    };
    setCurrentStroke(stroke);
  }, [activeTool, activeColor, brushSize, brushOpacity, activeLayerId, commitSelection]);

  const continueStroke = useCallback((x: number, y: number) => {
    setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
  }, []);

  // Jette le trait/lasso EN COURS sans le committer — utilisé quand un
  // deuxième doigt transforme le geste en pinch/pan (le fragment tracé ne
  // doit pas rester sur la toile).
  const cancelStroke = useCallback(() => {
    setCurrentStroke(null);
  }, []);

  const cancelLasso = useCallback(() => {
    setCurrentLassoPoints([]);
  }, []);

  const endStroke = useCallback(() => {
    setCurrentStroke(prev => {
      if (!prev || prev.points.length === 0) return null;
      setLayers(layers => {
        saveHistory(layers);
        return layers.map(layer =>
          layer.id === activeLayerId
            ? { ...layer, strokes: [...layer.strokes, prev] }
            : layer
        );
      });
      markDirty();
      return null;
    });
  }, [activeLayerId, saveHistory, markDirty]);

  // ─── Lasso ───────────────────────────────────────────────────────────
  const beginLasso = useCallback((x: number, y: number) => {
    // Starting a new lasso finalizes any pending floating move first.
    commitSelection();
    offsetRef.current = { x: 0, y: 0 };
    setCurrentLassoPoints([{ x, y }]);
    setSelection(null);
  }, [commitSelection]);

  const continueLasso = useCallback((x: number, y: number) => {
    setCurrentLassoPoints(prev => [...prev, { x, y }]);
  }, []);

  const endLasso = useCallback(() => {
    setCurrentLassoPoints(pts => {
      if (pts.length < 3) {
        setSelection(null);
        return [];
      }
      // Drop consecutive duplicates — pointermove fires even without real
      // movement, and zero-length edges confuse the boundary math.
      const cleaned: { x: number; y: number }[] = [];
      for (const p of pts) {
        const last = cleaned[cleaned.length - 1];
        if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) {
          cleaned.push(p);
        }
      }
      if (cleaned.length < 3) {
        setSelection(null);
        return [];
      }
      offsetRef.current = { x: 0, y: 0 };
      setSelection({ points: cleaned, offset: { x: 0, y: 0 } });
      return [];
    });
  }, []);

  // ─── Move ────────────────────────────────────────────────────────────
  // With an active selection the drag only translates the floating polygon
  // (the renderer splits inside/outside live); the strokes are cut for real
  // at commit time. Without one, the whole active layer's content moves.
  const moveSelection = useCallback((dx: number, dy: number) => {
    const sel = selectionRef.current;
    if (sel) {
      offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
      setSelection({ ...sel, offset: { ...offsetRef.current } });
      markDirty();
      return;
    }
    setLayers(prev => prev.map(layer => {
      if (layer.id !== activeLayerIdRef.current) return layer;
      return {
        ...layer,
        strokes: layer.strokes.map(stroke => stroke.tool === 'fill'
          ? stroke
          : { ...stroke, points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }),
      };
    }));
    markDirty();
  }, [markDirty]);

  const setActiveTool = useCallback((tool: Tool) => {
    // A pending floating move is finalized when the user leaves the move
    // workflow, so the painted result always matches what's on screen.
    commitSelection();
    setActiveToolState(tool);
  }, [commitSelection]);

  // ─── Doigt : hit-test de calque ─────────────────────────────────────
  // Calque visible le plus HAUT sous le point (fin de tableau = dessus).
  // Tolérance : demi-épaisseur du trait + 8 px de pretexte de clic.
  const pickLayerAt = useCallback((x: number, y: number): Layer | null => {
    const TOLERANCE = 8;
    for (let li = layersRef.current.length - 1; li >= 0; li--) {
      const layer = layersRef.current[li];
      if (!layer.visible) continue;
      for (const stroke of layer.strokes) {
        if (stroke.tool === 'fill') continue;
        if (distanceToStroke(x, y, stroke.points) <= stroke.size / 2 + TOLERANCE) {
          setActiveLayerId(layer.id);
          return layer;
        }
      }
    }
    return null;
  }, []);

  const addLayerGroup = useCallback((name?: string): LayerGroup => {
    const group: LayerGroup = { id: `lgroup-${++layerIdRef.current}`, name: name?.trim() || 'Groupe' };
    setLayerGroups(prev => [...prev, group]);
    return group;
  }, []);

  const renameLayerGroup = useCallback((id: string, name: string) => {
    setLayerGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }, []);

  const removeLayerGroup = useCallback((id: string) => {
    setLayerGroups(prev => prev.filter(g => g.id !== id));
    setLayers(prev => prev.map(l => l.groupId === id ? { ...l, groupId: null } : l));
    markDirty();
  }, [markDirty]);

  const toggleGroupCollapsed = useCallback((id: string) => {
    setLayerGroups(prev => prev.map(g => g.id === id ? { ...g, collapsed: !g.collapsed } : g));
  }, []);

  const setLayerGroup = useCallback((layerId: string, groupId: string | null) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, groupId } : l));
    markDirty();
  }, [markDirty]);

  const toggleGroupVisibility = useCallback((id: string) => {
    setLayers(prev => {
      const inGroup = prev.filter(l => l.groupId === id);
      const anyVisible = inGroup.some(l => l.visible);
      return prev.map(l => l.groupId === id ? { ...l, visible: !anyVisible } : l);
    });
    markDirty();
  }, [markDirty]);

  const fillLayer = useCallback((layerId: string, color: string) => {
    commitSelection();
    const id = `stroke-fill-${++strokeIdRef.current}`;
    const fillStroke: StrokePath = {
      id, points: [{ x: -1, y: -1 }], color,
      size: 0, opacity: brushOpacity, tool: 'fill', layerId,
    };
    setLayers(prev => {
      saveHistory(prev);
      return prev.map(layer =>
        layer.id === layerId ? { ...layer, strokes: [...layer.strokes, fillStroke] } : layer
      );
    });
    markDirty();
  }, [brushOpacity, saveHistory, markDirty, commitSelection]);

  const undo = useCallback(() => {
    // Undo cancels the current float first (nothing was applied yet); with
    // no live offset it rolls the strokes back normally.
    const sel = selectionRef.current;
    if (sel && (offsetRef.current.x !== 0 || offsetRef.current.y !== 0)) {
      setSelection({ ...sel, offset: { x: 0, y: 0 } });
      offsetRef.current = { x: 0, y: 0 };
      return;
    }
    if (history.length === 0) return;
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = [...h];
      const last = prev.pop()!;
      setRedoStack(r => [...r, layers.map(l => ({ ...l, strokes: [...l.strokes] }))]);
      setLayers(last);
      return prev;
    });
    markDirty();
  }, [history.length, layers, markDirty]);

  const redo = useCallback(() => {
    const sel = selectionRef.current;
    if (sel && (offsetRef.current.x !== 0 || offsetRef.current.y !== 0)) {
      setSelection({ ...sel, offset: { x: 0, y: 0 } });
      offsetRef.current = { x: 0, y: 0 };
      return;
    }
    if (redoStack.length === 0) return;
    setRedoStack(r => {
      if (r.length === 0) return r;
      const next = [...r];
      const last = next.pop()!;
      setHistory(h => [...h, layers.map(l => ({ ...l, strokes: [...l.strokes] }))]);
      setLayers(last);
      return next;
    });
    markDirty();
  }, [redoStack.length, layers, markDirty]);

  const snapshotHistory = useCallback(() => {
    saveHistory(layersRef.current);
  }, [saveHistory]);

  const clearCanvas = useCallback(() => {
    setLayers(prev => { saveHistory(prev); return prev.map(l => ({ ...l, strokes: [] })); });
    setSelection(null);
    markDirty();
  }, [saveHistory, markDirty]);

  const clearLayer = useCallback((id: string) => {
    setLayers(prev => { saveHistory(prev); return prev.map(l => l.id === id ? { ...l, strokes: [] } : l); });
    markDirty();
  }, [saveHistory, markDirty]);

  const addLayer = useCallback(() => {
    const id = `layer-${++layerIdRef.current}`;
    const newLayer: Layer = { id, name: `Calque ${layerIdRef.current}`, visible: true, opacity: 1, strokes: [] };
    setLayers(prev => { saveHistory(prev); return [...prev, newLayer]; });
    setActiveLayerId(id);
    markDirty();
  }, [saveHistory, markDirty]);

  const removeLayer = useCallback((id: string) => {
    setLayers(prev => {
      if (prev.length <= 1) return prev;
      saveHistory(prev);
      const filtered = prev.filter(l => l.id !== id);
      if (activeLayerId === id) setActiveLayerId(filtered[filtered.length - 1].id);
      return filtered;
    });
    markDirty();
  }, [activeLayerId, saveHistory, markDirty]);

  // Visibility and opacity edits now mark the canvas dirty (they previously
  // weren't persisted by auto-save) and visibility changes are undoable.
  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => {
      saveHistory(prev);
      return prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    });
    markDirty();
  }, [saveHistory, markDirty]);

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l));
    markDirty();
  }, [markDirty]);

  return (
    <CanvasContext.Provider value={{
      layers, layerGroups, activeLayerId, activeTool, activeColor,
      brushSize, brushOpacity, history, redoStack, currentStroke,
      isDirty, canvasId, selection, currentLassoPoints,
      setActiveTool, setActiveColor, setBrushSize, setBrushOpacity,
      setActiveLayerId, setSelection, clearSelection, commitSelection,
      beginStroke, continueStroke, endStroke, cancelStroke, cancelLasso,
      beginLasso, continueLasso, endLasso,
      moveSelection,
      addLayer, removeLayer, toggleLayerVisibility, setLayerOpacity,
      pickLayerAt, addLayerGroup, renameLayerGroup, removeLayerGroup,
      toggleGroupCollapsed, setLayerGroup, toggleGroupVisibility,
      undo, redo, snapshotHistory, clearCanvas, clearLayer, fillLayer,
      loadLayers, markClean,
    }}>
      {children}
    </CanvasContext.Provider>
  );
}
