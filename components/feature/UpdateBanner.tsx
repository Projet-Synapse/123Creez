// Powered by OnSpace.AI — Bannière de mise à jour dans l'app
import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useUpdates } from '@/hooks/useUpdates';
import { RELEASES_URL } from '@/constants/config';
import { useTheme } from '@/hooks/useTheme';

/**
 * Sits at the bottom of the vault. Silent unless a newer version exists, so
 * it costs nothing on the happy path.
 */
export function UpdateBanner() {
  const { theme } = useTheme();
  const {
    stage,
    latestVersion,
    progress,
    mandatory,
    canSelfInstall,
    downloadUrl,
    dismissed,
    dismiss,
    applyUpdate,
  } = useUpdates();

  const isBusy = stage === 'downloading';
  const isReady = stage === 'ready';
  const shouldShow = stage === 'available' || isBusy || isReady;
  if (!shouldShow) return null;
  if (dismissed && !mandatory && !isBusy) return null;

  const handlePress = () => {
    if (isBusy) return;
    if (canSelfInstall) {
      void applyUpdate();
      return;
    }
    void Linking.openURL(downloadUrl ?? RELEASES_URL);
  };

  const actionLabel = isReady ? 'Redémarrer' : canSelfInstall ? 'Mettre à jour' : 'Télécharger';
  const busyLabel = `Téléchargement${typeof progress === 'number' ? ` ${progress}%` : '…'}`;

  const styles = StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: mandatory ? theme.danger : theme.accent,
      borderRadius: 14,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 12,
    },
    textBlock: { flex: 1, gap: 2 },
    title: { color: theme.textPrimary, fontSize: 13, fontWeight: '700' },
    subtitle: { color: theme.textSecondary, fontSize: 11 },
    progressTrack: {
      height: 4,
      marginTop: 4,
      borderRadius: 999,
      backgroundColor: theme.surfaceBorder,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 999 },
    action: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 96,
      alignItems: 'center',
    },
    actionText: { color: '#0d0d0d', fontSize: 13, fontWeight: '700' },
  });

  return (
    <View style={styles.banner}>
      <MaterialCommunityIcons
        name={mandatory ? 'priority-high' : 'update'}
        size={20}
        color={mandatory ? theme.danger : theme.accent}
      />

      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {mandatory
            ? 'Mise à jour requise'
            : isReady
              ? 'Nouvelle version prête à installer'
              : 'Nouvelle version disponible'}
          {latestVersion ? ` · ${latestVersion}` : ''}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {isBusy
            ? busyLabel
            : isReady
              ? "Elle s'installera à la fermeture de l'application, ou redémarrez maintenant."
              : canSelfInstall
                ? "L'application redémarrera pour terminer l'installation."
                : 'Ouvrez la page de téléchargement pour installer la nouvelle version.'}
        </Text>
        {isBusy && typeof progress === 'number' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(2, progress)}%` }]} />
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={handlePress}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel={isBusy ? busyLabel : actionLabel}
        style={({ pressed }) => [styles.action, pressed && !isBusy && { opacity: 0.75 }]}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color="#0d0d0d" />
        ) : (
          <Text style={styles.actionText}>{actionLabel}</Text>
        )}
      </Pressable>

      {!mandatory && !isBusy ? (
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Masquer la notification de mise à jour"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
