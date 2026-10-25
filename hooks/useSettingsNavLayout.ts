import { settingsNavLayoutFor } from '@/services/layoutRules';

/** 'top' (onglets horizontaux) sur écran étroit, 'side' (barre latérale) sinon. */
export function useSettingsNavLayout(windowWidth: number): 'top' | 'side' {
  return settingsNavLayoutFor(windowWidth);
}
