// Décisions pures des gestes d'une carte de la galerie (toile / dossier),
// sans dépendance React : testables à part (services/__tests__/cardGesture.test.ts).
//
// Tactile :
//  - tap immobile puis relâchement → ouvre la carte ;
//  - appui long (CARD_DRAG_HOLD_MS) immobile → la carte « décolle » (glisser) ;
//  - mouvement > CARD_MOVE_SLOP_PX AVANT l'appui long → c'est un défilement :
//    ni tap ni glisser, et le ScrollView natif doit pouvoir prendre la main.
// Souris : le glisser démarre dès que le pointeur bouge (bureau).

/** Durée d'appui immobile avant que la carte ne décolle (tactile). */
export const CARD_DRAG_HOLD_MS = 450;
/** Mouvement (px) au-delà duquel le doigt ne « tape » plus. */
export const CARD_MOVE_SLOP_PX = 8;

/** Vrai si l'événement natif vient d'une souris (web / bureau). */
export function isMouseEvent(nativeEvent: unknown): boolean {
  const type = (nativeEvent as { type?: unknown } | null | undefined)?.type;
  return typeof type === 'string' && type.startsWith('mouse');
}

/**
 * Faut-il bloquer le geste natif du parent (ScrollView Android) au moment où
 * la carte prend le responder ? Par défaut PanResponder renvoie `true`, ce
 * qui fait appeler `requestDisallowInterceptTouchEvent` sur Android : le
 * ScrollView ne peut alors plus jamais intercepter le doigt et ne défile pas
 * (l'« angle mort » sur les cartes). Au doigt, on ne bloque donc PAS : le
 * ScrollView reste libre de défiler, et c'est lui qui interrompt la carte.
 * Pendant un glisser, le défilement est coupé via `scrollEnabledWhileDragging`.
 */
export function shouldBlockNativeResponder(isMouse: boolean): boolean {
  return isMouse;
}

export interface CardGestureState {
  isMouse: boolean;
  dragging: boolean;
  /** Le doigt a bougé trop tôt : ce geste est un défilement. */
  cancelled: boolean;
}

export type MoveDecision = 'none' | 'startDrag' | 'scroll';

/** Que faire d'un mouvement (dx, dy depuis le doigt posé) ? */
export function decideMove(s: CardGestureState, dx: number, dy: number): MoveDecision {
  if (s.dragging || s.cancelled) return 'none';
  if (Math.hypot(dx, dy) <= CARD_MOVE_SLOP_PX) return 'none';
  return s.isMouse ? 'startDrag' : 'scroll';
}

/** L'appui long arrive à échéance : la carte décolle-t-elle ? */
export function shouldStartDragOnHold(s: CardGestureState): boolean {
  return !s.isMouse && !s.dragging && !s.cancelled;
}

export type ReleaseDecision = 'tap' | 'drop' | 'none';

/** Relâchement : ouvrir (tap), déposer (fin du glisser) ou rien (défilement). */
export function decideRelease(s: CardGestureState): ReleaseDecision {
  if (s.dragging) return 'drop';
  if (s.cancelled) return 'none';
  return 'tap';
}

/** La carte cède-t-elle le geste quand un parent le demande ? */
export function allowTermination(s: CardGestureState): boolean {
  return !s.dragging;
}

/** Le ScrollView de la galerie peut-il défiler ? Non pendant un glisser. */
export function scrollEnabledWhileDragging(dragActive: boolean): boolean {
  return !dragActive;
}
