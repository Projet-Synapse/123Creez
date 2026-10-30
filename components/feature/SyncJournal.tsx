// Journal de synchro (Paramètres → Synchronisation) et bannière « Synchro en pause ».
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import {
  getSyncLog, clearSyncLog, subscribeSyncLog, subscribeSyncStatus, formatSyncLog, formatSyncLogEntry,
  SyncLogEntry, SyncStatus,
} from '@/services/syncLog';
import { pauseSync, resumeSync } from '@/services/supabaseService';

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ phase: 'idle', pending: 0 });
  useEffect(() => subscribeSyncStatus(setS), []);
  return s;
}

const KIND_COLOR: Record<string, string> = {
  erreur: '#e5534b', conflit: '#d29922', pause: '#d29922', reprise: '#3fb950',
  envoi: '#58a6ff', reception: '#3fb950', suppression: '#a371f7', info: '#8b949e',
};

function statusLine(s: SyncStatus): string {
  switch (s.phase) {
    case 'syncing': return 'Synchronisation en cours…';
    case 'paused': return 'Synchro en pause';
    case 'retry': {
      const sec = s.nextRetryAt ? Math.max(0, Math.round((s.nextRetryAt - Date.now()) / 1000)) : 0;
      return `Hors ligne ou erreur — nouvel essai dans ~${sec} s`;
    }
    case 'error': return `Erreur : ${s.detail ?? ''}`;
    default: return 'À jour';
  }
}

/** État + pause/reprise + journal horodaté (copier / vider). */
export const SyncJournal: React.FC = () => {
  const { theme } = useTheme();
  const status = useSyncStatus();
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSyncLog().then(setLog);
    return subscribeSyncLog(setLog);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(formatSyncLog(log) || '(journal vide)');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const togglePause = async () => {
    setBusy(true);
    try { if (status.phase === 'paused') await resumeSync(); else await pauseSync(); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={[styles.status, { color: theme.textPrimary }]}>
        {statusLine(status)}{status.pending > 0 ? ` · ${status.pending} changement(s) en attente d’envoi` : ''}
      </Text>
      <Pressable onPress={togglePause} disabled={busy} style={[styles.btn, { borderColor: theme.surfaceBorder }]}>
        <MaterialCommunityIcons name={status.phase === 'paused' ? 'play' : 'pause'} size={16} color={theme.textSecondary} />
        <Text style={[styles.btnText, { color: theme.textSecondary }]}>
          {status.phase === 'paused' ? 'Reprendre la synchronisation' : 'Mettre la synchro en pause'}
        </Text>
      </Pressable>

      <View style={styles.row}>
        <Text style={[styles.title, { color: theme.textMuted }]}>Journal ({log.length})</Text>
        <Pressable onPress={copy} style={[styles.smallBtn, { borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.btnText, { color: theme.textSecondary }]}>{copied ? 'Copié' : 'Copier'}</Text>
        </Pressable>
        <Pressable onPress={() => clearSyncLog()} style={[styles.smallBtn, { borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.btnText, { color: theme.textSecondary }]}>Vider</Text>
        </Pressable>
      </View>
      <ScrollView style={[styles.box, { borderColor: theme.surfaceBorder }]} nestedScrollEnabled>
        {log.length === 0
          ? <Text style={[styles.line, { color: theme.textMuted }]}>Aucun évènement.</Text>
          : [...log].reverse().map((e, i) => (
            <Text key={`${e.at}-${i}`} style={[styles.line, { color: KIND_COLOR[e.kind] ?? theme.textSecondary }]} selectable>
              {formatSyncLogEntry(e)}
            </Text>
          ))}
      </ScrollView>
    </View>
  );
};

/** Bannière affichée tant que la synchro est en pause, avec « Reprendre ». */
export const SyncPausedBanner: React.FC = () => {
  const { theme } = useTheme();
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  if (status.phase !== 'paused') return null;
  return (
    <View style={[styles.banner, { backgroundColor: '#d2992222', borderColor: '#d29922' }]}>
      <MaterialCommunityIcons name="pause-circle-outline" size={18} color="#d29922" />
      <Text style={[styles.bannerText, { color: theme.textPrimary }]} numberOfLines={2}>
        Synchro en pause{status.pending > 0 ? ` — ${status.pending} changement(s) en attente` : ''}
      </Text>
      <Pressable
        disabled={busy}
        onPress={async () => { setBusy(true); try { await resumeSync(); } finally { setBusy(false); } }}
        style={[styles.bannerBtn, { backgroundColor: '#d29922' }]}
      >
        <Text style={styles.bannerBtnText}>{busy ? '…' : 'Reprendre'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  status: { fontSize: FontSize.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  smallBtn: { borderWidth: 1, borderRadius: Radius.md, paddingVertical: 4, paddingHorizontal: 10 },
  btnText: { fontSize: FontSize.sm },
  box: { maxHeight: 260, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm },
  line: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 6, paddingHorizontal: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  bannerText: { flex: 1, fontSize: FontSize.sm },
  bannerBtn: { borderRadius: Radius.md, paddingVertical: 4, paddingHorizontal: 12 },
  bannerBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: FontSize.sm },
});
