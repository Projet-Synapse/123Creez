// Powered by OnSpace.AI
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ColorPalette from './ColorPalette';
import BrushPanel from './BrushPanel';
import LayerPanel from './LayerPanel';
import AutomationPanel from './AutomationPanel';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing } from '@/constants/theme';

type PanelTab = 'color' | 'brush' | 'layers' | 'auto';

interface Props {
  showLayers: boolean;
  onCloseLayers: () => void;
  visible: boolean;
  canvasId?: string;
}

const TABS: { id: PanelTab; icon: string; label: string }[] = [
  { id: 'color', icon: 'palette', label: 'Couleur' },
  { id: 'brush', icon: 'brush', label: 'Pinceau' },
  { id: 'layers', icon: 'layers-outline', label: 'Calques' },
  { id: 'auto', icon: 'robot-outline', label: 'Auto' },
];

const RightPanel: React.FC<Props> = ({ showLayers, onCloseLayers, visible, canvasId }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<PanelTab>('color');

  React.useEffect(() => {
    if (showLayers) setActiveTab('layers');
  }, [showLayers]);

  if (!visible) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.panelBg, borderLeftColor: theme.surfaceBorder }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.surfaceBorder }]}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && [styles.tabActive, { borderBottomColor: theme.accent }]]}
              onPress={() => setActiveTab(tab.id)}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={16}
                color={isActive ? theme.accent : theme.textMuted}
              />
              <Text style={[styles.tabLabel, { color: isActive ? theme.accent : theme.textMuted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Panel content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'color' && <ColorPalette />}
        {activeTab === 'brush' && <BrushPanel />}
        {activeTab === 'layers' && <LayerPanel />}
        {activeTab === 'auto' && <AutomationPanel canvasId={canvasId} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 200,
    backgroundColor: Colors.panelBg,
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
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4ecdc4',
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
});

export default React.memo(RightPanel);
