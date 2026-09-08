// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useCanvas } from '@/hooks/useCanvas';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

interface Props {
  onExport: () => void;
}

const TopBar: React.FC<Props> = ({ onExport }) => {
  const { activeTool, activeColor, brushSize } = useCanvas();

  const toolLabels: Record<string, string> = {
    brush: 'Pinceau',
    pencil: 'Crayon',
    eraser: 'Gomme',
    fill: 'Remplir',
  };

  return (
    <View style={styles.container}>
      {/* App name */}
      <View style={styles.brandArea}>
        <MaterialCommunityIcons name="brush" size={18} color={Colors.accent} />
        <Text style={styles.appName}>PaintStudio</Text>
      </View>

      {/* Status */}
      <View style={styles.statusArea}>
        <View style={styles.statusChip}>
          <MaterialCommunityIcons name="pencil-ruler" size={12} color={Colors.textMuted} />
          <Text style={styles.statusText}>{toolLabels[activeTool]}</Text>
        </View>
        <View style={styles.statusChip}>
          <View style={[styles.colorDot, { backgroundColor: activeColor }]} />
          <Text style={styles.statusText}>{activeColor.toUpperCase()}</Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusText}>{Math.round(brushSize)}px</Text>
        </View>
      </View>

      {/* Export */}
      <Pressable
        style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.8 }]}
        onPress={onExport}
      >
        <MaterialCommunityIcons name="export" size={15} color="#0d0d0d" />
        <Text style={styles.exportText}>Exporter</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 48,
    backgroundColor: Colors.panelBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  brandArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  appName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  statusArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  exportText: {
    fontSize: FontSize.xs,
    color: '#0d0d0d',
    fontWeight: '700',
  },
});

export default React.memo(TopBar);
