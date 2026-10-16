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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCanvasMetas, getFolders, loadCanvas, saveCanvas, saveFolder,
  deleteCanvas as storageDeleteCanvas, deleteFolder as storageDeleteFolder,
  CanvasMeta, Folder, CanvasData,
} from '@/services/vaultService';
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
    client = createClient(config.url, config.anonKey, {
      auth: { flowType: 'pkce', persistSession: true },
    });
    clientKey = key;
  }
  return client;
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
  return {
    id: meta.id,
    name: meta.name,
    folder_id: meta.folderId,
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
    width: meta.width,
    height: meta.height,
    thumbnail_color: meta.thumbnailColor,
    stroke_count: meta.strokeCount,
    thumbnail: meta.thumbnail ?? null,
    thumb_at: meta.thumbAt ?? null,
    order_index: meta.order ?? null,
    data,
  };
}

function canvasFromRow(row: any): CanvasData | null {
  if (!row?.data?.meta || !Array.isArray(row.data.layers)) return null;
  return {
    meta: {
      ...row.data.meta,
      id: row.id,
      name: row.name,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      width: row.width,
      height: row.height,
      thumbnailColor: row.thumbnail_color,
      strokeCount: row.stroke_count,
      thumbnail: row.thumbnail ?? undefined,
      thumbAt: row.thumb_at ?? undefined,
      order: row.order_index ?? undefined,
    },
    layers: row.data.layers,
    activeLayerId: row.data.activeLayerId,
    groups: row.data.groups ?? [],
  };
}

/** Synchronisation bidirectionnelle complète — compte Google requis. */
export async function syncNow(): Promise<SyncResult> {
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

  try {
    const [metas, folders, synced, tombstones] = await Promise.all([
      getCanvasMetas(), getFolders(), getSyncedMap(), getTombstones(),
    ]);
    const canvasTombstones = tombstones.filter(t => t.kind === 'canvas');
    const folderTombstones = tombstones.filter(t => t.kind === 'folder');

    // ── PULL ──────────────────────────────────────────────────────────
    const { data: remoteCanvases, error: pullErr } = await supabase.schema(SCHEMA)
      .from('canvases').select('*').eq('owner_id', ownerId);
    if (pullErr) return { ok: false, pushed, pulled, deleted, error: pullErr.message };

    const { data: remoteFolders, error: pullErrF } = await supabase.schema(SCHEMA)
      .from('folders').select('*').eq('owner_id', ownerId);
    if (pullErrF) return { ok: false, pushed, pulled, deleted, error: pullErrF.message };

    const tombstoneFor = (id: string) =>
      tombstones.find(t => t.id === id && Date.now() - t.at < 1000 * 60 * 60 * 24 * 30);

    for (const rf of remoteFolders ?? []) {
      // Dossier supprimé localement pendant le hors-ligne : ne pas ressusciter.
      if (folderTombstones.some(t => t.id === rf.id)) continue;
      // Les dossiers ne sont pas versionnés : on ne crée que l'absent.
      if (!folders.some(f => f.id === rf.id)) {
        await saveFolder({
          id: rf.id, name: rf.name, parentId: rf.parent_id, createdAt: rf.created_at,
          color: rf.color, order: rf.order_index ?? undefined,
          previewMode: rf.preview_mode ?? undefined,
        });
        pulled++;
      }
    }

    for (const rc of remoteCanvases ?? []) {
      if (canvasTombstones.some(t => t.id === rc.id && t.at >= (rc.updated_at ?? 0))) continue;
      const local = metas.find(m => m.id === rc.id);
      if (!local || (rc.updated_at ?? 0) > local.updatedAt) {
        const data = canvasFromRow(rc);
        if (data) {
          await saveCanvas(data);
          pulled++;
          synced[rc.id] = rc.updated_at ?? 0;
        }
      }
    }

    // ── PUSH ──────────────────────────────────────────────────────────
    const toPush = metas.filter(m => (synced[m.id] ?? 0) < m.updatedAt);
    for (const meta of toPush) {
      const data = await loadCanvas(meta.id);
      if (!data) continue;
      const row = { owner_id: ownerId, ...rowFromCanvas({ ...data, groups: data.groups ?? [] }, meta) };
      const { error } = await supabase.schema(SCHEMA).from('canvases').upsert(row);
      if (!error) {
        pushed++;
        synced[meta.id] = meta.updatedAt;
      }
    }

    const folderRows = folders.map(f => ({
      id: f.id, owner_id: ownerId, name: f.name, parent_id: f.parentId,
      created_at: f.createdAt, color: f.color, order_index: f.order ?? null,
      preview_mode: f.previewMode ?? null, updated_at: Date.now(),
    }));
    if (folderRows.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('folders').upsert(folderRows);
      if (!error) pushed += folderRows.length;
    }

    // ── SUPPRESSIONS (pierres tombales) ───────────────────────────────
    const canvasDelIds = canvasTombstones.map(t => t.id);
    if (canvasDelIds.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('canvases').delete()
        .in('id', canvasDelIds).eq('owner_id', ownerId);
      if (!error) deleted += canvasDelIds.length;
    }
    const folderDelIds = folderTombstones.map(t => t.id);
    if (folderDelIds.length > 0) {
      const { error } = await supabase.schema(SCHEMA).from('folders').delete()
        .in('id', folderDelIds).eq('owner_id', ownerId);
      if (!error) deleted += folderDelIds.length;
    }

    await AsyncStorage.setItem(SYNCED_KEY, JSON.stringify(synced));
    // Pierres tombales propagées : vidées (une re-synchro ne les rejouera pas).
    await AsyncStorage.setItem(TOMBSTONES_KEY, '[]');
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return { ok: true, pushed, pulled, deleted };
  } catch (error) {
    return { ok: false, pushed, pulled, deleted, error: String((error as Error)?.message ?? error) };
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
