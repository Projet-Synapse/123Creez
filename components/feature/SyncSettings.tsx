// Powered by OnSpace.AI — Réglages : compte Google, synchronisation Supabase
// et dossier vault explorateur. Quatre blocs indépendants montés par
// app/settings.tsx :
//  - AccountCard          : connexion Google (PKCE, protocole app123creez://)
//  - SupabaseSetupSteps   : deux réglages dashboard une-seule-fois (SQL +
//                           Redirect URL), contenu préparé par boutons copie
//  - SyncSettings         : config Supabase, test, sync manuelle/auto
//  - VaultFolderSettings  : choix du dossier explorateur (desktop uniquement)
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Pressable, TextInput, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import {
  getConfig, saveConfig, testConnection, syncNow, getLastSync, SupabaseConfig,
} from '@/services/supabaseService';
import {
  vaultFolderAvailable, getVaultFolder, chooseVaultFolder,
} from '@/services/vaultFolderService';
import { SUPABASE_SETUP_SQL } from '@/services/supabaseSetupSql';

// Projet « Projet Synapse » — pages du dashboard pour les deux réglages
// une-seule-fois (l’éditeur SQL et les Redirect URLs vivent côté dashboard ;
// tout le contenu à coller est préparé ici par boutons de copie).
const PROJECT_REF = 'lcfbzfsfubegppsyzkeb';
const DASHBOARD_SQL_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`;
const DASHBOARD_AUTH_URLS = `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration`;
const APP_CALLBACK_URL = 'app123creez://auth-callback';

function useSyncSettingsState() {
  const { theme } = useTheme();
  const [config, setConfig] = useState<SupabaseConfig>({ url: '', anonKey: '', autoPush: true });
  const [urlDraft, setUrlDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(cfg => {
      setConfig(cfg);
      setUrlDraft(cfg.url);
      setKeyDraft(cfg.anonKey);
    });
    getLastSync().then(setLastSync);
  }, []);

  const applyDraft = async (partial: Partial<SupabaseConfig>) => {
    const next = await saveConfig(partial);
    setConfig(next);
  };

  const handleTest = async () => {
    await saveConfig({ url: urlDraft.trim(), anonKey: keyDraft.trim() });
    setTesting(true);
    setTestResult(await testConnection());
    setTesting(false);
  };

  const handleSync = async () => {
    await saveConfig({ url: urlDraft.trim(), anonKey: keyDraft.trim() });
    setSyncing(true);
    setSyncResult(null);
    const result = await syncNow();
    setSyncing(false);
    setLastSync(await getLastSync());
    setSyncResult(result.ok
      ? `Synchronisé : ${result.pushed} envoyée(s), ${result.pulled} récupérée(s), ${result.deleted} supprimée(s).`
      : `Échec : ${result.error}`);
  };

  return {
    theme, config, urlDraft, setUrlDraft, keyDraft, setKeyDraft,
    testing, testResult, syncing, syncResult, lastSync,
    applyDraft, handleTest, handleSync,
  };
}

// ─── Carte Compte (connexion Google) ─────────────────────────────────────
export const AccountCard: React.FC = () => {
  const { theme } = useTheme();
  const { user, loading, available, error, signInWithGoogle, signOut } = useAuth();

  if (!available) {
    return (
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Connexion indisponible sur cette plateforme (web).
      </Text>
    );
  }

  if (loading) {
    return <Text style={[styles.hint, { color: theme.textMuted }]}>Chargement de la session…</Text>;
  }

  if (user) {
    return (
      <View>
        <View style={styles.accountRow}>
          <MaterialCommunityIcons name="account-circle" size={34} color={theme.accent} />
          <View style={styles.accountInfo}>
            <Text style={[styles.accountEmail, { color: theme.textPrimary }]} numberOfLines={1}>
              {user.email ?? 'Compte Google'}
            </Text>
            <Text style={[styles.accountHint, { color: theme.textMuted }]}>
              Les toiles synchronisées sont liées à ce compte.
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }, pressed && { opacity: 0.7 }, { alignSelf: 'flex-start' }]}
          onPress={() => { signOut(); }}
        >
          <MaterialCommunityIcons name="logout" size={16} color={theme.textSecondary} />
          <Text style={[styles.btnText, { color: theme.textSecondary }]}>Se déconnecter</Text>
        </Pressable>
        {error ? <Text style={[styles.status, { color: theme.danger }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Connecte-toi avec ton compte Google pour lier le vault à ton compte et
        activer la synchronisation.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: theme.accent, borderColor: theme.accent }, pressed && { opacity: 0.7 }, { alignSelf: 'flex-start' }]}
        onPress={() => { signInWithGoogle(); }}
      >
        <MaterialCommunityIcons name="google" size={16} color="#0d0d0d" />
        <Text style={[styles.btnText, { color: '#0d0d0d', fontWeight: '700' }]}>Se connecter avec Google</Text>
      </Pressable>
      {error ? <Text style={[styles.status, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
};

// ─── Étapes de mise en place (SQL + Redirect URL, contenu préparé) ────────
export const SupabaseSetupSteps: React.FC = () => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState<string | null>(null);

  const copyAndOpen = async (marker: string, text: string, url: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { }
    setCopied(marker);
    Linking.openURL(url);
  };

  const Step = ({ n, title }: { n: number; title: string }) => (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>{title}</Text>
    </View>
  );

  return (
    <View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Deux réglages à poser une seule fois dans le dashboard Supabase
        (projet « Projet Synapse ») — le contenu à coller est copié
        automatiquement, tu n’as qu’à coller dans la page qui s’ouvre.
      </Text>

      <Step n={1} title="Créer les tables (SQL)" />
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }, pressed && { opacity: 0.7 }, { alignSelf: 'flex-start' }]}
        onPress={() => copyAndOpen('sql', SUPABASE_SETUP_SQL, DASHBOARD_SQL_URL)}
      >
        <MaterialCommunityIcons name="content-copy" size={15} color={theme.textSecondary} />
        <Text style={[styles.btnText, { color: theme.textSecondary }]}>Copier le SQL + ouvrir l’éditeur</Text>
      </Pressable>

      <View style={{ height: Spacing.sm }} />

      <Step n={2} title="Autoriser le retour app123creez://" />
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }, pressed && { opacity: 0.7 }, { alignSelf: 'flex-start' }]}
        onPress={() => copyAndOpen('redirect', APP_CALLBACK_URL, DASHBOARD_AUTH_URLS)}
      >
        <MaterialCommunityIcons name="content-copy" size={15} color={theme.textSecondary} />
        <Text style={[styles.btnText, { color: theme.textSecondary }]}>Copier l’URL + ouvrir les réglages</Text>
      </Pressable>
      <Text style={[styles.status, { color: theme.textMuted }]}>
        Dans « Redirect URLs », ajoute : <Text style={{ fontFamily: 'monospace' }}>{APP_CALLBACK_URL}</Text>
      </Text>
      {copied && <Text style={[styles.status, { color: theme.accent }]}>Copié — colle dans la page qui vient de s’ouvrir.</Text>}
    </View>
  );
};

// ─── Config Supabase + sync manuelle/auto ─────────────────────────────────
export const SyncSettings: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { config, urlDraft, setUrlDraft, keyDraft, setKeyDraft,
    testing, testResult, syncing, syncResult, lastSync, applyDraft, handleTest, handleSync } = useSyncSettingsState();

  return (
    <View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Schéma <Text style={{ fontFamily: 'monospace' }}>app_123creez</Text> du
        projet « Projet Synapse ». Préconfiguré — ne touche que si besoin.
      </Text>

      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>URL du projet</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder, color: theme.textPrimary }]}
        value={urlDraft}
        onChangeText={setUrlDraft}
        placeholder="https://xxxx.supabase.co"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Clé anon public</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder, color: theme.textPrimary }]}
        value={keyDraft}
        onChangeText={setKeyDraft}
        placeholder="sb_publishable_…"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }, pressed && { opacity: 0.7 }]}
          onPress={handleTest}
          disabled={testing}
        >
          <MaterialCommunityIcons name="check-network-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.btnText, { color: theme.textSecondary }]}>{testing ? 'Test…' : 'Tester la connexion'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: theme.accent, borderColor: theme.accent }, pressed && { opacity: 0.7 }]}
          onPress={handleSync}
          disabled={syncing || !user}
        >
          <MaterialCommunityIcons name="cloud-sync-outline" size={16} color="#0d0d0d" />
          <Text style={[styles.btnText, { color: '#0d0d0d', fontWeight: '700' }]}>{syncing ? 'Sync…' : 'Synchroniser'}</Text>
        </Pressable>
      </View>

      {!user && (
        <Text style={[styles.status, { color: theme.textMuted }]}>
          Connecte-toi avec Google (carte Compte ci-dessus) pour activer la
          synchronisation.
        </Text>
      )}
      {testResult && (
        <Text style={[styles.status, { color: testResult.ok ? '#6bcb77' : theme.danger }]}>
          {testResult.ok ? '✓ Connexion réussie' : `✗ ${testResult.error}`}
        </Text>
      )}
      {syncResult && <Text style={[styles.status, { color: theme.textSecondary }]}>{syncResult}</Text>}
      {lastSync && (
        <Text style={[styles.status, { color: theme.textMuted }]}>
          Dernière sync : {new Date(lastSync).toLocaleString('fr-FR')}
        </Text>
      )}

      <View style={[styles.toggleRow, { borderTopColor: theme.surfaceBorder }]}>
        <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Sync automatique à la sauvegarde</Text>
        <Pressable
          style={[styles.toggle, config.autoPush && { backgroundColor: theme.accent }]}
          onPress={() => applyDraft({ autoPush: !config.autoPush })}
        >
          <View style={[styles.toggleKnob, config.autoPush && { alignSelf: 'flex-end' }]} />
        </Pressable>
      </View>
    </View>
  );
};

// ─── Dossier vault (miroir explorateur) ───────────────────────────────────
export const VaultFolderSettings: React.FC = () => {
  const { theme } = useTheme();
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => { getVaultFolder().then(setFolder); }, []);

  const handleChoose = async () => {
    const next = await chooseVaultFolder();
    if (next !== null) setFolder(next);
  };

  if (!vaultFolderAvailable()) {
    return (
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Disponible dans l’application de bureau (Windows) uniquement.
      </Text>
    );
  }

  return (
    <View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Lie un dossier de ton ordinateur au vault : les images déposées dedans
        deviennent des toiles, et chaque toile sauvegardée y est exportée en PNG.
      </Text>
      <View style={[styles.folderBox, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }]}>
        <MaterialCommunityIcons name="folder-open-outline" size={18} color={theme.accent} />
        <Text style={[styles.folderPath, { color: theme.textPrimary }]} numberOfLines={1}>
          {folder ?? 'Aucun dossier choisi'}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }, pressed && { opacity: 0.7 }, { alignSelf: 'flex-start' }]}
        onPress={handleChoose}
      >
        <MaterialCommunityIcons name="folder-search-outline" size={16} color={theme.textSecondary} />
        <Text style={[styles.btnText, { color: theme.textSecondary }]}>{folder ? 'Changer de dossier' : 'Choisir un dossier'}</Text>
      </Pressable>
      {folder && (
        <Text style={[styles.status, { color: theme.textMuted }]}>
          Dépose des images dans ce dossier : elles apparaîtront comme nouvelles
          toiles à la racine.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hint: {
    fontSize: FontSize.sm,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    fontFamily: 'monospace',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  status: {
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
  },
  toggleLabel: {
    fontSize: FontSize.sm,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.4)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  folderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  folderPath: {
    fontSize: FontSize.sm,
    flex: 1,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  accountInfo: {
    flex: 1,
  },
  accountEmail: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  accountHint: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  stepTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
