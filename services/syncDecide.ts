// Décisions pures du moteur de synchro (testables sans React Native).
//
// Inspiré de 123Ecriture (fix/sync-hot-base) : on compare la version locale,
// la version distante et la « base » = l'horodatage de la dernière synchro
// réussie de cette toile sur CET appareil (SYNCED_KEY).
//   - seul un côté a bougé depuis la base → ce côté gagne, sans conflit ;
//   - les deux ont bougé → conflit : la plus récente gagne, la perdante est
//     sauvegardée en copie (jamais perdue).

export type CanvasDecision =
  | 'pull'            // prendre la version distante
  | 'skip'            // rien à tirer (le push s'occupe d'un éventuel envoi)
  | 'conflict-remote' // conflit, la distante gagne (sauver la locale en copie)
  | 'conflict-local'; // conflit, la locale gagne (sauver la distante en copie)

export function decideCanvas(
  localUpdatedAt: number | undefined,
  remoteUpdatedAt: number,
  baseAt: number | undefined,
): CanvasDecision {
  if (localUpdatedAt === undefined) return 'pull';
  if (localUpdatedAt === remoteUpdatedAt) return 'skip';
  const base = baseAt ?? -Infinity; // jamais synchronisée ici (1re connexion)
  const remoteChanged = remoteUpdatedAt > base;
  const localChanged = localUpdatedAt > base;
  if (!remoteChanged) return 'skip';
  if (!localChanged) return 'pull';
  return remoteUpdatedAt > localUpdatedAt ? 'conflict-remote' : 'conflict-local';
}

/** Délai avant la prochaine tentative hors ligne : 30 s, 1, 2, 4, 8 min, puis 10 min. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt), 10 * 60_000);
}

/** Erreurs qui ne valent pas un nouvel essai automatique (config / compte). */
export function isPermanentSyncError(msg: string | undefined): boolean {
  if (!msg) return false;
  return /non configuré|Connecte-toi|permission denied|JWT|42501|42P01/i.test(msg);
}

/** Libellé de la copie de la version perdante d'un conflit. */
export function conflictCopyName(name: string, side: 'locale' | 'distante', at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${name} (conflit ${side} ${p(at.getDate())}/${p(at.getMonth() + 1)} ${p(at.getHours())}:${p(at.getMinutes())})`;
}

/** Horodatage → ms (accepte bigint ms, chaîne numérique ou timestamptz ISO). */
export function toMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) return Number(v);
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/**
 * Dossier effectif d'une toile pour l'affichage : si son dossier n'existe pas
 * (encore) localement — p. ex. toile reçue avant son dossier — elle s'affiche
 * à la racine au lieu d'être invisible. Elle retrouve son dossier dès qu'il arrive
 * (le folderId stocké n'est pas modifié).
 */
export function effectiveFolderId(folderId: string | null | undefined, existing: ReadonlySet<string>): string | null {
  return folderId && existing.has(folderId) ? folderId : null;
}
