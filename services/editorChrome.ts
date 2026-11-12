// Barres de l'éditeur posées AU-DESSUS de la toile (barre d'outils, panneau
// droit) : largeurs du panneau compact, fond semi-transparent et décalages
// des boutons flottants. Logique pure, testée dans services/__tests__.

/** Largeur fixe de la barre d'outils. */
export const TOOLBAR_WIDTH = 56;
/** Poignée de redimensionnement posée sur le bord gauche du panneau droit. */
export const RESIZE_HANDLE_WIDTH = 14;

/** Panneau droit compact : largeur par défaut et plage de la poignée. */
export const PANEL_WIDTH_DEFAULT = 172;
export const PANEL_WIDTH_MIN = 150;
export const PANEL_WIDTH_MAX = 248;

/** Opacité du FOND des barres (jamais des icônes ni du texte). */
export const EDITOR_CHROME_ALPHA = 0.72;
/** Menus / popups ouverts depuis les barres : un peu plus opaques à lire. */
export const EDITOR_MENU_ALPHA = 0.94;

/**
 * Largeur du panneau ramenée dans la plage compacte. Une largeur sauvée
 * avant (jusqu'à 420) est ramenée au nouveau maximum ; une valeur absente
 * ou invalide donne la largeur par défaut.
 */
export function clampPanelWidth(w: unknown): number {
  if (typeof w !== 'number' || !Number.isFinite(w)) return PANEL_WIDTH_DEFAULT;
  return Math.round(Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, w)));
}

/**
 * `#rrggbb` (ou `#rgb`) → `rgba(r, g, b, alpha)`. Une couleur déjà en
 * rgb/rgba garde ses composantes avec la nouvelle alpha ; tout le reste est
 * rendu tel quel (on ne casse pas un thème exotique).
 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  return color;
}

/** Fond semi-transparent des barres de l'éditeur, dérivé du panelBg du thème. */
export function editorChromeBg(panelBg: string): string {
  return withAlpha(panelBg, EDITOR_CHROME_ALPHA);
}

/** Fond des menus / popups ouverts depuis les barres. */
export function editorMenuBg(panelBg: string): string {
  return withAlpha(panelBg, EDITOR_MENU_ALPHA);
}

export interface ChromeLayoutInput {
  toolbarPosition: 'left' | 'right' | undefined;
  /** Plein écran de dessin : barre d'outils masquée. */
  fullDraw: boolean;
  panelVisible: boolean;
  panelWidth: number;
}

export interface ChromeInsets {
  /** Largeur couverte à gauche de la toile (barre d'outils à gauche). */
  left: number;
  /** Largeur couverte à droite (panneau + poignée, + barre d'outils à droite). */
  right: number;
  /** Décalage droit du panneau : la barre d'outils à droite reste au bord. */
  panelRight: number;
}

/**
 * Ce que les barres posées au-dessus de la toile en recouvrent, de chaque
 * côté — sert à garder les boutons flottants (zoom, plein écran, repli) et
 * le panneau du bas hors des barres.
 */
export function chromeInsets({ toolbarPosition, fullDraw, panelVisible, panelWidth }: ChromeLayoutInput): ChromeInsets {
  const toolbarRight = toolbarPosition === 'right';
  const toolbar = fullDraw ? 0 : TOOLBAR_WIDTH;
  const panel = panelVisible ? panelWidth + RESIZE_HANDLE_WIDTH : 0;
  const panelRight = toolbarRight ? toolbar : 0;
  return {
    left: toolbarRight ? 0 : toolbar,
    right: panelRight + panel,
    panelRight,
  };
}
