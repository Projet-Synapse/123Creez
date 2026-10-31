// Compatibilité ascendante : une version plus récente de l'appli peut ajouter
// des champs au JSON de la toile (ex. `raster` des calques pixel). Cette
// version ne les connaît pas, mais elle ne doit JAMAIS les effacer en
// réenregistrant. On recopie donc, depuis la version déjà stockée, tout champ
// inconnu absent de la nouvelle donnée — sans jamais ressusciter un champ
// connu volontairement retiré (images supprimées, groupe retiré…).

export const KNOWN_CANVAS_KEYS = ['meta', 'layers', 'activeLayerId', 'groups'] as const;
export const KNOWN_LAYER_KEYS = [
  'id', 'name', 'visible', 'opacity', 'strokes', 'images', 'shapes', 'texts', 'groupId', 'kind',
] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function copyUnknown(next: Obj, prev: Obj, known: readonly string[]): Obj {
  let out: Obj | null = null;
  for (const k of Object.keys(prev)) {
    if (known.includes(k) || k in next) continue;
    out ??= { ...next };
    out[k] = prev[k];
  }
  return out ?? next;
}

/** Fusionne `next` (ce que cette version veut écrire) avec `prev` (ce qui
    est stocké) : champs inconnus de la toile, de meta et de chaque calque
    (apparié par id) conservés. Renvoie `next` tel quel si rien à garder. */
export function preserveUnknownFields<T>(next: T, prev: unknown): T {
  if (!isObj(next) || !isObj(prev)) return next;
  let out = copyUnknown(next, prev, KNOWN_CANVAS_KEYS);
  if (isObj(out.meta) && isObj(prev.meta)) {
    // meta : tout champ absent de la nouvelle meta est conservé, sauf les
    // champs optionnels connus que l'appli retire volontairement.
    const meta = copyUnknown(out.meta, prev.meta, ['thumbnail', 'thumbAt', 'order', 'folderId', 'transparentBg']);
    if (meta !== out.meta) out = { ...out, meta };
  }
  if (Array.isArray(out.layers) && Array.isArray(prev.layers)) {
    const byId = new Map<unknown, Obj>();
    for (const l of prev.layers) if (isObj(l)) byId.set(l.id, l);
    let changed = false;
    const layers = out.layers.map(l => {
      if (!isObj(l)) return l;
      const old = byId.get(l.id);
      if (!old) return l;
      const merged = copyUnknown(l, old, KNOWN_LAYER_KEYS);
      if (merged !== l) changed = true;
      return merged;
    });
    if (changed) out = { ...out, layers };
  }
  return out as T;
}
