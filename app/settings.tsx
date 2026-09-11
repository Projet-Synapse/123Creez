// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, StyleSheet, Text, Pressable, ScrollView, Switch, Modal, TextInput,
  ActivityIndicator, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAlert } from '@/template';
import { useUpdates } from '@/hooks/useUpdates';
import { RELEASES_URL } from '@/constants/config';
import { ThemeMode, CanvasBg } from '@/services/settingsService';
import { getStorageInfo, clearAllData, formatBytes } from '@/services/vaultService';

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string; icon: string; colors: [string, string] }[] = [
  { id: 'dark', label: 'Sombre', desc: 'Thème sombre classique', icon: 'weather-night', colors: ['#0d0d0d', '#1a1a1a'] },
  { id: 'oled', label: 'OLED Noir', desc: 'Noir pur, économie batterie', icon: 'circle', colors: ['#000000', '#0a0a0a'] },
  { id: 'light', label: 'Clair', desc: 'Interface lumineuse', icon: 'white-balance-sunny', colors: ['#f4f4f8', '#ffffff'] },
];

const CANVAS_BG_OPTIONS: { id: CanvasBg; label: string; icon: string }[] = [
  { id: 'white', label: 'Blanc', icon: 'checkbox-blank-outline' },
  { id: 'black', label: 'Noir', icon: 'checkbox-blank' },
  { id: 'transparent', label: 'Transparent', icon: 'checkerboard' },
  { id: 'grid', label: 'Grille', icon: 'grid' },
  { id: 'dots', label: 'Points', icon: 'dots-grid' },
];

const WORKSPACE_BG_PRESETS = [
  { color: '#1a1a1a', label: 'Sombre' },
  { color: '#0d0d0d', label: 'OLED' },
  { color: '#2a2a2a', label: 'Gris' },
  { color: '#1a1a2e', label: 'Bleu nuit' },
  { color: '#1c1c0e', label: 'Olive' },
  { color: '#0e1c1a', label: 'Forêt' },
  { color: '#f4f4f8', label: 'Clair' },
  { color: '#e8e8e0', label: 'Crème' },
];

const CURSOR_STYLES = [
  { id: 'dot', label: 'Point', icon: 'circle-medium' },
  { id: 'crosshair', label: 'Viseur', icon: 'crosshairs' },
  { id: 'ring', label: 'Anneau', icon: 'circle-outline' },
  { id: 'none', label: 'Aucun', icon: 'eye-off-outline' },
];

const PRESSURE_CURVES = [
  { id: 'linear', label: 'Linéaire' },
  { id: 'soft', label: 'Douce' },
  { id: 'hard', label: 'Dure' },
  { id: 'flat', label: 'Plate' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, settings, updateSettings } = useTheme();
  const { showAlert } = useAlert();
  const updates = useUpdates();
  const [showCustomWsBg, setShowCustomWsBg] = useState(false);
  const [customWsHex, setCustomWsHex] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ canvasCount: number; totalSize: number; vaultKeys: string[] } | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  const styles = makeStyles(theme);

  useEffect(() => {
    if (activeSection === 'storage') {
      loadStorageInfo();
    }
  }, [activeSection]);

  const loadStorageInfo = async () => {
    setLoadingStorage(true);
    const info = await getStorageInfo();
    setStorageInfo(info);
    setLoadingStorage(false);
  };

  const applyCustomWs = () => {
    const hex = customWsHex.startsWith('#') ? customWsHex : `#${customWsHex}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      updateSettings({ workspaceBgColor: hex });
      setShowCustomWsBg(false);
      setCustomWsHex('');
    }
  };

  const handleClearData = () => {
    showAlert(
      'Effacer toutes les données',
      'Cela supprimera toutes vos toiles, dossiers et paramètres. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout effacer', style: 'destructive',
          onPress: async () => {
            await clearAllData();
            await loadStorageInfo();
            showAlert('Données effacées', 'Toutes les données ont été supprimées.');
          },
        },
      ]
    );
  };

  const SECTIONS = [
    { id: 'appearance', label: 'Apparence', icon: 'palette-outline' },
    { id: 'workspace', label: 'Espace de travail', icon: 'brush-outline' },
    { id: 'tools', label: 'Outils & Pinceau', icon: 'pencil-outline' },
    { id: 'interface', label: 'Interface', icon: 'view-dashboard-outline' },
    { id: 'performance', label: 'Performance', icon: 'speedometer-outline' },
    { id: 'storage', label: 'Stockage & Vault', icon: 'folder-outline' },
    { id: 'updates', label: 'Mises à jour', icon: 'update' },
    { id: 'accessibility', label: 'Accessibilité', icon: 'eye-outline' },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style={theme.statusBarStyle} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]} onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Left nav */}
        <ScrollView style={styles.navCol} showsVerticalScrollIndicator={false}>
          {SECTIONS.map(s => (
            <Pressable
              key={s.id}
              style={[styles.navItem, activeSection === s.id && { backgroundColor: theme.activeGlow, borderColor: theme.accent }]}
              onPress={() => setActiveSection(activeSection === s.id ? null : s.id)}
            >
              <MaterialCommunityIcons
                name={s.icon as any}
                size={18}
                color={activeSection === s.id ? theme.accent : theme.textSecondary}
              />
              <Text style={[styles.navLabel, activeSection === s.id && { color: theme.accent }]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Right content */}
        <ScrollView style={styles.contentCol} showsVerticalScrollIndicator={false}>

          {/* ─── Apparence ─── */}
          {activeSection === 'appearance' && (
            <View style={styles.section}>
              <SectionTitle label="Thème" theme={theme} />
              <View style={styles.themeRow}>
                {THEME_OPTIONS.map(opt => {
                  const isActive = settings.themeMode === opt.id;
                  return (
                    <Pressable key={opt.id} style={[styles.themeCard, isActive && { borderColor: theme.accent, borderWidth: 2 }]} onPress={() => updateSettings({ themeMode: opt.id })}>
                      <View style={[styles.themePreview, { backgroundColor: opt.colors[0] }]}>
                        <View style={[styles.themePreviewBar, { backgroundColor: opt.colors[1] }]} />
                      </View>
                      <MaterialCommunityIcons name={opt.icon as any} size={16} color={isActive ? theme.accent : theme.textMuted} />
                      <Text style={[styles.themeLabel, isActive && { color: theme.accent }]}>{opt.label}</Text>
                      <Text style={styles.themeDesc}>{opt.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <SectionTitle label="Couleur d'accentuation" theme={theme} />
              <View style={styles.accentRow}>
                {['#4ecdc4', '#ff6b6b', '#ffd700', '#7c4dff', '#6bcb77', '#ff8800', '#00b0ff', '#f48fb1'].map(c => (
                  <Pressable
                    key={c}
                    style={[styles.accentDot, { backgroundColor: c }, settings.accentColor === c && styles.accentDotActive]}
                    onPress={() => updateSettings({ accentColor: c })}
                  />
                ))}
              </View>
              <Text style={styles.hint}>La couleur d&apos;accentuation sera appliquée au prochain rechargement.</Text>
            </View>
          )}

          {/* ─── Workspace ─── */}
          {activeSection === 'workspace' && (
            <View style={styles.section}>
              <SectionTitle label="Fond du canvas" theme={theme} />
              <View style={styles.bgRow}>
                {CANVAS_BG_OPTIONS.map(opt => {
                  const isActive = settings.canvasBg === opt.id;
                  return (
                    <Pressable key={opt.id} style={[styles.bgOption, isActive && { borderColor: theme.accent, backgroundColor: theme.activeGlow }]} onPress={() => updateSettings({ canvasBg: opt.id })}>
                      <MaterialCommunityIcons name={opt.icon as any} size={20} color={isActive ? theme.accent : theme.textSecondary} />
                      <Text style={[styles.bgLabel, isActive && { color: theme.accent }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <SectionTitle label="Fond de l'espace de travail" theme={theme} />
              <View style={styles.currentWsBg}>
                <View style={[styles.wsBgPreview, { backgroundColor: settings.workspaceBgColor ?? '#1a1a1a' }]} />
                <Text style={[styles.wsBgHex, { color: theme.textSecondary }]}>{(settings.workspaceBgColor ?? '#1a1a1a').toUpperCase()}</Text>
                <Pressable style={({ pressed }) => [styles.customWsBtn, pressed && { opacity: 0.7 }]} onPress={() => setShowCustomWsBg(true)}>
                  <MaterialCommunityIcons name="eyedropper" size={14} color={theme.accent} />
                  <Text style={[styles.customWsBtnText, { color: theme.accent }]}>HEX</Text>
                </Pressable>
              </View>
              <View style={styles.wsBgPresets}>
                {WORKSPACE_BG_PRESETS.map(preset => {
                  const isActive = settings.workspaceBgColor === preset.color;
                  return (
                    <Pressable key={preset.color} style={[styles.wsBgDot, { backgroundColor: preset.color }, isActive && { borderColor: theme.accent, borderWidth: 2.5 }]} onPress={() => updateSettings({ workspaceBgColor: preset.color })}>
                      {isActive && <MaterialCommunityIcons name="check" size={12} color={preset.color === '#f4f4f8' || preset.color === '#e8e8e0' ? '#000' : '#fff'} />}
                    </Pressable>
                  );
                })}
              </View>

              <SectionTitle label="Superpositions" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Afficher la grille" value={settings.showGrid} onToggle={v => updateSettings({ showGrid: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Afficher les règles" value={settings.showRulers ?? false} onToggle={v => updateSettings({ showRulers: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Barre d'état du canvas" value={settings.showStatusBar} onToggle={v => updateSettings({ showStatusBar: v })} theme={theme} />
              </Card>
            </View>
          )}

          {/* ─── Outils & Pinceau ─── */}
          {activeSection === 'tools' && (
            <View style={styles.section}>
              <SectionTitle label="Position de la barre d'outils" theme={theme} />
              <View style={styles.segmentRow}>
                {(['left', 'right'] as const).map(pos => (
                  <Pressable key={pos} style={[styles.segment, settings.toolbarPosition === pos && styles.segmentActive]} onPress={() => updateSettings({ toolbarPosition: pos })}>
                    <MaterialCommunityIcons name={pos === 'left' ? 'dock-left' : 'dock-right'} size={18} color={settings.toolbarPosition === pos ? '#0d0d0d' : theme.textSecondary} />
                    <Text style={[styles.segmentText, settings.toolbarPosition === pos && { color: '#0d0d0d' }]}>{pos === 'left' ? 'Gauche' : 'Droite'}</Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle label="Curseur du pinceau" theme={theme} />
              <View style={styles.segmentRow}>
                {CURSOR_STYLES.map(c => (
                  <Pressable key={c.id} style={[styles.cursorBtn, settings.cursorStyle === c.id && { borderColor: theme.accent, backgroundColor: theme.activeGlow }]} onPress={() => updateSettings({ cursorStyle: c.id })}>
                    <MaterialCommunityIcons name={c.icon as any} size={18} color={settings.cursorStyle === c.id ? theme.accent : theme.textSecondary} />
                    <Text style={[styles.cursorLabel, settings.cursorStyle === c.id && { color: theme.accent }]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle label="Courbe de pression" theme={theme} />
              <View style={styles.pressureRow}>
                {PRESSURE_CURVES.map(p => (
                  <Pressable key={p.id} style={[styles.pressureBtn, settings.pressureCurve === p.id && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => updateSettings({ pressureCurve: p.id })}>
                    <Text style={[styles.pressureText, settings.pressureCurve === p.id && { color: '#0d0d0d' }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle label="Lissage" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Lissage du tracé" value={settings.smoothing ?? true} onToggle={v => updateSettings({ smoothing: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Correction gyroscopique" value={settings.gyroCorrection ?? false} onToggle={v => updateSettings({ gyroCorrection: v })} theme={theme} />
              </Card>
            </View>
          )}

          {/* ─── Interface ─── */}
          {activeSection === 'interface' && (
            <View style={styles.section}>
              <SectionTitle label="Navigation" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Afficher les infos de calque" value={settings.showLayerInfo ?? true} onToggle={v => updateSettings({ showLayerInfo: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Animations de l'interface" value={settings.uiAnimations ?? true} onToggle={v => updateSettings({ uiAnimations: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Confirmation avant fermeture" value={settings.confirmOnClose ?? true} onToggle={v => updateSettings({ confirmOnClose: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Mode plein écran automatique" value={settings.autoFullscreen ?? false} onToggle={v => updateSettings({ autoFullscreen: v })} theme={theme} />
              </Card>

              <SectionTitle label="Thumbnails du vault" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Aperçu des toiles en temps réel" value={settings.realtimeThumbnail ?? false} onToggle={v => updateSettings({ realtimeThumbnail: v })} theme={theme} />
              </Card>

              <SectionTitle label="Langue" theme={theme} />
              <Card theme={theme}>
                {(['fr', 'en', 'ja', 'zh'] as const).map((lang, i, arr) => (
                  <React.Fragment key={lang}>
                    <Pressable style={styles.langRow} onPress={() => updateSettings({ language: lang })}>
                      <Text style={[styles.langLabel, { color: theme.textPrimary }]}>
                        {{ fr: '🇫🇷 Français', en: '🇬🇧 English', ja: '🇯🇵 日本語', zh: '🇨🇳 中文' }[lang]}
                      </Text>
                      {(settings.language ?? 'fr') === lang && <MaterialCommunityIcons name="check" size={18} color={theme.accent} />}
                    </Pressable>
                    {i < arr.length - 1 && <Divider theme={theme} />}
                  </React.Fragment>
                ))}
              </Card>
            </View>
          )}

          {/* ─── Performance ─── */}
          {activeSection === 'performance' && (
            <View style={styles.section}>
              <SectionTitle label="Rendu" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Rendu haute résolution" value={settings.hiDpiRendering ?? true} onToggle={v => updateSettings({ hiDpiRendering: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Anti-aliasing" value={settings.antialiasing ?? true} onToggle={v => updateSettings({ antialiasing: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Mode économie batterie" value={settings.batterySaver ?? false} onToggle={v => updateSettings({ batterySaver: v })} theme={theme} />
              </Card>

              <SectionTitle label="Limite d'historique (Annuler)" theme={theme} />
              <View style={styles.historyRow}>
                {[10, 20, 30, 50, 100].map(n => (
                  <Pressable key={n} style={[styles.historyBtn, (settings.historyLimit ?? 30) === n && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => updateSettings({ historyLimit: n })}>
                    <Text style={[styles.historyText, (settings.historyLimit ?? 30) === n && { color: '#0d0d0d' }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>Plus la limite est haute, plus la mémoire utilisée est importante.</Text>
            </View>
          )}

          {/* ─── Stockage ─── */}
          {activeSection === 'storage' && (
            <View style={styles.section}>
              <SectionTitle label="Informations vault" theme={theme} />
              <Card theme={theme}>
                {loadingStorage ? (
                  <ActivityIndicator color={theme.accent} style={{ padding: 16 }} />
                ) : storageInfo ? (
                  <>
                    <View style={styles.storageRow}>
                      <MaterialCommunityIcons name="brush-outline" size={20} color={theme.accent} />
                      <Text style={[styles.storageLabel, { color: theme.textPrimary }]}>Toiles</Text>
                      <Text style={[styles.storageVal, { color: theme.accent }]}>{storageInfo.canvasCount}</Text>
                    </View>
                    <Divider theme={theme} />
                    <View style={styles.storageRow}>
                      <MaterialCommunityIcons name="database-outline" size={20} color={theme.accentGold} />
                      <Text style={[styles.storageLabel, { color: theme.textPrimary }]}>Taille totale</Text>
                      <Text style={[styles.storageVal, { color: theme.accentGold }]}>{formatBytes(storageInfo.totalSize)}</Text>
                    </View>
                    <Divider theme={theme} />
                    <View style={styles.storageRow}>
                      <MaterialCommunityIcons name="key-outline" size={20} color={theme.textSecondary} />
                      <Text style={[styles.storageLabel, { color: theme.textPrimary }]}>Entrées AsyncStorage</Text>
                      <Text style={[styles.storageVal, { color: theme.textSecondary }]}>{storageInfo.vaultKeys.length}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.hint}>Impossible de charger les infos de stockage.</Text>
                )}
              </Card>

              <SectionTitle label="Sauvegarde automatique" theme={theme} />
              <View style={styles.autoSaveRow}>
                {[0, 15, 30, 60, 120].map(sec => {
                  const isActive = settings.autoSaveInterval === sec;
                  return (
                    <Pressable key={sec} style={[styles.autoSaveBtn, isActive && styles.autoSaveBtnActive]} onPress={() => updateSettings({ autoSaveInterval: sec })}>
                      <Text style={[styles.autoSaveText, isActive && { color: '#0d0d0d' }]}>
                        {sec === 0 ? 'Off' : sec < 60 ? `${sec}s` : `${sec / 60}m`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>{settings.autoSaveInterval === 0 ? 'Sauvegarde manuelle uniquement.' : `Sauvegarde toutes les ${settings.autoSaveInterval < 60 ? `${settings.autoSaveInterval}s` : `${settings.autoSaveInterval / 60}min`}.`}</Text>

              <SectionTitle label="Format d'export par défaut" theme={theme} />
              <View style={styles.exportRow}>
                {['PNG', 'JPEG'].map(fmt => (
                  <Pressable key={fmt} style={[styles.exportBtn, settings.defaultExportFormat === fmt && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => updateSettings({ defaultExportFormat: fmt })}>
                    <Text style={[styles.exportText, settings.defaultExportFormat === fmt && { color: '#0d0d0d' }]}>{fmt}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>PNG est sans perte ; JPEG produit des fichiers plus légers (fond opaque).</Text>

              <SectionTitle label="Zone de danger" theme={theme} />
              <Card theme={theme}>
                <Pressable style={styles.dangerRow} onPress={handleClearData}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dangerLabel, { color: theme.danger }]}>Effacer toutes les données</Text>
                    <Text style={styles.dangerHint}>Supprime toutes les toiles, dossiers et paramètres.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.danger} />
                </Pressable>
              </Card>

              <Pressable style={[styles.refreshBtn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }]} onPress={loadStorageInfo}>
                <MaterialCommunityIcons name="refresh" size={16} color={theme.textSecondary} />
                <Text style={[styles.refreshText, { color: theme.textSecondary }]}>Actualiser</Text>
              </Pressable>
            </View>
          )}

          {/* ─── Mises à jour ─── */}
          {activeSection === 'updates' && (
            <View style={styles.section}>
              <SectionTitle label="Application" theme={theme} />
              <Card theme={theme}>
                <View style={styles.storageRow}>
                  <MaterialCommunityIcons name="information-outline" size={20} color={theme.accent} />
                  <Text style={[styles.storageLabel, { color: theme.textPrimary }]}>Version installée</Text>
                  <Text style={[styles.storageVal, { color: theme.accent }]}>v{updates.currentVersion}</Text>
                </View>
                <Divider theme={theme} />
                <View style={styles.storageRow}>
                  <MaterialCommunityIcons name="update" size={20} color={theme.textSecondary} />
                  <Text style={[styles.storageLabel, { color: theme.textPrimary }]}>Statut</Text>
                  <Text style={[styles.storageVal, { color: theme.textSecondary }]}>{updateStatusLabel(updates)}</Text>
                </View>
                {updates.releaseNotes && updates.stage === 'available' ? (
                  <>
                    <Divider theme={theme} />
                    <Text style={styles.releaseNotes} numberOfLines={8}>
                      {updates.releaseNotes}
                    </Text>
                  </>
                ) : null}
                {updates.error ? (
                  <>
                    <Divider theme={theme} />
                    <Text style={styles.updateError}>{updates.error}</Text>
                  </>
                ) : null}
              </Card>

              <SectionTitle label="Recherche manuelle" theme={theme} />
              <Card theme={theme}>
                <Pressable
                  style={styles.langRow}
                  onPress={() => void updates.check()}
                  disabled={updates.stage === 'checking'}
                >
                  <MaterialCommunityIcons name="magnify" size={18} color={theme.accent} />
                  <Text style={[styles.langLabel, { color: theme.textPrimary }]}>
                    {updates.stage === 'checking' ? 'Vérification…' : 'Rechercher une mise à jour'}
                  </Text>
                  {updates.stage === 'checking' && <ActivityIndicator size="small" color={theme.accent} />}
                </Pressable>
                {(updates.stage === 'available' || updates.stage === 'ready') && updates.canSelfInstall ? (
                  <>
                    <Divider theme={theme} />
                    <Pressable style={styles.langRow} onPress={() => void updates.applyUpdate()}>
                      <MaterialCommunityIcons name="restart" size={18} color={theme.accent} />
                      <Text style={[styles.langLabel, { color: theme.textPrimary }]}>
                        {updates.stage === 'ready' ? 'Redémarrer et installer' : 'Installer et redémarrer'}
                      </Text>
                    </Pressable>
                  </>
                ) : updates.stage === 'available' && !updates.canSelfInstall ? (
                  <>
                    <Divider theme={theme} />
                    <Pressable
                      style={styles.langRow}
                      onPress={() => void Linking.openURL(updates.downloadUrl ?? RELEASES_URL)}
                    >
                      <MaterialCommunityIcons name="open-in-new" size={18} color={theme.accent} />
                      <Text style={[styles.langLabel, { color: theme.textPrimary }]}>Page de téléchargement</Text>
                    </Pressable>
                  </>
                ) : null}
              </Card>

              <SectionTitle label="Automatisme" theme={theme} />
              <Card theme={theme}>
                <ToggleRow
                  label="Mise à jour automatique"
                  value={updates.autoUpdate}
                  onToggle={updates.setAutoUpdate}
                  theme={theme}
                />
                <Text style={styles.hint}>
                  Télécharge les nouvelles versions en arrière-plan et les installe à la fermeture de
                  l&apos;application.
                </Text>
              </Card>
            </View>
          )}

          {/* ─── Accessibilité ─── */}
          {activeSection === 'accessibility' && (
            <View style={styles.section}>
              <SectionTitle label="Visuel" theme={theme} />
              <Card theme={theme}>
                <ToggleRow label="Contraste élevé" value={settings.highContrast ?? false} onToggle={v => updateSettings({ highContrast: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Réduire les animations" value={settings.reduceMotion ?? false} onToggle={v => updateSettings({ reduceMotion: v })} theme={theme} />
                <Divider theme={theme} />
                <ToggleRow label="Texte en gras dans l'interface" value={settings.boldUI ?? false} onToggle={v => updateSettings({ boldUI: v })} theme={theme} />
              </Card>

              <SectionTitle label="Taille du texte de l'interface" theme={theme} />
              <View style={styles.fontRow}>
                {(['small', 'medium', 'large'] as const).map(size => (
                  <Pressable key={size} style={[styles.fontBtn, (settings.uiFontSize ?? 'medium') === size && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => updateSettings({ uiFontSize: size })}>
                    <Text style={[styles.fontBtnText, (settings.uiFontSize ?? 'medium') === size && { color: '#0d0d0d' }]}>
                      {{ small: 'Petite', medium: 'Normale', large: 'Grande' }[size]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {!activeSection && (
            <View style={styles.welcomeState}>
              <MaterialCommunityIcons name="cog-outline" size={48} color={theme.textMuted} />
              <Text style={styles.welcomeTitle}>Paramètres</Text>
              <Text style={styles.welcomeDesc}>Sélectionnez une catégorie à gauche pour personnaliser PaintStudio.</Text>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>

      {/* Custom workspace bg modal */}
      <Modal visible={showCustomWsBg} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCustomWsBg(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Couleur personnalisée</Text>
            <View style={styles.hexInputRow}>
              <Text style={styles.hashPrefix}>#</Text>
              <TextInput
                style={styles.hexInput}
                value={customWsHex.replace('#', '')}
                onChangeText={setCustomWsHex}
                placeholder="1A1A1A"
                placeholderTextColor={theme.textMuted}
                maxLength={7}
                autoCapitalize="characters"
              />
              {customWsHex.length >= 6 && (
                <View style={[styles.previewDot, { backgroundColor: customWsHex.startsWith('#') ? customWsHex : `#${customWsHex}` }]} />
              )}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[styles.cancelBtn2, { backgroundColor: theme.surfaceHigh }]} onPress={() => setShowCustomWsBg(false)}>
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Annuler</Text>
              </Pressable>
              <Pressable style={[styles.applyBtn, { backgroundColor: theme.accent }]} onPress={applyCustomWs}>
                <Text style={styles.applyText}>Appliquer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ label, theme }: { label: string; theme: any }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>
      {label}
    </Text>
  );
}

function Card({ children, theme }: { children: React.ReactNode; theme: any }) {
  return (
    <View style={{ backgroundColor: theme.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.surfaceBorder, marginBottom: 4 }}>
      {children}
    </View>
  );
}

function Divider({ theme }: { theme: any }) {
  return <View style={{ height: 1, backgroundColor: theme.surfaceBorder, marginVertical: 4 }} />;
}

function ToggleRow({ label, value, onToggle, theme }: { label: string; value: boolean; onToggle: (v: boolean) => void; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text style={{ fontSize: 14, color: theme.textPrimary, fontWeight: '500', flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: '#333', true: theme.accent }} thumbColor="#fff" />
    </View>
  );
}

function updateStatusLabel(update: ReturnType<typeof useUpdates>): string {
  switch (update.stage) {
    case 'checking':
      return 'Vérification…';
    case 'available':
      return update.latestVersion ? `${update.latestVersion} disponible` : 'Mise à jour disponible';
    case 'downloading':
      return typeof update.progress === 'number' ? `Téléchargement ${update.progress}%` : 'Téléchargement…';
    case 'ready':
      return 'Prête à installer';
    case 'error':
      return 'Échec de la vérification';
    case 'up-to-date':
      return 'À jour';
    default:
      return '—';
  }
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: theme.panelBg, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
    body: { flex: 1, flexDirection: 'row' },
    navCol: { width: 160, borderRightWidth: 1, borderRightColor: theme.surfaceBorder, backgroundColor: theme.panelBg, paddingVertical: 8 },
    navItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, marginHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginBottom: 2 },
    navLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: '600', flex: 1 },
    contentCol: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    section: {},
    hint: { fontSize: 11, color: theme.textMuted, marginTop: 4, lineHeight: 16 },
    // Appearance
    themeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    themeCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    themePreview: { width: '100%', height: 32, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
    themePreviewBar: { height: 8 },
    themeLabel: { fontSize: 11, color: theme.textPrimary, fontWeight: '600' },
    themeDesc: { fontSize: 9, color: theme.textMuted, textAlign: 'center' },
    accentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    accentDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
    accentDotActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
    // Workspace
    bgRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
    bgOption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    bgLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
    currentWsBg: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 2 },
    wsBgPreview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: theme.surfaceBorder },
    wsBgHex: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
    customWsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surfaceHigh, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    customWsBtnText: { fontSize: 11, fontWeight: '700' },
    wsBgPresets: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    wsBgDot: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: theme.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
    // Tools
    segmentRow: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.surfaceBorder, marginBottom: 8 },
    segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: theme.surfaceHigh },
    segmentActive: { backgroundColor: theme.accent },
    segmentText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    cursorBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceHigh, marginRight: 6, marginBottom: 6 },
    cursorLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    pressureRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
    pressureBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    pressureText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    // Performance
    historyRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    historyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    historyText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    // Storage
    storageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    storageLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
    storageVal: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
    autoSaveRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    autoSaveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    autoSaveBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    autoSaveText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    exportRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    exportBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    exportText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    dangerLabel: { fontSize: 14, fontWeight: '600' },
    dangerHint: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginTop: 8 },
    refreshText: { fontSize: 13, fontWeight: '600' },
    // Updates
    releaseNotes: { fontSize: 12, color: theme.textSecondary, lineHeight: 18, paddingVertical: 8 },
    updateError: { fontSize: 12, color: theme.danger, paddingVertical: 8 },
    // Interface
    langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    langLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
    // Accessibility
    fontRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    fontBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceHigh },
    fontBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    // Welcome
    welcomeState: { alignItems: 'center', paddingTop: 60, gap: 12 },
    welcomeTitle: { fontSize: 20, fontWeight: '700', color: theme.textSecondary },
    welcomeDesc: { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
    modalContent: { backgroundColor: theme.surface, borderRadius: 16, padding: 24, width: 280, borderWidth: 1, borderColor: theme.surfaceBorder },
    modalTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    hexInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceHigh, borderRadius: 10, borderWidth: 1, borderColor: theme.surfaceBorder, paddingHorizontal: 12, height: 48, gap: 8, marginBottom: 16 },
    hashPrefix: { color: theme.textSecondary, fontSize: 15, fontWeight: '600' },
    hexInput: { flex: 1, color: theme.textPrimary, fontSize: 15, fontWeight: '600', fontFamily: 'monospace' },
    previewDot: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: theme.surfaceBorder },
    modalActions: { flexDirection: 'row', gap: 8 },
    cancelBtn2: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontWeight: '600' },
    applyBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    applyText: { color: '#0d0d0d', fontWeight: '700' },
  });
}
