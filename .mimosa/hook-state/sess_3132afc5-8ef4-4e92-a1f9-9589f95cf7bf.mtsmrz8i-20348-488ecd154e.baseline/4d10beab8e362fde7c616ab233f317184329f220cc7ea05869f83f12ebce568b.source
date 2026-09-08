// Powered by OnSpace.AI
import React, { createContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import {
  Automation, AutomationTrigger,
  getAutomations, saveAutomation, deleteAutomation, toggleAutomation,
  generateAutoId, buildStrokeAutomation, AUTOMATION_TEMPLATES,
} from '@/services/automationService';
import { StrokePath } from '@/contexts/CanvasContext';

interface AutomationContextType {
  automations: Automation[];
  recording: boolean;
  recordedStrokes: StrokePath[];

  // CRUD
  addAutomation: (auto: Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Automation>;
  removeAutomation: (id: string) => Promise<void>;
  toggleEnabled: (id: string, enabled: boolean) => Promise<void>;
  addFromTemplate: (templateIndex: number) => Promise<Automation>;

  // Recording
  startRecording: () => void;
  stopRecording: (name: string, canvasId?: string) => Promise<Automation | null>;
  cancelRecording: () => void;
  addRecordedStroke: (stroke: StrokePath) => void;

  // Execution
  executeAutomation: (
    id: string,
    ctx: {
      setTool: (t: string) => void;
      setColor: (c: string) => void;
      setBrushSize: (s: number) => void;
      fillLayer: (layerId: string, color: string) => void;
      clearLayer: (layerId: string) => void;
      replayStrokes: (strokes: StrokePath[]) => void;
      activeLayerId: string;
    }
  ) => Promise<void>;
  runTrigger: (
    trigger: AutomationTrigger,
    ctx: {
      setTool: (t: string) => void;
      setColor: (c: string) => void;
      setBrushSize: (s: number) => void;
      fillLayer: (layerId: string, color: string) => void;
      clearLayer: (layerId: string) => void;
      replayStrokes: (strokes: StrokePath[]) => void;
      activeLayerId: string;
    }
  ) => Promise<void>;

  reload: () => Promise<void>;
}

export const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

export function AutomationProvider({ children }: { children: ReactNode }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedStrokes, setRecordedStrokes] = useState<StrokePath[]>([]);

  const reload = useCallback(async () => {
    const list = await getAutomations();
    setAutomations(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addAutomation = useCallback(async (auto: Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Automation> => {
    const full: Automation = {
      ...auto,
      id: generateAutoId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveAutomation(full);
    setAutomations(prev => [...prev, full]);
    return full;
  }, []);

  const removeAutomation = useCallback(async (id: string) => {
    await deleteAutomation(id);
    setAutomations(prev => prev.filter(a => a.id !== id));
  }, []);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    await toggleAutomation(id, enabled);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled } : a));
  }, []);

  const addFromTemplate = useCallback(async (idx: number): Promise<Automation> => {
    const tpl = AUTOMATION_TEMPLATES[idx];
    return addAutomation(tpl);
  }, [addAutomation]);

  const startRecording = useCallback(() => {
    setRecording(true);
    setRecordedStrokes([]);
  }, []);

  const addRecordedStroke = useCallback((stroke: StrokePath) => {
    setRecordedStrokes(prev => [...prev, stroke]);
  }, []);

  const stopRecording = useCallback(async (name: string, canvasId?: string): Promise<Automation | null> => {
    if (recordedStrokes.length === 0) {
      setRecording(false);
      return null;
    }
    const auto = buildStrokeAutomation(name, recordedStrokes, canvasId);
    await saveAutomation(auto);
    setAutomations(prev => [...prev, auto]);
    setRecording(false);
    setRecordedStrokes([]);
    return auto;
  }, [recordedStrokes]);

  const cancelRecording = useCallback(() => {
    setRecording(false);
    setRecordedStrokes([]);
  }, []);

  const executeAutomation = useCallback(async (id: string, ctx: Parameters<AutomationContextType['executeAutomation']>[1]) => {
    const auto = automations.find(a => a.id === id);
    if (!auto || !auto.enabled) return;
    for (const action of auto.actions) {
      if (action.delay && action.delay > 0) {
        await new Promise(r => setTimeout(r, action.delay));
      }
      switch (action.type) {
        case 'set_tool':
          if (action.tool) ctx.setTool(action.tool);
          break;
        case 'set_color':
          if (action.color) ctx.setColor(action.color);
          break;
        case 'set_size':
          if (action.size !== undefined) ctx.setBrushSize(action.size);
          break;
        case 'fill_layer':
          ctx.fillLayer(ctx.activeLayerId, action.color ?? '#ffffff');
          break;
        case 'clear_layer':
          ctx.clearLayer(ctx.activeLayerId);
          break;
        case 'play_strokes':
          if (action.strokes) ctx.replayStrokes(action.strokes);
          break;
      }
    }
  }, [automations]);

  const runTrigger = useCallback(async (trigger: AutomationTrigger, ctx: Parameters<AutomationContextType['runTrigger']>[1]) => {
    const matching = automations.filter(a => a.trigger === trigger && a.enabled);
    for (const auto of matching) {
      await executeAutomation(auto.id, ctx);
    }
  }, [automations, executeAutomation]);

  return (
    <AutomationContext.Provider value={{
      automations, recording, recordedStrokes,
      addAutomation, removeAutomation, toggleEnabled, addFromTemplate,
      startRecording, stopRecording, cancelRecording, addRecordedStroke,
      executeAutomation, runTrigger,
      reload,
    }}>
      {children}
    </AutomationContext.Provider>
  );
}
