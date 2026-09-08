// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StrokePath } from '@/contexts/CanvasContext';

const KEY_PREFIX = 'automation:';
const INDEX_KEY = 'automations:index';

export type AutomationTrigger = 'manual' | 'on_open' | 'on_save';
export type AutomationActionType = 'play_strokes' | 'clear_layer' | 'fill_layer' | 'set_color' | 'set_tool' | 'set_size';

export interface AutomationAction {
  type: AutomationActionType;
  /** Strokes to replay (for play_strokes) */
  strokes?: StrokePath[];
  /** Color value (for fill_layer, set_color) */
  color?: string;
  /** Layer id to target */
  layerId?: string;
  /** Tool name (for set_tool) */
  tool?: string;
  /** Brush size (for set_size) */
  size?: number;
  /** Delay in ms before this action */
  delay?: number;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** ID of the canvas this automation was recorded on (optional) */
  canvasId?: string;
  /** Icon name (MaterialCommunityIcons) */
  icon: string;
  /** Accent color */
  color: string;
}

export function generateAutoId(): string {
  return `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAutomations(): Promise<Automation[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids: string[] = JSON.parse(raw);
    const results = await Promise.all(
      ids.map(async id => {
        const val = await AsyncStorage.getItem(`${KEY_PREFIX}${id}`);
        return val ? (JSON.parse(val) as Automation) : null;
      })
    );
    return results.filter(Boolean) as Automation[];
  } catch {
    return [];
  }
}

export async function saveAutomation(automation: Automation): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${automation.id}`, JSON.stringify(automation));
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(automation.id)) {
      ids.push(automation.id);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    }
  } catch (e) {
    console.warn('saveAutomation error', e);
  }
}

export async function deleteAutomation(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${KEY_PREFIX}${id}`);
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids.filter(x => x !== id)));
  } catch (e) {
    console.warn('deleteAutomation error', e);
  }
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<void> {
  const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${id}`);
  if (!raw) return;
  const automation: Automation = JSON.parse(raw);
  automation.enabled = enabled;
  automation.updatedAt = Date.now();
  await saveAutomation(automation);
}

/** Build a "record strokes" automation from a set of recorded strokes */
export function buildStrokeAutomation(
  name: string,
  strokes: StrokePath[],
  canvasId?: string
): Automation {
  return {
    id: generateAutoId(),
    name,
    description: `Rejoue ${strokes.length} trait${strokes.length !== 1 ? 's' : ''} enregistré${strokes.length !== 1 ? 's' : ''}`,
    trigger: 'manual',
    actions: [{ type: 'play_strokes', strokes, delay: 0 }],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    canvasId,
    icon: 'play-circle-outline',
    color: '#4ecdc4',
  };
}

/** Built-in automation templates */
export const AUTOMATION_TEMPLATES: Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Effacer au démarrage',
    description: 'Efface le calque actif à chaque ouverture de la toile',
    trigger: 'on_open',
    actions: [{ type: 'clear_layer', delay: 0 }],
    enabled: false,
    icon: 'refresh',
    color: '#ff6b6b',
  },
  {
    name: 'Fond blanc automatique',
    description: 'Remplit le calque 1 en blanc à l\'ouverture',
    trigger: 'on_open',
    actions: [{ type: 'fill_layer', color: '#ffffff', delay: 0 }],
    enabled: false,
    icon: 'square-outline',
    color: '#e0e0e0',
  },
  {
    name: 'Fond noir automatique',
    description: 'Remplit le calque 1 en noir à l\'ouverture',
    trigger: 'on_open',
    actions: [{ type: 'fill_layer', color: '#000000', delay: 0 }],
    enabled: false,
    icon: 'square',
    color: '#333333',
  },
  {
    name: 'Pinceau fin',
    description: 'Configure le pinceau en taille 3px, opacité 100%',
    trigger: 'manual',
    actions: [
      { type: 'set_tool', tool: 'pencil', delay: 0 },
      { type: 'set_size', size: 3, delay: 0 },
    ],
    enabled: true,
    icon: 'lead-pencil',
    color: '#7c4dff',
  },
  {
    name: 'Pinceau large',
    description: 'Configure le pinceau en taille 40px, opacité 70%',
    trigger: 'manual',
    actions: [
      { type: 'set_tool', tool: 'brush', delay: 0 },
      { type: 'set_size', size: 40, delay: 0 },
    ],
    enabled: true,
    icon: 'brush',
    color: '#ff8800',
  },
];
