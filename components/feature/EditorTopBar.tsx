// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  canvasName: string;
  isDirty: boolean;
  onBack: () => void;
  onSave: () => void;
  onExport: () => void;
}

const EditorTopBar: React.FC<Props> = ({ canvasName, isDirty, onBack, onSave, onExport }) => {
  const { activeTool, activeColor, brushSize } = useCanvas();
  const { theme } = useTheme();

  const toolLabels: Record<string, string> = {
    brush: 'Pinceau', pencil: 'Crayon', eraser: 'Gomme', fill: 'Remplir',
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.panelBg, borderBottomColor: theme.surfaceBorder }]}>
      {/* Back button */}
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        onPress={onBack}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={theme.textPrimary} />
      </Pressable>

      {/* Canvas name + dirty indicator */}
      <View style={styles.nameArea}>
        <Text style={[styles.canvasName, { color: theme.textPrimary }]} numberOfLines={1}>{canvasName}</Text>
        {isDirty && <View style={[styles.dirtyDot, { backgroundColor: theme.accentGold }]} />}
      </View>

      {/* Status chips */}
      <View style={styles.statusArea}>
        <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
          <MaterialCommunityIcons name="pencil-ruler" size={12} color={theme.textMuted} />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>{toolLabels[activeTool]}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
          <View style={[styles.colorDot, { backgroundColor: activeColor, borderColor: theme.surfaceBorder }]} />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>{activeColor.toUpperCase()}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>{Math.round(brushSize)}px</Text>
        </View>
      </View>

      {/* Export button */}
      <Pressable
        style={({ pressed }) => [styles.exportBtn, { backgroundColor: theme.surfaceHigh }, pressed && { opacity: 0.7 }]}
        onPress={onExport}
        hitSlop={4}
      >
        <MaterialCommunityIcons name="export-variant" size={15} color={theme.textSecondary} />
        <Text style={[styles.exportText, { color: theme.textSecondary }]}>Exporter</Text>
      </Pressable>

      {/* Save button */}
      <Pressable
        style={({ pressed }) => [styles.saveBtn, { backgroundColor: isDirty ? theme.accent : theme.surfaceHigh }, pressed && { opacity: 0.8 }]}
        onPress={onSave}
      >
        <MaterialCommunityIcons name="content-save" size={15} color={isDirty ? '#0d0d0d' : theme.textMuted} />
        <Text style={[styles.saveText, { color: isDirty ? '#0d0d0d' : theme.textMuted }]}>
          {isDirty ? 'Sauvegarder' : 'Sauvegardé'}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 48, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 8, borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  nameArea: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 60, maxWidth: 120,
  },
  canvasName: { fontSize: 15, fontWeight: '700' },
  dirtyDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  saveText: { fontSize: 11, fontWeight: '700' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
  },
  exportText: { fontSize: 11, fontWeight: '600' },
});

export default React.memo(EditorTopBar);
