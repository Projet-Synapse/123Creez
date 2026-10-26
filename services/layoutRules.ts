/** En dessous de cette largeur (px), la nav des paramètres passe en haut. */
export const SETTINGS_TOP_NAV_MAX_WIDTH = 700;

/** Basé sur la largeur, pas la plateforme : tablette paysage / fenêtre desktop large = barre latérale. */
export function settingsNavLayoutFor(windowWidth: number): 'top' | 'side' {
  return windowWidth > 0 && windowWidth < SETTINGS_TOP_NAV_MAX_WIDTH ? 'top' : 'side';
}
