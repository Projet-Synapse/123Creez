// Powered by OnSpace.AI — Synchronisation Supabase du vault.
//
// Bidirectionnelle, « dernière écriture gagne » (comparaison sur
// meta.updatedAt, résolution à la milliseconde). Les suppressions locales
// sont tracées en pierres tombales (AsyncStorage) et propagées au push —
// le pull ignore toute ligne visée par une pierre tombale plus récente
// qu'elle, ce qui évite la résurrection.
//
// Modèle : projet Supabase partagé « Projet Synapse » — tout vit dans le
// schéma dédié `app_123creez` (jamais `public`), voir supabase-schema.sql.
// v1 : RLS ouvert au rôle `anon` sur ces tables uniquement (vault personnel
// mono-poste) ; passer à l'auth Google comme 123Ecriture est enregistré
// dans scores-qualite.md (sécurité).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { remoteFolderWins } from './folderTree';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCanvasMetas, getFolders, loadCanvas, saveCanvas, saveFolder,
  deleteCanvas as storageDeleteCanvas, deleteFolder as storageDeleteFolder,
  CanvasMeta, Folder, CanvasData,
} from '@/services/vaultService';
import { toMs, decideCanvas, retryDelayMs, isPermanentSyncError, conflictCopyName } from '@/services/syncDecide';
import { logSync, setSyncStatus, getPause, setPause, clearPause } from '@/services/syncLog';
import { LayerGroup } from '@/contexts/CanvasContext';

const CONFIG_KEY = 'supabase:config';
const LAST_SYNC_KEY = 'supabase:lastsync';
const SYNCED_KEY = 'supabase:synced';
const TOMBSTONES_KEY = 'supabase:tombstones';
const SCHEMA = 'app_123creez';

// Préconfig : projet partagé « Projet Synapse » (le même que 123Ecriture) —
// URL + clé « publishable » (anon), SÛRES à exposer côté client par design
// (elles n'autorisent que ce que les policies RLS permettent). Restent
// surchargeables dans Réglages → Synchronisation.
export const DEFAULT_CONFIG: SupabaseConfig = {
  url: 'https://lcfbzfsfubegppsyzkeb.supabase.co',
  anonKey: 'sb_publishable_E8SZJj552cqq-F0lFudYIw_g3DIKfiN',
  autoPush: true,
};

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoPush: boolean;
}

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  deleted: number;
  error?: string;
}

let client: SupabaseClient | null = null;
let clientKey = '';

export async function getConfig(): Promise<SupabaseConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { }
  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(partial: Partial<SupabaseConfig>): Promise<SupabaseConfig> {
  const current = await getConfig();
  const next = { ...current, ...partial };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  // Le client est reconstruit à la prochaine utilisation.
  client = null;
  clientKey = '';
  return next;
}

function getClient(config: SupabaseConfig): SupabaseClient {
  lastConfig = config;
  const key = `${config.url}::${config.anonKey}`;
  if (!client || clientKey !== key) {
    // flowType 'pkce' OBLIGATOIRE : le flux implicit (défaut auth-js) renvoie
    // les tokens dans le fragment de l'URL de callback app123creez://#...,
    // que le renderer ne peut pas lire en tant que page. Même choix que
    // 123Ecriture (supabaseClient.ts). La session persiste en localStorage
    // de l'origine app://local.
    // Stockage de session EXPLICITE : sur Android/iOS il n'y a pas de
    // localStorage, auth-js gardait donc la session (et le code_verifier PKCE)
    // en mémoire seulement → reconnexion à chaque relance de l'app.
    // Web/Electron : on garde localStorage (même clé par défaut
    // sb-<ref>-auth-token) pour ne pas perdre la session desktop existante.
    const isWeb = Platform.OS === 'web';
    client = createClient(config.url, config.anonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: isWeb,
        ...(isWeb ? {} : { storage: AsyncStorage }),
      },
    });
    installAutoRefreshOnForeground(client);
    clientKey = key;
  }
  return client;
}

// Recommandation Supabase pour React Native : ne rafraîchir le jeton que
// lorsque l'app est au premier plan (les timers sont gelés en arrière-plan).
let appStateSub: { remove: () => void } | null = null;
function installAutoRefreshOnForeground(c: SupabaseClient) {
  if (Platform.OS === 'web') return;
  appStateSub?.remove();
  if (AppState.currentState === 'active') c.auth.startAutoRefresh();
  appStateSub = AppState.addEventListener('change', (st) => {
    if (st === 'active') c.auth.startAutoRefresh();
    else c.auth.stopAutoRefresh();
  });
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getConfig();
  return !!cfg.url && !!cfg.anonKey;
}

/** Client Supabase partagé (auth + sync) — créé avec la config courante. */
export function getSupabaseClient(): SupabaseClient {
  // getClient() lit la config en cache ; au premier appel elle vient des
  // défauts préconfigurés — un appel sync est donc sûr ici.
  const cfg = lastConfig ?? DEFAULT_CONFIG;
  return getClient(cfg);
}

// Cache de la dernière config vue par getClient (évite un await dans
// getSupabaseClient).
let lastConfig: SupabaseConfig | null = null;

export async function getLastSync(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

/** Décode l'URL de callback OAuth du protocole app123creez:// — supabase-js
    >= 2.1xx exige LE CODE et un flowId distincts (passer l'URL entière à
    exchangeCodeForSession provoque « invalid flow state »). */
export function parseAuthCallbackUrl(url: string): {
  code: string | null;
  error: string | null;
} {
  // Schéma custom : new URL() s'y casse les dents selon les moteurs — on
  // découpe la query à la main (motif 123Ecriture).
  const queryIndex = url.indexOf('?');
  const query = queryIndex === -1 ? '' : url.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  return {
    code: params.get('code'),
    error: params.get('error_description') || params.get('error'),
  };
}

/** Vérifie que l'URL + la clé permettent de lire la table canvases. */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getConfig();
    if (!cfg.url || !cfg.anonKey) return { ok: false, error: 'URL ou clé manquante' };
    const supabase = getClient(cfg);
    const { error } = await supabase.schema(SCHEMA).from('canvases').select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

async function getSyncedMap(): Promise<Record<string, number>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SYNCED_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

async function getTombstones(): Promise<{ kind: 'canvas' | 'folder'; id: string; at: number }[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(TOMBSTONES_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function recordTombstone(kind: 'canvas' | 'folder', id: string): Promise<void> {
  const list = await getTombstones();
  list.push({ kind, id, at: Date.now() });
  // Plafond : 500 entrées, les plus anciennes sautent (le push les vide).
  await AsyncStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list.slice(-500)));
  await AsyncStorage.removeItem(SYNCED_KEY + ':' + id);
}

function rowFromCanvas(data: CanvasData, meta: CanvasMeta) {
  // Types alignés sur le schéma réel app_123creez.canvases : created_at,
  // updated_at, thumb_at = bigint (ms entiers) ; synced_at = timestamptz.
  const int = (n: number | undefined | null) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
  return {
    id: meta.id,
    name: meta.name,
    folder_id: meta.folderId ?? null,
    created_at: int(meta.createdAt),
    updated_at: int(meta.updatedAt),
    width: int(meta.width),
    height: int(meta.height),
    thumbnail_color: meta.thumbnailColor,
    stroke_count: int(meta.strokeCount),
    thumbnail: meta.thumbnail ?? null,
    thumb_at: int(meta.thumbAt),
    order_index: int(meta.order),
    synced_at: new Date().toISOString(),
    data,
  };
}

function canvasFromRow(row: any): CanvasData | null {
  if (!row?.data?.meta || !Array.isArray(row.data.layers)) return null;
  return {
    // Champs inconnus de la toile (version plus récente) conservés.
    ...row.data,
    meta: {
      ...row.data.meta,
      id: row.id,
      name: row.name,
      folderId: row.folder_id,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at),
      width: row.width,
      height: row.height,
      thumbnailColor: row.thumbnail_color,
      strokeCount: row.stroke_count,
      thumbnail: row.thumbnail ?? undefined,
      thumbAt: row.thumb_at != null ? toMs(row.thumb_at) : undefined,
      order: row.order_index ?? undefined,
    },
    layers: row.data.layers,
    activeLayerId: row.data.activeLayerId,
    groups: row.data.groups ?? [],
  };
}


const newCopyId = () => `canvas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Sauvegarde locale de la version perdante d'un conflit (nouvelle toile, envoyée au prochain push). */
async function saveConflictCopy(data: CanvasData, side: 'locale' | 'distante'): Promise<string> {
  const now = Date.now();
  const name = conflictCopyName(data.meta.name, side, new Date(now));
  await saveCanvas({ ...data, meta: { ...data.meta, id: newCopyId(), name, updatedAt: now } });
  return name;
}

/** Nombre de changements locaux pas encore envoyés (toiles + suppressions). */
export async function countPending(): Promise<number> {
  const [metas, synced, tombs] = await Promise.all([getCanvasMetas(), getSyncedMap(), getTombstones()]);
  return metas.filter(m => (synced[m.id] ?? 0) < m.updatedAt).length + tombs.length;
}
async function refreshPending() {
  try { setSyncStatus({ pending: await countPending() }); } catch { /* ignore */ }
}

let inflight: Promise<SyncResult> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function scheduleRetry(err: string) {
  if (retryTimer) clearTimeout(retryTimer);
  const delay = retryDelayMs(retryAttempt++);
  const at = Date.now() + delay;
  setSyncStatus({ phase: 'retry', detail: err, nextRetryAt: at });
  logSync('info', `Nouvel essai dans ${Math.round(delay / 1000)} s`);
  retryTimer = setTimeout(() => { retryTimer = null; syncNow().catch(() => {}); }, delay);
}

/** Met la synchro en pause (rien n'est envoyé ni reçu jusqu'à « Reprendre »). */
export async function pauseSync(reason = 'Mise en pause manuelle'): Promise<void> {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  await setPause(reason);
}
/** Lève la pause puis lance aussitôt une synchro. */
export async function resumeSync(): Promise<SyncResult> {
  await clearPause();
  retryAttempt = 0;
  return syncNow();
}

/**
 * Synchronisation bidirectionnelle complète — compte Google requis.
 * Un seul cycle à la fois (les appels concurrents partagent le même) ;
 * ne fait rien si la synchro est en pause ; en cas d'erreur réseau, une
 * nouvelle tentative est programmée (30 s → 10 min), les changements locaux
 * restent en file (SYNCED_KEY / pierres tombales) jusqu'à l'envoi.
 */
export function syncNow(): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const pause = await getPause();
    if (pause) {
      setSyncStatus({ phase: 'paused', pausedAt: pause.at, pauseReason: pause.reason });
      await refreshPending();
      return { ok: false, pushed: 0, pulled: 0, deleted: 0, error: 'Synchronisation en pause' };
    }
    setSyncStatus({ phase: 'syncing', detail: undefined, nextRetryAt: undefined });
    const r = await runSync();
    if (r.ok) {
      retryAttempt = 0;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      setSyncStatus({ phase: 'idle', detail: undefined });
    } else if (isPermanentSyncError(r.error)) {
      setSyncStatus({ phase: 'error', detail: r.error });
    } else {
      scheduleRetry(r.error ?? 'erreur inconnue');
    }
    await refreshPending();
    return r;
  })().finally(() => { inflight = null; });
  return inflight;
}

async function runSync(): Promise<SyncResult> {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.anonKey) {
    return { ok: false, pushed: 0, pulled: 0, deleted: 0, error: 'Supabase non configuré' };
  }
  const supabase = getClient(cfg);
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user?.id;
  if (!ownerId) {
    return { ok: false, pushed: 0, pulled: 0, deleted: 0, error: 'Connecte-toi avec Google pour synchroniser' };
  }
  let pushed = 0;
  let pulled = 0;
  let deleted = 0;
  const fail = (msg: string): SyncResult => {
    logSync('erreur', msg);
    return { ok: false, pushed, pulled, deleted, error: msg };
  };

  try {
    const [metas, folders, synced, tombstones] = await Promise.all([
      getCanvasMetas(), getFolders(), getSyncedMap(), getTombstones(),
    ]);
    const canvasTombstones = tombstones.filter(t => t.kind === 'canvas');
    const folderTombstones = tombstones.filter(t => t.kind === 'folder');

    // ── PULL ──────────────────────────────────────────────────────────
    const { data: remoteCanvases, error: pullErr } = await supabase.schema(SCHEMA)
      .from('canvases').select('*').eq('owner_id', ownerId);
    if (pullErr) return fail(`Réception des toiles : ${pullErr.message}`);

    const { data: remoteFolders, error: pullErrF } = await supabase.schema(SCHEMA)
      .from('folders').select('*').eq('owner_id', ownerId);
    if (pullErrF) return fail(`Réception des dossiers : ${pullErrF.message}`);

    for (const rf of remoteFolders ?? []) {
      // Dossier supprimé localement pendant le hors-ligne : ne pas ressusciter.
      if (folderTombstones.some(t => t.id === rf.id)) continue;
      // « Le plus récent gagne » : absent localement, ou modifié ailleurs
      // (nom, ordre, parent, aperçu) plus récemment que la copie locale.
      const local = folders.find(f => f.id === rf.id);
      const remoteMs = toMs(rf.updated_at);
      if (!local || remoteFolderWins(local.updatedAt ?? local.createdAt, remoteMs)) {
        const merged: Folder = {
          id: rf.id, name: rf.name, parentId: rf.parent_id ?? null, createdAt: toMs(rf.created_at) || remoteMs || Date.now(),
          color: rf.color, order: rf.order_index ?? undefined,
          previewMode: rf.preview_mode ?? undefined,
          updatedAt: remoteMs || undefined,
        };
        await saveFolder(merged);
        if (local) Object.assign(local, merged);
        pulled++;
        logSync('reception', local ? `Dossier « ${rf.name} » mis à jour` : `Dossier « ${rf.name} »`);
      }
    }

    for (const rc of remoteCanvases ?? []) {
      if (canvasTombstones.some(t => t.id === rc.id && t.at >= toMs(rc.updated_at))) continue;
      const local = metas.find(m => m.id === rc.id);
      const remoteAt = toMs(rc.updated_at);
      const decision = decideCanvas(local?.updatedAt, remoteAt, synced[rc.id]);
      if (decision === 'skip') continue;
      const remoteData = canvasFromRow(rc);
      if (!remoteData) {
        logSync('erreur', `Toile distante illisible ignorée (${rc.id})`);
        continue;
      }
      if (decision === 'pull') {
        await saveCanvas(remoteData);
        pulled++;
        synced[rc.id] = remoteAt;
        logSync('reception', `Toile « ${remoteData.meta.name} »`);
      } else if (decision === 'conflict-remote') {
        // La distante est plus récente : la locale est d'abord sauvegardée en copie.
        const localData = await loadCanvas(rc.id);
        const copy = localData ? await saveConflictCopy(localData, 'locale') : null;
        await saveCanvas(remoteData);
        pulled++;
        synced[rc.id] = remoteAt;
        logSync('conflit', `« ${remoteData.meta.name} » modifiée des deux côtés — gagnante : version distante (plus récente)` + (copy ? ` ; version locale sauvegardée sous « ${copy} »` : ''));
      } else {
        // La locale est plus récente : la distante est conservée en copie locale,
        // puis la locale est envoyée (base = distante pour forcer le push).
        const copy = await saveConflictCopy(remoteData, 'distante');
        pulled++; // une copie est arrivée localement → la liste doit se recharger
        synced[rc.id] = Math.min(remoteAt, (local?.updatedAt ?? 1) - 1);
        logSync('conflit', `« ${local?.name ?? rc.name} » modifiée des deux côtés — gagnante : version locale (plus récente) ; version distante sauvegardée sous « ${copy} »`);
      }
    }

    // ── PUSH ──────────────────────────────────────────────────────────
    // Relire les métas : des copies de conflit ont pu être créées ci-dessus.
    const metasNow = await getCanvasMetas();
    const toPush = metasNow.filter(m => (synced[m.id] ?? 0) < m.updatedAt);
    let pushErrors = 0;
    for (const meta of toPush) {
      const data = await loadCanvas(meta.id);
      if (!data) continue;
      const row = { owner_id: ownerId, ...rowFromCanvas({ ...data, groups: data.groups ?? [] }, meta) };
      const { error } = await supabase.schema(SCHEMA).from('canvases').upsert(row);
      if (!error) {
        pushed++;
        synced[meta.id] = meta.updatedAt;
        logSync('envoi', `Toile « ${meta.name} »`);
      } else {
        pushErrors++;
        logSync('erreur', `Envoi de « ${meta.name} » : ${error.message}`);
      }
    }

    const folderRows = folders.map(f => ({
      id: f.id, owner_id: ownerId, name: f.name, parent_id: f.parentId ?? null,
      created_at: Math.round(f.createdAt), color: f.color, order_index: f.order == null ? null : Math.round(f.order),
      // folders.updated_at est un timestamptz (≠ canvases.updated_at bigint ms) :
      // un nombre ici faisait échouer TOUT l'upsert des dossiers, erreur ignorée.
      // Horodatage RÉEL de la dernière modif (et non « maintenant ») : sinon
      // chaque appareil écraserait le cloud avec sa copie à chaque synchro.
      preview_mode: f.previewMode ?? null, updated_at: new Date(Math.round(f.updatedAt ?? f.createdAt)).toISOString(),
    }));
    if (folderRows.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('folders').upsert(folderRows);
      if (!error) pushed += folderRows.length;
      else { pushErrors++; logSync('erreur', `Envoi des dossiers : ${error.message}`); }
    }

    // ── SUPPRESSIONS (pierres tombales) ───────────────────────────────
    // Seules les suppressions réussies sont retirées de la file.
    const remaining: typeof tombstones = [];
    const canvasDelIds = canvasTombstones.map(t => t.id);
    if (canvasDelIds.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('canvases').delete()
        .in('id', canvasDelIds).eq('owner_id', ownerId);
      if (!error) { deleted += canvasDelIds.length; logSync('suppression', `${canvasDelIds.length} toile(s) supprimée(s) du cloud`); }
      else { remaining.push(...canvasTombstones); logSync('erreur', `Suppression de toiles : ${error.message}`); }
    }
    const folderDelIds = folderTombstones.map(t => t.id);
    if (folderDelIds.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('folders').delete()
        .in('id', folderDelIds).eq('owner_id', ownerId);
      if (!error) { deleted += folderDelIds.length; logSync('suppression', `${folderDelIds.length} dossier(s) supprimé(s) du cloud`); }
      else { remaining.push(...folderTombstones); logSync('erreur', `Suppression de dossiers : ${error.message}`); }
    }

    await AsyncStorage.setItem(SYNCED_KEY, JSON.stringify(synced));
    // Ne garder que les pierres tombales non propagées (+ celles ajoutées pendant le cycle).
    const after = await getTombstones();
    const done = new Set(tombstones.map(t => `${t.kind}:${t.id}:${t.at}`));
    const keep = [...remaining, ...after.filter(t => !done.has(`${t.kind}:${t.id}:${t.at}`))];
    await AsyncStorage.setItem(TOMBSTONES_KEY, JSON.stringify(keep));
    if (pushErrors > 0 || remaining.length > 0) {
      return { ok: false, pushed, pulled, deleted, error: `${pushErrors + (remaining.length ? 1 : 0)} envoi(s) en échec` };
    }
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return { ok: true, pushed, pulled, deleted };
  } catch (error) {
    return fail(String((error as Error)?.message ?? error));
  }
}

/** Push silencieux (auto à la sauvegarde) — ne jette jamais. */
export async function autoPush(): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg.url || !cfg.anonKey || !cfg.autoPush) return;
    await syncNow();
  } catch { }
}
