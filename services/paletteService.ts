// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CustomPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface PaletteData {
  recentColors: string[];
  customPalettes: CustomPalette[];
}

const KEY = 'app:palettes';

const DEFAULT_DATA: PaletteData = {
  recentColors: [],
  customPalettes: [],
};

// Custom palettes and recent colors used to live only in component state,
// so they vanished on every app restart or screen remount. Persisting them
// keeps a user's color work available the way canvases and layers already are.
export async function loadPaletteData(): Promise<PaletteData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_DATA;
    return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DATA;
  }
}

export async function savePaletteData(data: PaletteData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Best-effort: a failed write shouldn't block color picking.
  }
}
