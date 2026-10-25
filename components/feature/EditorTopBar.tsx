// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  canvasName: string;
  isDirty: boolean;
  onBack: () => void;
  /** Export isolé : ne pas passer `onExport` suffit à retirer le bouton. */
  onExport?: () => void;
  onHelp?: () => void;
  /** Fond transparent de la toile (damier) + bascule depuis la barre. */
  transparentBg?: boolean;
  onToggleTransparentBg?: () => void;
}

const EditorTopBar: React.FC<Props> = ({ canvasName, isDirty, onBack, onExport, onHelp, transparentBg, onToggleTransparentBg }) => {
  const { activeTool, activeColor, brushSize } = useCanvas();
  const { theme, settings } = useTheme();
  const { width } = useWindowDimensions();
  // En dessous, les puces d'état n'ont pas la place : avant, elles se
  // retrouvaient écrasées en « gélules » verticales vides (Android).
  const showChips = settings.showStatusBar && width >= STATUS_CHIPS_MIN_WIDTH;

  const toolLabels: Record<string, string> = {
    brush: 'Pinceau', pencil: 'Crayon', eraser: 'Gomme', fill: 'Remplir',
    lasso: 'Lasso', move: 'Déplacer',
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

      {/* Status chips — hidden when the "Barre d'état du canvas" setting is off */}
      {showChips && (
        <View style={styles.statusArea}>
          <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
            <MaterialCommunityIcons name="pencil-ruler" size={12} color={theme.textMuted} />
            <Text style={[styles.statusText, { color: theme.textSecondary }]} numberOfLines={1}>{toolLabels[activeTool]}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
            <View style={[styles.colorDot, { backgroundColor: activeColor, borderColor: theme.surfaceBorder }]} />
            <Text style={[styles.statusText, { color: theme.textSecondary }]} numberOfLines={1}>{activeColor.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: theme.surfaceHigh }]}>
            <Text style={[styles.statusText, { color: theme.textSecondary }]} numberOfLines={1}>{Math.round(brushSize)}px</Text>
          </View>
        </View>
      )}
      {!showChips && <View style={styles.statusArea} />}

      {/* Transparent-background toggle (checker) — per-canvas setting */}
      {onToggleTransparentBg && (
        <Pressable
          style={({ pressed }) => [styles.helpBtn, transparentBg
            ? { backgroundColor: theme.accent }
            : { backgroundColor: theme.surfaceHigh }, pressed && { opacity: 0.7 }]}
          onPress={onToggleTransparentBg}
          hitSlop={6}
          accessibilityLabel="Fond transparent (damier)"
        >
          <MaterialCommunityIcons
            name="checkerboard"
            size={17}
            color={transparentBg ? '#0d0d0d' : theme.textSecondary}
          />
        </Pressable>
      )}

      {/* Help / keyboard shortcuts */}
      {onHelp && (
        <Pressable
          style={({ pressed }) => [styles.helpBtn, { backgroundColor: theme.surfaceHigh }, pressed && { opacity: 0.7 }]}
          onPress={onHelp}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="help-circle-outline" size={17} color={theme.textSecondary} />
        </Pressable>
      )}

      {/* Export button (isolé, retirable en ne passant pas onExport) */}
      {onExport && (
      <Pressable
        style={({ pressed }) => [styles.exportBtn, { backgroundColor: theme.surfaceHigh }, pressed && { opacity: 0.7 }]}
        onPress={onExport}
        hitSlop={6}
      >
        <MaterialCommunityIcons name="export-variant" size={15} color={theme.textSecondary} />
        <Text style={[styles.exportText, { color: theme.textSecondary }]}>Exporter</Text>
      </Pressable>
      )}

    </View>
  );
};

/** Largeur mini (dp) pour afficher les puces outil / couleur / taille. */
export const STATUS_CHIPS_MIN_WIDTH = 640;

const styles = StyleSheet.create({
  container: {
    height: 48, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 8, borderBottomWidth: 1,
  },
  backBtn: {
    flexShrink: 0, width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  nameArea: {
    flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 60, maxWidth: 120,
  },
  canvasName: { fontSize: 15, fontWeight: '700' },
  dirtyDot: { flexShrink: 0, width: 7, height: 7, borderRadius: 3.5 },
  statusArea: { flex: 1, minWidth: 0, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusChip: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  exportBtn: {
    flexShrink: 0, height: 32, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, borderRadius: 16,
  },
  exportText: { fontSize: 11, fontWeight: '600' },
  helpBtn: {
    flexShrink: 0, width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});

export default React.memo(EditorTopBar);
