// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Dimensions, Pressable, Text, Animated as RNAnimated, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Sharing from 'expo-sharing';
import { useAlert } from '@/template';
import { useCanvas } from '@/hooks/useCanvas';
import { useVault } from '@/hooks/useVault';
import { useTheme } from '@/hooks/useTheme';
import { useAutomation } from '@/hooks/useAutomation';
import DrawingCanvas, { DrawingCanvasHandle } from '@/components/feature/DrawingCanvas';
import ToolBar from '@/components/feature/ToolBar';
import RightPanel from '@/components/feature/RightPanel';
import EditorTopBar from '@/components/feature/EditorTopBar';
import { Tool } from '@/contexts/CanvasContext';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TOPBAR_HEIGHT = 48;
const TOOLBAR_WIDTH = 56;
const BOTTOM_PANEL_HEIGHT = 80;

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();
  const { theme, settings } = useTheme();
  const {
    history, redoStack, undo, redo, clearCanvas, loadLayers, layers,
    activeLayerId, isDirty, markClean, setActiveTool, setActiveColor,
    setBrushSize, fillLayer, clearLayer, brushSize, setBrushOpacity,
    brushOpacity, activeTool, activeColor,
  } = useCanvas();
  const { loadCanvasData, persistCanvas, canvases } = useVault();
  const { runTrigger, recording } = useAutomation();

  const [showLayers, setShowLayers] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const bottomAnim = useRef(new RNAnimated.Value(0)).current;
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const RIGHTPANEL_WIDTH = panelVisible ? 200 : 0;
  const canvasWidth = SCREEN_WIDTH - TOOLBAR_WIDTH - RIGHTPANEL_WIDTH;
  const canvasHeight = SCREEN_HEIGHT - insets.top - insets.bottom - TOPBAR_HEIGHT - BOTTOM_PANEL_HEIGHT;

  const toggleBottom = useCallback(() => {
    const toValue = bottomExpanded ? 0 : 1;
    RNAnimated.timing(bottomAnim, { toValue, duration: 200, useNativeDriver: false }).start();
    setBottomExpanded(v => !v);
  }, [bottomExpanded, bottomAnim]);

  // Load canvas on mount
  useEffect(() => {
    if (!id) return;
    loadCanvasData(id).then(async data => {
      if (data) loadLayers(data.meta.id, data.layers, data.activeLayerId);
      setCanvasLoaded(true);
      runTrigger('on_open', {
        setTool: (t) => setActiveTool(t as Tool),
        setColor: setActiveColor,
        setBrushSize,
        fillLayer,
        clearLayer,
        replayStrokes: () => {},
        activeLayerId: data?.activeLayerId ?? 'layer-1',
      });
    });
  }, [id]);

  // Auto-save
  const save = useCallback(async () => {
    if (!id || !isDirty) return;
    await persistCanvas(id, layers, activeLayerId);
    markClean();
  }, [id, isDirty, layers, activeLayerId, persistCanvas, markClean]);

  useEffect(() => {
    const interval = settings.autoSaveInterval;
    if (interval <= 0) return;
    autoSaveRef.current = setInterval(save, interval * 1000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [save, settings.autoSaveInterval]);

  const handleBack = useCallback(async () => {
    await save();
    router.back();
  }, [save, router]);

  const handleSave = useCallback(async () => {
    await persistCanvas(id!, layers, activeLayerId);
    markClean();
    showAlert('Sauvegardé', 'La toile a été enregistrée dans le vault.');
  }, [id, layers, activeLayerId, persistCanvas, markClean, showAlert]);

  const handleClear = useCallback(() => {
    showAlert('Effacer le canvas', 'Voulez-vous effacer tous les calques ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: clearCanvas },
    ]);
  }, [showAlert, clearCanvas]);

  const canvasName = canvases.find(c => c.id === id)?.name ?? 'Toile';

  const handleExport = useCallback(async () => {
    const uri = await canvasRef.current?.capture();
    if (!uri) {
      showAlert('Export impossible', "La toile n'a pas pu être capturée. Réessayez.");
      return;
    }
    const fileName = `${canvasName.replace(/[^a-z0-9_-]+/gi, '_') || 'toile'}.png`;
    try {
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: canvasName });
      } else {
        showAlert('Export terminé', 'Le partage n\'est pas disponible sur cet appareil.');
      }
    } catch {
      showAlert('Erreur d\'export', "Une erreur est survenue lors de l'export de l'image.");
    }
  }, [canvasName, showAlert]);

  // ─── Keyboard shortcuts (web/desktop) ──────────────────────────────
  // Speeds up common actions for mouse+keyboard users: undo/redo/save
  // plus single-key tool switching, mirroring conventions from other
  // drawing apps (Photoshop, Procreate for web, Figma, ...).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const TOOL_KEYS: Record<string, Tool> = {
      b: 'brush', p: 'pencil', e: 'eraser', g: 'fill', l: 'lasso', v: 'move',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleExport();
        return;
      }
      if (!mod && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          setActiveTool(tool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSave, handleExport, setActiveTool]);

  // Workspace background color (around the canvas)
  const workspaceBg = settings.workspaceBgColor ?? theme.surfaceHigh;

  // Bottom panel expanded height
  const expandedBottomHeight = bottomAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [BOTTOM_PANEL_HEIGHT, 180],
  });

  const displayColor = activeTool === 'eraser' ? '#ffffff' : activeColor;
  const previewSize = Math.min(brushSize, 40);

  if (!canvasLoaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.bg }]}>
      <StatusBar style={theme.statusBarStyle} />

      <EditorTopBar
        canvasName={canvasName}
        isDirty={isDirty}
        onBack={handleBack}
        onSave={handleSave}
        onExport={handleExport}
      />

      <View style={styles.workspace}>
        <ToolBar
          onUndo={undo}
          onRedo={redo}
          onClear={handleClear}
          onLayersToggle={() => setShowLayers(v => !v)}
          onPanelToggle={() => setPanelVisible(v => !v)}
          panelVisible={panelVisible}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
        />

        <View style={styles.centerColumn}>
          {/* Canvas area */}
          <View style={[styles.canvasWrapper, {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: workspaceBg,
          }]}>
            <View style={styles.canvasContainer}>
              <DrawingCanvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
            </View>
          </View>

          {/* Bottom brush panel */}
          <RNAnimated.View style={[styles.bottomPanel, {
            height: expandedBottomHeight,
            backgroundColor: theme.panelBg,
            borderTopColor: theme.surfaceBorder,
          }]}>
            {/* Compact row always visible */}
            <View style={styles.bottomCompact}>
              {/* Brush preview dot */}
              <View style={[styles.brushPreview, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }]}>
                <View style={{
                  width: previewSize, height: previewSize,
                  borderRadius: previewSize / 2,
                  backgroundColor: displayColor,
                  opacity: brushOpacity,
                }} />
              </View>

              {/* Size slider inline */}
              <View style={styles.sliderBlock}>
                <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>Taille</Text>
                <View style={styles.sliderRow}>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={80}
                    value={brushSize}
                    onValueChange={setBrushSize}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.surfaceBorder}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={[styles.sliderVal, { color: theme.textSecondary }]}>{Math.round(brushSize)}px</Text>
                </View>
              </View>

              {/* Opacity slider inline */}
              <View style={styles.sliderBlock}>
                <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>Opacité</Text>
                <View style={styles.sliderRow}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0.05}
                    maximumValue={1}
                    value={brushOpacity}
                    onValueChange={setBrushOpacity}
                    minimumTrackTintColor={theme.accentGold}
                    maximumTrackTintColor={theme.surfaceBorder}
                    thumbTintColor={theme.accentGold}
                  />
                  <Text style={[styles.sliderVal, { color: theme.textSecondary }]}>{Math.round(brushOpacity * 100)}%</Text>
                </View>
              </View>

              {/* Expand toggle */}
              <Pressable
                style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.6 }]}
                onPress={toggleBottom}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name={bottomExpanded ? 'chevron-down' : 'chevron-up'}
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>

            {/* Expanded: preset sizes */}
            {bottomExpanded && (
              <View style={styles.bottomExpanded}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Tailles rapides</Text>
                <View style={styles.presetRow}>
                  {[2, 5, 10, 20, 40, 60, 80].map(size => (
                    <Pressable
                      key={size}
                      style={[
                        styles.presetBtn,
                        { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder },
                        Math.round(brushSize) === size && { backgroundColor: theme.activeGlow, borderColor: theme.accent },
                      ]}
                      onPress={() => setBrushSize(size)}
                    >
                      <View style={{
                        width: Math.min(size, 20) + 4, height: Math.min(size, 20) + 4,
                        borderRadius: (Math.min(size, 20) + 4) / 2,
                        backgroundColor: Math.round(brushSize) === size ? theme.accent : theme.textSecondary,
                      }} />
                      <Text style={[styles.presetLabel, { color: theme.textMuted }]}>{size}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.sm }]}>Opacités rapides</Text>
                <View style={styles.presetRow}>
                  {[0.1, 0.25, 0.5, 0.75, 1.0].map(op => (
                    <Pressable
                      key={op}
                      style={[
                        styles.opBtn,
                        { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder },
                        Math.abs(brushOpacity - op) < 0.03 && { backgroundColor: theme.activeGlow, borderColor: theme.accentGold },
                      ]}
                      onPress={() => setBrushOpacity(op)}
                    >
                      <Text style={[styles.opLabel, {
                        color: Math.abs(brushOpacity - op) < 0.03 ? theme.accentGold : theme.textSecondary,
                      }]}>{Math.round(op * 100)}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </RNAnimated.View>
        </View>

        <RightPanel
          showLayers={showLayers}
          onCloseLayers={() => setShowLayers(false)}
          visible={panelVisible}
          canvasId={id}
        />
      </View>

      {/* Recording indicator */}
      {recording && (
        <View style={styles.recBadge}>
          <View style={styles.recDot} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  workspace: { flex: 1, flexDirection: 'row' },
  centerColumn: { flex: 1, flexDirection: 'column' },
  canvasWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvasContainer: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  // Bottom brush panel
  bottomPanel: {
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  bottomCompact: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  brushPreview: {
    width: 44, height: 44, borderRadius: Radius.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sliderBlock: {
    flex: 1,
    gap: 1,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slider: { flex: 1, height: 32 },
  sliderLabel: {
    fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sliderVal: {
    fontSize: FontSize.xs, fontWeight: '600', fontFamily: 'monospace',
    width: 36, textAlign: 'right', flexShrink: 0,
  },
  expandBtn: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bottomExpanded: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row', gap: 6, flexWrap: 'wrap',
  },
  presetBtn: {
    width: 40, height: 44, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, gap: 2,
  },
  presetLabel: { fontSize: 9, fontWeight: '500' },
  opBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1,
  },
  opLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  recBadge: {
    position: 'absolute', top: 60, left: 64,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#ff0000', borderWidth: 2, borderColor: '#fff',
  },
  recDot: { flex: 1 },
});
