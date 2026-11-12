// Powered by OnSpace.AI
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ColorPalette from './ColorPalette';
import BrushPanel from './BrushPanel';
import AutomationPanel from './AutomationPanel';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing } from '@/constants/theme';
import { editorChromeBg } from '@/services/editorChrome';

type PanelTab = 'color' | 'brush' | 'auto';
type TabId = PanelTab | 'layers';

interface Props {
  /** Onglet « Calques » : ouvre le panneau FLOTTANT au-dessus de la toile
      (l'éditeur replie ce panneau latéral pour ne pas réduire la toile). */
  onOpenLayers: () => void;
  visible: boolean;
  canvasId?: string;
  /** Largeur du panneau (px) — réglable depuis l'éditeur via ResizeHandle. */
  width?: number;
}

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'color', icon: 'palette', label: 'Couleur' },
  { id: 'brush', icon: 'brush', label: 'Pinceau' },
  { id: 'layers', icon: 'layers-outline', label: 'Calques' },
  { id: 'auto', icon: 'robot-outline', label: 'Auto' },
];

const RightPanel: React.FC<Props> = ({ onOpenLayers, visible, canvasId, width = 200 }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<PanelTab>('color');

  if (!visible) return null;

  return (
    <View style={[styles.container, { backgroundColor: editorChromeBg(theme.panelBg), borderLeftColor: theme.surfaceBorder, width }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.surfaceBorder }]}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && [styles.tabActive, { borderBottomColor: theme.accent }]]}
              onPress={() => {
                if (tab.id === 'layers') onOpenLayers();
                else setActiveTab(tab.id);
              }}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={15}
                color={isActive ? theme.accent : theme.textMuted}
              />
              <Text
                style={[styles.tabLabel, { color: isActive ? theme.accent : theme.textMuted }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Panel content */}
      {/* Barre de défilement visible (bureau) et persistante (Android) quand
          le contenu dépasse — les panneaux internes ne défilent plus seuls. */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator
        persistentScrollbar
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'color' && <ColorPalette />}
        {activeTab === 'brush' && <BrushPanel />}
        {activeTab === 'auto' && <AutomationPanel canvasId={canvasId} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Panneau compact posé au-dessus de la toile : fond translucide donné
  // par l'éditeur (editorChromeBg), largeur via la prop `width`.
  container: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.surfaceBorder,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 4,
    paddingHorizontal: 1,
    gap: 1,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4ecdc4',
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 7.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: Spacing.md,
  },
});

export default React.memo(RightPanel);
