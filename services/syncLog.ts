// Journal de synchro (Paramètres → Synchronisation) + état visible + pause.
// Stocké dans AsyncStorage, 300 entrées max (les plus anciennes sautent).
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncLogKind = 'envoi' | 'reception' | 'conflit' | 'suppression' | 'erreur' | 'pause' | 'reprise' | 'info';
export interface SyncLogEntry { at: number; kind: SyncLogKind; message: string }

export type SyncPhase = 'idle' | 'syncing' | 'retry' | 'paused' | 'error';
export interface SyncStatus {
  phase: SyncPhase;
  /** Message court (erreur, prochaine tentative…). */
  detail?: string;
  /** Toiles modifiées non encore envoyées + suppressions en attente. */
  pending: number;
  nextRetryAt?: number;
  pausedAt?: number;
  pauseReason?: string;
}

const LOG_KEY = 'supabase:synclog';
const PAUSE_KEY = 'supabase:paused';
const MAX = 300;

let cache: SyncLogEntry[] | null = null;
let status: SyncStatus = { phase: 'idle', pending: 0 };
const logListeners = new Set<(l: SyncLogEntry[]) => void>();
const statusListeners = new Set<(s: SyncStatus) => void>();

async function load(): Promise<SyncLogEntry[]> {
  if (cache) return cache;
  try { cache = JSON.parse((await AsyncStorage.getItem(LOG_KEY)) ?? '[]'); } catch { cache = []; }
  if (!Array.isArray(cache)) cache = [];
  return cache!;
}

let writeChain: Promise<void> = Promise.resolve();
export function logSync(kind: SyncLogKind, message: string): void {
  writeChain = writeChain.then(async () => {
    const l = await load();
    l.push({ at: Date.now(), kind, message });
    if (l.length > MAX) l.splice(0, l.length - MAX);
    try { await AsyncStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch { /* journal best-effort */ }
    logListeners.forEach(fn => fn([...l]));
  }).catch(() => {});
}

export async function getSyncLog(): Promise<SyncLogEntry[]> { await writeChain; return [...(await load())]; }

export async function clearSyncLog(): Promise<void> {
  await writeChain;
  cache = [];
  await AsyncStorage.removeItem(LOG_KEY);
  logListeners.forEach(fn => fn([]));
}

export function subscribeSyncLog(fn: (l: SyncLogEntry[]) => void): () => void {
  logListeners.add(fn);
  return () => { logListeners.delete(fn); };
}

const LABEL: Record<SyncLogKind, string> = {
  envoi: 'ENVOI', reception: 'RÉCEPTION', conflit: 'CONFLIT', suppression: 'SUPPRESSION',
  erreur: 'ERREUR', pause: 'PAUSE', reprise: 'REPRISE', info: 'INFO',
};
export function formatSyncLogEntry(e: SyncLogEntry): string {
  const d = new Date(e.at);
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return `${ts}  ${LABEL[e.kind]}  ${e.message}`;
}
export function formatSyncLog(l: SyncLogEntry[]): string { return l.map(formatSyncLogEntry).join('\n'); }

// ── État visible ───────────────────────────────────────────────────────
export function getSyncStatus(): SyncStatus { return status; }
export function setSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  statusListeners.forEach(fn => fn(status));
}
export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => { statusListeners.delete(fn); };
}

// ── Pause ───────────────────────────────────────────────────────────────
export async function getPause(): Promise<{ at: number; reason: string } | null> {
  try { return JSON.parse((await AsyncStorage.getItem(PAUSE_KEY)) ?? 'null'); } catch { return null; }
}
export async function setPause(reason: string): Promise<void> {
  const p = { at: Date.now(), reason };
  await AsyncStorage.setItem(PAUSE_KEY, JSON.stringify(p));
  setSyncStatus({ phase: 'paused', pausedAt: p.at, pauseReason: reason, nextRetryAt: undefined });
  logSync('pause', reason);
}
export async function clearPause(): Promise<void> {
  await AsyncStorage.removeItem(PAUSE_KEY);
  setSyncStatus({ phase: 'idle', pausedAt: undefined, pauseReason: undefined });
  logSync('reprise', 'Synchronisation reprise');
}
/** À appeler au démarrage : restaure l'état « pause » persistant. */
export async function hydrateSyncStatus(): Promise<void> {
  const p = await getPause();
  if (p) setSyncStatus({ phase: 'paused', pausedAt: p.at, pauseReason: p.reason });
}
