// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';

// Recent colors and custom palettes used to live only in component state,
// so they were silently lost when leaving the editor — users had to rebuild
// their palettes every session. They now persist in AsyncStorage.

export interface CustomPalette {
  id: string;
  name: string;
  colors: string[];
}

const RECENT_KEY = 'palette:recent';
const CUSTOM_KEY = 'palette:custom';

export async function getRecentColors(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveRecentColors(colors: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(colors));
  } catch {}
}

export async function getCustomPalettes(): Promise<CustomPalette[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveCustomPalettes(palettes: CustomPalette[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(palettes));
  } catch {}
}
