// Logique PURE des entrées de la toile (testée sans React Native).
//
// 1) Repère écran ↔ zone. React Native (et le web) appliquent
//    `transform: [translateX, translateY, scale]` autour du CENTRE de la vue
//    (transformOrigin par défaut 50 % 50 %) :
//        écran = c + T + S × (p − c)     avec c = (w/2, h/2)
//    Inverser comme si l'origine était le coin haut-gauche (écran = T + S×p)
//    décale le tracé de (1 − S)×c : nul à 100 %, croissant avec le zoom.
//
// 2) Filtre « début de trait » : un pinch/pan à deux doigts commence presque
//    toujours par UN doigt posé quelques ms avant l'autre. On retient le trait
//    un court instant ; si un deuxième doigt arrive, il est jeté sans trace.

/** Translation équivalente si l'origine du scale était le coin haut-gauche. */
export function pivotTranslate(t: number, scale: number, size: number): number {
  return t + (size / 2) * (1 - scale);
}

/** Point écran (relatif à la zone, rotation déjà retirée) → repère zone non zoomé. */
export function screenToZone(
  x: number, y: number, tx: number, ty: number, scale: number, w: number, h: number,
): { x: number; y: number } {
  return {
    x: (x - pivotTranslate(tx, scale, w)) / scale,
    y: (y - pivotTranslate(ty, scale, h)) / scale,
  };
}

/** Inverse de screenToZone. */
export function zoneToScreen(
  x: number, y: number, tx: number, ty: number, scale: number, w: number, h: number,
): { x: number; y: number } {
  return {
    x: pivotTranslate(tx, scale, w) + scale * x,
    y: pivotTranslate(ty, scale, h) + scale * y,
  };
}

/** Nouvelle translation pour zoomer en gardant le point (ax, ay) fixe à l'écran. */
export function zoomAboutAnchor(
  oldScale: number, newScale: number, tx: number, ty: number,
  ax: number, ay: number, w: number, h: number,
): { tx: number; ty: number } {
  const p = screenToZone(ax, ay, tx, ty, oldScale, w, h);
  // ax = c + T' + S'(p − c)  ⇒  T' = ax − c − S'(p − c)
  return {
    tx: ax - w / 2 - newScale * (p.x - w / 2),
    ty: ay - h / 2 - newScale * (p.y - h / 2),
  };
}

/**
 * Translation qui place le point de zone (px, py) exactement sous le point
 * écran local (sx, sy) à l'échelle `scale` (pivot centré) :
 *   s = c + T + S(p − c)  ⇒  T = s − c − S(p − c).
 * Sert au pinch : zoom centré sur les doigts + panoramique en un seul calcul.
 */
export function anchorTranslate(
  px: number, py: number, sx: number, sy: number, scale: number, w: number, h: number,
): { tx: number; ty: number } {
  return {
    tx: sx - w / 2 - scale * (px - w / 2),
    ty: sy - h / 2 - scale * (py - h / 2),
  };
}

/** Délai (ms) pendant lequel un trait au doigt reste « en attente », sans aucun rendu. */
export const STROKE_START_DELAY_MS = 120;

/** Déplacement écran (px) qui confirme l'intention de tracer, même avant la fin du délai. */
export const STROKE_START_MOVE_PX = 24;

export type StrokeGate = 'wait' | 'start' | 'cancel';

/**
 * Décide du sort d'un trait en attente (aucun rendu tant que le résultat est 'wait').
 * - plus d'un doigt vu depuis le début du geste → 'cancel' (jamais de trait, rien n'a été dessiné) ;
 * - un seul doigt et (délai écoulé ou déplacement ≥ seuil) → 'start' (rejouer le buffer) ;
 * - sinon 'wait'. Sans attente (souris, web) → 'start' immédiat.
 * Un 2e doigt après 'start' n'est pas géré ici : le canevas annule alors le trait déjà confirmé.
 */
export function strokeGate(opts: {
  elapsedMs: number;
  maxTouches: number;
  defer: boolean;
  delayMs?: number;
  movedPx?: number;
  movePx?: number;
}): StrokeGate {
  if (opts.maxTouches >= 2) return 'cancel';
  if (!opts.defer) return 'start';
  const delay = opts.delayMs ?? STROKE_START_DELAY_MS;
  const threshold = opts.movePx ?? STROKE_START_MOVE_PX;
  const moved = opts.movedPx ?? 0;
  return opts.elapsedMs >= delay || moved >= threshold ? 'start' : 'wait';
}

/** Distance écran depuis le point de départ du doigt. */
export function strokePointerMovePx(
  start: { x: number; y: number },
  current: { x: number; y: number },
): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

export type StrokePhase = 'pending' | 'confirmed' | 'ending';
export type SecondPointerAction = 'discard-pending' | 'cancel-confirmed';

/**
 * Un 2e doigt arrive alors que le premier est encore enfoncé (ou considéré comme tel).
 * Aucune limite de temps : pendant l'attente on jette le buffer (rien n'a été dessiné) ;
 * une fois le trait confirmé (voire déjà commité), on l'annule et on le retire entièrement.
 */
export function secondPointerAction(phase: StrokePhase): SecondPointerAction {
  return phase === 'pending' ? 'discard-pending' : 'cancel-confirmed';
}

/**
 * Un grant à un doigt arrive alors qu'un commit est différé (release Android
 * « fantôme » possible). On ne valide le trait précédent que si rien n'indique
 * un 2e doigt encore actif.
 */
export function shouldFlushDeferredCommit(opts: {
  touchCount: number;
  activePointerCount: number;
  newPointerAlreadyTracked: boolean;
}): boolean {
  if (opts.touchCount >= 2) return false;
  if (opts.activePointerCount >= 2) return false;
  if (opts.activePointerCount >= 1 && !opts.newPointerAlreadyTracked) return false;
  return true;
}

/** À la fin du geste : committer le trait ? Jamais si un 2e doigt est apparu. */
export function shouldCommitStroke(maxTouches: number): boolean {
  return maxTouches < 2;
}

/**
 * Faut-il retenir le premier point avant de commencer le trait ?
 * Sur native, toujours (un pinch commence par un doigt). Sur le web / Electron,
 * seulement si l'événement ressemble à un toucher (pas une souris) : sinon un
 * clic dessinerait avec 120 ms de retard.
 */
export function shouldDeferStroke(opts: {
  platformOS: string;
  touchCount: number;
  pointerType?: string | null;
}): boolean {
  if (opts.platformOS !== 'web') return true;
  const pt = (opts.pointerType ?? '').toLowerCase();
  if (pt === 'touch' || pt === 'pen') return true;
  return opts.touchCount > 0;
}

/** Curseur horizontal : position (px) → valeur 0..1 bornée. */
export function sliderValue(x: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.max(0, Math.min(1, x / width));
}
