// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Tool } from '@/contexts/CanvasContext';

interface ToolItem {
  id: Tool;
  icon: string;
  label: string;
}

const TOOLS: ToolItem[] = [
  { id: 'brush', icon: 'brush', label: 'Brosse' },
  { id: 'pencil', icon: 'pencil', label: 'Crayon' },
  { id: 'eraser', icon: 'eraser', label: 'Gomme' },
  { id: 'fill', icon: 'format-color-fill', label: 'Remplir' },
  { id: 'lasso', icon: 'lasso', label: 'Lasso' },
  { id: 'move', icon: 'cursor-move', label: 'Déplacer' },
];

interface ToolBarProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onLayersToggle: () => void;
  onPanelToggle: () => void;
  panelVisible: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const ToolBar: React.FC<ToolBarProps> = ({
  onUndo, onRedo, onClear, onLayersToggle, onPanelToggle, panelVisible, canUndo, canRedo
}) => {
  const { activeTool, setActiveTool, selection, clearSelection } = useCanvas();
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.panelBg, borderRightColor: theme.surfaceBorder }]}>
      {/* Undo / Redo */}
      <View style={styles.actionGroup}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, !canUndo && styles.disabled, pressed && styles.pressed]}
          onPress={onUndo} disabled={!canUndo} hitSlop={8}
        >
          <MaterialCommunityIcons name="undo" size={20} color={canUndo ? theme.textPrimary : theme.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, !canRedo && styles.disabled, pressed && styles.pressed]}
          onPress={onRedo} disabled={!canRedo} hitSlop={8}
        >
          <MaterialCommunityIcons name="redo" size={20} color={canRedo ? theme.textPrimary : theme.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

      {/* Tools */}
      <ScrollView style={styles.toolScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.toolGroup}>
        {TOOLS.map(tool => {
          const isActive = activeTool === tool.id;
          return (
            <Pressable
              key={tool.id}
              style={({ pressed }) => [
                styles.toolBtn,
                isActive && [styles.toolBtnActive, { backgroundColor: theme.activeGlow }],
                pressed && styles.pressed,
              ]}
              onPress={() => setActiveTool(tool.id)}
              hitSlop={4}
            >
              <MaterialCommunityIcons
                name={tool.icon as any}
                size={20}
                color={isActive ? theme.accent : theme.textSecondary}
              />
              <Text style={[styles.toolLabel, { color: isActive ? theme.accent : theme.textMuted }]}>
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

      {/* Bottom actions */}
      <View style={styles.actionGroup}>
        {/* Clear selection if active */}
        {selection && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: theme.activeGlow }, pressed && styles.pressed]}
            onPress={clearSelection} hitSlop={8}
          >
            <MaterialCommunityIcons name="selection-off" size={18} color={theme.accent} />
          </Pressable>
        )}
        {/* Toggle right panel */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, panelVisible && { backgroundColor: theme.activeGlow }, pressed && styles.pressed]}
          onPress={onPanelToggle} hitSlop={8}
        >
          <MaterialCommunityIcons
            name={panelVisible ? 'dock-right' : 'dock-right'}
            size={20}
            color={panelVisible ? theme.accent : theme.textSecondary}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={onLayersToggle} hitSlop={8}
        >
          <MaterialCommunityIcons name="layers-outline" size={20} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={onClear} hitSlop={8}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 56,
    backgroundColor: Colors.panelBg,
    borderRightWidth: 1,
    borderRightColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionGroup: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  toolScroll: {
    flex: 1,
    width: '100%',
  },
  toolGroup: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  actionBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  toolBtn: {
    width: 44, height: 46, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  toolBtnActive: { backgroundColor: Colors.activeGlow },
  toolLabel: { fontSize: 7, fontWeight: '500' },
  divider: {
    width: 32, height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: Spacing.xs,
  },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
});

export default React.memo(ToolBar);
