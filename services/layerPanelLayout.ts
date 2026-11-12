/**
 * Panneau flottant des calques : logique pure (aucune dépendance React / RN).
 *  - fitContain : taille d'une vignette qui montre la toile ENTIÈRE dans une
 *    case carrée (équivalent « meet »), sans déformation.
 *  - floatingPanelSize : largeur / hauteur max de la carte flottante selon la
 *    zone de dessin disponible (téléphone ~360–411 dp → carte ~280–320).
 */

export interface Size { width: number; height: number }

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Plus grand rectangle au ratio contentW:contentH qui tient dans boxW×boxH.
    Dimensions arrondies, au moins 1 px. Contenu inconnu / nul → la case
    entière (carré). */
export function fitContain(contentW: number, contentH: number, boxW: number, boxH: number = boxW): Size {
  const bw = Math.max(1, Math.round(safe(boxW)));
  const bh = Math.max(1, Math.round(safe(boxH)));
  const cw = safe(contentW);
  const ch = safe(contentH);
  if (!cw || !ch) return { width: bw, height: bh };
  const scale = Math.min(bw / cw, bh / ch);
  return {
    width: Math.min(bw, Math.max(1, Math.round(cw * scale))),
    height: Math.min(bh, Math.max(1, Math.round(ch * scale))),
  };
}

/** Largeur cible de la carte : 320 max, 16 px de marge de chaque côté, et
    jamais plus de 92 % de la zone (la toile reste visible autour).
    Hauteur max : 62 % de la zone, au moins 220 px si la zone le permet. */
export function floatingPanelSize(areaW: number, areaH: number): { width: number; maxHeight: number } {
  const w = safe(areaW);
  const h = safe(areaH);
  const width = Math.max(1, Math.round(Math.min(320, w - 32, w * 0.92)));
  const maxHeight = Math.max(1, Math.round(Math.min(h - 16, Math.max(220, h * 0.62))));
  return { width, maxHeight };
}
