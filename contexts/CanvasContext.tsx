// Powered by OnSpace.AI
import React, {
  createContext, useState, useCallback,
  ReactNode, useRef,
} from 'react';
import { useTheme } from '@/hooks/useTheme';

export type Tool = 'brush' | 'pencil' | 'eraser' | 'fill' | 'lasso' | 'move';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: StrokePath[];
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

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasContextType {
  layers: Layer[];
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
  selection: SelectionRect | null;
  currentLassoPoints: { x: number; y: number }[];

  setActiveTool: (tool: Tool) => void;
  setActiveColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setActiveLayerId: (id: string) => void;
  setSelection: (sel: SelectionRect | null) => void;
  clearSelection: () => void;

  beginStroke: (x: number, y: number) => void;
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

  undo: () => void;
  redo: () => void;
  /** Push the current layers onto the history stack without altering them —
      used by the editor to snapshot once at the start of a drag gesture
      (e.g. moving a selection) instead of once per pointer event. */
  snapshotHistory: () => void;
  clearCanvas: () => void;
  clearLayer: (id: string) => void;
  fillLayer: (layerId: string, color: string) => void;

  loadLayers: (canvasId: string, layers: Layer[], activeLayerId: string) => void;
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
  const [activeLayerId, setActiveLayerId] = useState('layer-1');
  const [activeTool, setActiveTool] = useState<Tool>('brush');
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(12);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [history, setHistory] = useState<Layer[][]>([]);
  const [redoStack, setRedoStack] = useState<Layer[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePath | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
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

  const loadLayers = useCallback((id: string, newLayers: Layer[], newActiveLayerId: string) => {
    setCanvasId(id);
    setLayers(newLayers);
    setActiveLayerId(newActiveLayerId);
    setHistory([]);
    setRedoStack([]);
    setCurrentStroke(null);
    setIsDirty(false);
    setSelection(null);
    setCurrentLassoPoints([]);
  }, []);

  const beginStroke = useCallback((x: number, y: number) => {
    if (activeTool === 'fill' || activeTool === 'lasso' || activeTool === 'move') return;
    const id = `stroke-${++strokeIdRef.current}`;
    const stroke: StrokePath = {
      id,
      points: [{ x, y }],
      color: activeTool === 'eraser' ? '#eraser' : activeColor,
      size: brushSize,
      opacity: brushOpacity,
      tool: activeTool,
      layerId: activeLayerId,
    };
    setCurrentStroke(stroke);
  }, [activeTool, activeColor, brushSize, brushOpacity, activeLayerId]);

  const continueStroke = useCallback((x: number, y: number) => {
    setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
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
    setCurrentLassoPoints([{ x, y }]);
    setSelection(null);
  }, []);

  const continueLasso = useCallback((x: number, y: number) => {
    setCurrentLassoPoints(prev => [...prev, { x, y }]);
  }, []);

  const endLasso = useCallback(() => {
    setCurrentLassoPoints(pts => {
      if (pts.length < 3) {
        setSelection(null);
        return [];
      }
      // Compute bounding box of lasso points
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      setSelection({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
      return [];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setCurrentLassoPoints([]);
  }, []);

  // ─── Move ─────────────────────────────────────────────────────────────
  // With an active selection, only the strokes it covers are moved (fill
  // strokes cover the whole canvas and are never moved). Without one, the
  // whole active layer's content moves — the previous behavior moved every
  // stroke even with a lasso selection, making the lasso useless.
  const moveSelection = useCallback((dx: number, dy: number) => {
    const sel = selection;
    const hit = (stroke: StrokePath) => {
      if (stroke.tool === 'fill') return false;
      if (!sel) return true;
      const pad = stroke.size / 2;
      return stroke.points.some(p =>
        p.x >= sel.x - pad && p.x <= sel.x + sel.width + pad &&
        p.y >= sel.y - pad && p.y <= sel.y + sel.height + pad
      );
    };
    setSelection(prev => prev ? { ...prev, x: prev.x + dx, y: prev.y + dy } : null);
    setLayers(prev => prev.map(layer => {
      if (layer.id !== activeLayerId) return layer;
      return {
        ...layer,
        strokes: layer.strokes.map(stroke => hit(stroke)
          ? { ...stroke, points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          : stroke),
      };
    }));
    markDirty();
  }, [activeLayerId, selection, markDirty]);

  const fillLayer = useCallback((layerId: string, color: string) => {
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
  }, [brushOpacity, saveHistory, markDirty]);

  const undo = useCallback(() => {
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
      layers, activeLayerId, activeTool, activeColor,
      brushSize, brushOpacity, history, redoStack, currentStroke,
      isDirty, canvasId, selection, currentLassoPoints,
      setActiveTool, setActiveColor, setBrushSize, setBrushOpacity,
      setActiveLayerId, setSelection, clearSelection,
      beginStroke, continueStroke, endStroke,
      beginLasso, continueLasso, endLasso,
      moveSelection,
      addLayer, removeLayer, toggleLayerVisibility, setLayerOpacity,
      undo, redo, snapshotHistory, clearCanvas, clearLayer, fillLayer,
      loadLayers, markClean,
    }}>
      {children}
    </CanvasContext.Provider>
  );
}
