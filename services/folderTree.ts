// Logique pure (sans React / stockage) du glisser-déposer des dossiers :
// imbrication sans cycle, zones de dépôt, réordonnancement, chemin.

export interface FolderNode {
  id: string;
  parentId: string | null;
}

/** Ancêtres de `id` (du plus proche au plus lointain), protégé contre les cycles. */
export function ancestorIds(folders: readonly FolderNode[], id: string): string[] {
  const byId = new Map(folders.map(f => [f.id, f]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = byId.get(id)?.parentId ?? null;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = byId.get(cur)!.parentId ?? null;
  }
  return out;
}

/** Chemin racine → `id` inclus (pour le fil d'Ariane). */
export function folderPath(folders: readonly FolderNode[], id: string): string[] {
  if (!folders.some(f => f.id === id)) return [];
  return [...ancestorIds(folders, id).reverse(), id];
}

/**
 * Peut-on ranger `dragId` dans `targetId` (null = racine) ?
 * Interdit : soi-même, un de ses descendants (cycle), cible inconnue,
 * ou dépôt sans effet (déjà dans ce parent).
 */
export function canNestFolder(folders: readonly FolderNode[], dragId: string, targetId: string | null): boolean {
  const drag = folders.find(f => f.id === dragId);
  if (!drag) return false;
  if (targetId === null) return drag.parentId != null;
  if (targetId === dragId) return false;
  if (!folders.some(f => f.id === targetId)) return false;
  if ((drag.parentId ?? null) === targetId) return false;
  return !ancestorIds(folders, targetId).includes(dragId);
}

export type FolderDropZone = 'before' | 'into' | 'after';

/**
 * Zone visée sur une carte dossier (rangée horizontale) : les bords
 * (EDGE de la largeur de chaque côté) = réordonner, le centre = ranger dedans.
 */
export function folderDropZone(x: number, left: number, width: number, edge = 0.25): FolderDropZone {
  if (width <= 0) return 'into';
  const t = (x - left) / width;
  if (t < edge) return 'before';
  if (t > 1 - edge) return 'after';
  return 'into';
}

/** Déplace `id` pour qu'il se place avant (`before`) ou après la cible. */
export function reorderAround(ids: readonly string[], id: string, targetId: string, side: 'before' | 'after'): string[] {
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter(x => x !== id);
  const t = rest.indexOf(targetId);
  rest.splice(side === 'before' ? t : t + 1, 0, id);
  return rest;
}

/** Sync « le plus récent gagne » : appliquer la version distante ? */
export function remoteFolderWins(localUpdatedAt: number | undefined, remoteMs: number): boolean {
  return remoteMs > (localUpdatedAt ?? 0);
}
