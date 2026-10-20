// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Dimensions, Pressable, Text, Animated as RNAnimated, Platform, Modal, ScrollView,
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
import ResizeHandle from '@/components/feature/ResizeHandle';
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
  const { theme, settings, updateSettings } = useTheme();
  const {
    history, redoStack, undo, redo, clearCanvas, loadLayers, layers, layerGroups,
    activeLayerId, isDirty, markClean, setActiveTool, setActiveColor,
    setBrushSize, fillLayer, clearLayer, brushSize, setBrushOpacity,
    brushOpacity, activeTool, activeColor, clearSelection, commitSelection,
    selection,
  } = useCanvas();
  const { loadCanvasData, persistCanvas, canvases, setCanvasTransparentBg, addCanvasDrawingTime } = useVault();
  const { runTrigger, recording } = useAutomation();

  const [showLayers, setShowLayers] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  // Largeur du panneau droit, réglable par la poignée sur son bord — la
  // valeur persiste dans les réglages au relâchement du drag.
  const [panelWidth, setPanelWidth] = useState(settings.editorPanelWidth ?? 200);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;
  // Fond transparent (damier) de CETTE toile — lu du meta au chargement.
  const [canvasTransparentBg, setCanvasTransparentBgState] = useState(false);
  // Dimensions logiques de la toile chargée → auto-ajustement du canvas.
  const [canvasContentSize, setCanvasContentSize] = useState<{ w: number; h: number } | null>(null);
  // Plein écran de dessin : masque top bar, toolbar, panneaux — la toile
  // occupe tout ; le bouton flottant plein-écran sert de va-et-vient.
  const [fullDraw, setFullDraw] = useState(false);
  // Temps de dessin : compteur seconde par seconde, flushé périodiquement.
  const drawingSecondsRef = useRef(0);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const bottomAnim = useRef(new RNAnimated.Value(0)).current;
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const lastCanvasDimsRef = useRef<{ w: number; h: number } | null>(null);
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;

  const RIGHTPANEL_WIDTH = panelVisible ? panelWidth : 0;
  const resizePanel = useCallback((delta: number) => {
    setPanelWidth(Math.min(420, Math.max(150, panelWidthRef.current + delta)));
  }, []);
  const commitPanelWidth = useCallback(() => {
    updateSettings({ editorPanelWidth: panelWidthRef.current });
  }, [updateSettings]);

  // Bascule du fond transparent (damier) — le meta est persisté immédiatement
  // (pas besoin de passer par la sauvegarde de la toile).
  const toggleTransparentBg = useCallback(() => {
    if (!id) return;
    const next = !canvasTransparentBg;
    setCanvasTransparentBgState(next);
    setCanvasTransparentBg(id, next);
  }, [id, canvasTransparentBg, setCanvasTransparentBg]);
  const canvasWidth = SCREEN_WIDTH - TOOLBAR_WIDTH - RIGHTPANEL_WIDTH;
  const canvasHeight = SCREEN_HEIGHT - insets.top - insets.bottom
    - (fullDraw ? 0 : TOPBAR_HEIGHT) - (fullDraw ? 0 : BOTTOM_PANEL_HEIGHT);
  // Honor the "Position de la barre d'outils" setting — the bar docks to the
  // chosen side of the workspace.
  const toolbarRight = settings.toolbarPosition === 'right';

  const toggleBottom = useCallback(() => {
    const toValue = bottomExpanded ? 0 : 1;
    RNAnimated.timing(bottomAnim, { toValue, duration: 200, useNativeDriver: false }).start();
    setBottomExpanded(v => !v);
  }, [bottomExpanded, bottomAnim]);

  // Load canvas on mount
  useEffect(() => {
    if (!id) return;
    loadCanvasData(id).then(async data => {
      if (data) {
        loadLayers(data.meta.id, data.layers, data.activeLayerId, data.groups);
        setCanvasTransparentBgState(data.meta.transparentBg === true);
        // Toile plus grande que la zone (mobile) : on l'ajuste d'emblée,
        // sinon une partie reste hors champ sans geste pour l'atteindre.
        setCanvasContentSize({ w: data.meta.width, h: data.meta.height });
        lastCanvasDimsRef.current = { w: data.meta.width, h: data.meta.height };
      }
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
    if (!id) return;
    // A floating lasso move isn't in the stroke data yet — bake it in first
    // so what gets persisted matches what's on screen.
    const committed = commitSelection();
    if (!isDirty && !committed) return;
    await persistCanvas(id, committed ?? layers, activeLayerId, layerGroups);
    markClean();
  }, [id, isDirty, layers, activeLayerId, persistCanvas, markClean, commitSelection]);

  // Temps de dessin : +1 s/seconde (l'écran ouvert = on œuvre), flush au
  // vault toutes les 30 s et au démontage.
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      drawingSecondsRef.current += 1;
      if (drawingSecondsRef.current >= 30) {
        addCanvasDrawingTime(id, drawingSecondsRef.current);
        drawingSecondsRef.current = 0;
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      if (drawingSecondsRef.current > 0) addCanvasDrawingTime(id, drawingSecondsRef.current);
    };
  }, [id, addCanvasDrawingTime]);

  useEffect(() => {
    const interval = settings.autoSaveInterval;
    if (interval <= 0) return;
    autoSaveRef.current = setInterval(save, interval * 1000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [save, settings.autoSaveInterval]);

  // Data-loss guard on web: closing the tab or navigating away with unsaved
  // changes fires a last-chance save instead of silently dropping work.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const persistNow = () => { saveRef.current(); };
    const handleUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      persistNow();
      // Classic prompt so the user can cancel a close with pending work.
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', persistNow);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', persistNow);
    };
  }, [isDirty]);

  const handleBack = useCallback(async () => {
    await save();
    router.back();
  }, [save, router]);

  const handleSave = useCallback(async () => {
    const committed = commitSelection();
    await persistCanvas(id!, committed ?? layers, activeLayerId, layerGroups);
    markClean();
    showAlert('Sauvegardé', 'La toile a été enregistrée dans le vault.');
  }, [id, layers, activeLayerId, persistCanvas, markClean, showAlert, commitSelection]);

  const handleClear = useCallback(() => {
    showAlert('Effacer le canvas', 'Voulez-vous effacer tous les calques ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: clearCanvas },
    ]);
  }, [showAlert, clearCanvas]);

  const canvasName = canvases.find(c => c.id === id)?.name ?? 'Toile';

  const handleExport = useCallback(async () => {
    // The export format setting drives the capture: JPEG for compressed
    // exports, PNG (lossless) otherwise.
    const format = settings.defaultExportFormat === 'JPEG' ? 'jpg' : 'png';
    const uri = await canvasRef.current?.capture(format);
    if (!uri) {
      showAlert('Export impossible', "La toile n'a pas pu être capturée. Réessayez.");
      return;
    }
    const fileName = `${canvasName.replace(/[^a-z0-9_-]+/gi, '_') || 'toile'}.${format === 'jpg' ? 'jpg' : 'png'}`;
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
        await Sharing.shareAsync(uri, {
          mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
          dialogTitle: canvasName,
        });
      } else {
        showAlert('Export terminé', 'Le partage n\'est pas disponible sur cet appareil.');
      }
    } catch {
      showAlert('Erreur d\'export', "Une erreur est survenue lors de l'export de l'image.");
    }
  }, [canvasName, showAlert, settings.defaultExportFormat]);

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
      // Zoom: mirrors the Ctrl/Cmd +/-/0 convention used by browsers and
      // most design tools, so mouse+keyboard users aren't limited to pinch.
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        canvasRef.current?.zoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        canvasRef.current?.zoomOut();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        canvasRef.current?.resetZoom();
        return;
      }
      if (!mod && e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (!mod && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }
      if (!mod && !e.altKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        const delta = e.key === ']' ? 2 : -2;
        setBrushSize(Math.max(1, Math.min(80, brushSizeRef.current + delta)));
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
  }, [undo, redo, handleSave, handleExport, setActiveTool, clearSelection, setBrushSize]);

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

      {!fullDraw && (
        <EditorTopBar
          canvasName={canvasName}
          isDirty={isDirty}
          onBack={handleBack}
          onSave={handleSave}
          onExport={handleExport}
          onHelp={() => setShowShortcuts(true)}
          transparentBg={canvasTransparentBg}
          onToggleTransparentBg={toggleTransparentBg}
        />
      )}

      <View style={styles.workspace}>
        {!fullDraw && !toolbarRight && (
          <ToolBar
            onUndo={undo}
            onRedo={redo}
            onClear={handleClear}
            onLayersToggle={() => setShowLayers(v => !v)}
            onPanelToggle={() => setPanelVisible(v => !v)}
            panelVisible={panelVisible}
            canUndo={history.length > 0 || !!selection}
            canRedo={redoStack.length > 0}
            position="left"
          popupMode={settings.toolbarMode ?? 'bar'}
          />
        )}

        <View style={styles.centerColumn}>
          {/* Canvas area */}
          <View style={[styles.canvasWrapper, {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: workspaceBg,
          }]}>
            <View style={styles.canvasContainer}>
              <DrawingCanvas ref={canvasRef} width={canvasWidth} height={canvasHeight} onZoomChange={setZoomPct} transparentBg={canvasTransparentBg} contentSize={canvasContentSize ? { width: canvasContentSize.w, height: canvasContentSize.h } : undefined} />
            </View>

            {/* Zoom controls — the only way to zoom for mouse/trackpad users,
                who have no pinch gesture (touch users already have pinch). */}
            <View style={[styles.zoomControls, { backgroundColor: theme.panelBg, borderColor: theme.surfaceBorder }]}>
              <Pressable
                style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.6 }]}
                onPress={() => canvasRef.current?.zoomOut()}
                hitSlop={6}
              >
                <MaterialCommunityIcons name="minus" size={16} color={theme.textSecondary} />
              </Pressable>
              <Pressable onPress={() => canvasRef.current?.resetZoom()} hitSlop={6}>
                <Text style={[styles.zoomText, { color: theme.textSecondary }]}>{zoomPct}%</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.6 }]}
                onPress={() => canvasRef.current?.zoomIn()}
                hitSlop={6}
              >
                <MaterialCommunityIcons name="plus" size={16} color={theme.textSecondary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  // Ajuster : la toile entière dans la zone (après un repli
                  // de panneau, un zoom hasardeux, ou au retour au 100 %).
                  const d = lastCanvasDimsRef.current;
                  if (d) canvasRef.current?.fitToContent(d.w, d.h);
                }}
                hitSlop={6}
                accessibilityLabel="Ajuster la toile à la vue"
              >
                <MaterialCommunityIcons name="fit-to-page" size={15} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Bottom brush panel (masqué en plein écran) */}
          {!fullDraw && <RNAnimated.View style={[styles.bottomPanel, {
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

              {/* Stabilisateur inline — lisse le tracé au doigt */}
              <View style={styles.sliderBlock}>
                <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>Stabil.</Text>
                <View style={styles.sliderRow}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    step={5}
                    value={settings.strokeStabilizer ?? 0}
                    onSlidingComplete={v => updateSettings({ strokeStabilizer: Math.round(v) })}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.surfaceBorder}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={[styles.sliderVal, { color: theme.textSecondary }]}>{settings.strokeStabilizer ?? 0}%</Text>
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

                {activeTool === 'shape' && (
                  <>
                    <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.sm }]}>Forme</Text>
                    <View style={styles.presetRow}>
                      {(['line', 'rect', 'ellipse'] as const).map(kind => (
                        <Pressable
                          key={kind}
                          style={[
                            styles.presetBtn,
                            { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder },
                            (settings.shapeKind ?? 'line') === kind && { backgroundColor: theme.activeGlow, borderColor: theme.accent },
                          ]}
                          onPress={() => updateSettings({ shapeKind: kind })}
                        >
                          <MaterialCommunityIcons
                            name={kind === 'line' ? 'minus' : kind === 'rect' ? 'rectangle-outline' : 'circle-outline'}
                            size={20}
                            color={(settings.shapeKind ?? 'line') === kind ? theme.accent : theme.textMuted}
                          />
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

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
          </RNAnimated.View>}
        </View>

        {panelVisible && (
          <ResizeHandle
            panelSide="left"
            onResize={resizePanel}
            onResizeEnd={commitPanelWidth}
            borderColor={theme.surfaceBorder}
            activeColor={theme.accent}
          />
        )}

        <RightPanel
          showLayers={showLayers}
          onCloseLayers={() => setShowLayers(false)}
          visible={panelVisible}
          canvasId={id}
          width={panelWidth}
        />

        {/* Plein écran de dessin : masque barres et panneaux d'un tap. */}
        <Pressable
          style={({ pressed }) => [styles.fullscreenBtn, {
            right: panelVisible && !fullDraw ? panelWidth + 12 : 12,
            backgroundColor: theme.panelBg,
            borderColor: theme.surfaceBorder,
          }, pressed && { opacity: 0.7 }]}
          onPress={() => setFullDraw(v => !v)}
          hitSlop={4}
          accessibilityLabel="Plein écran de dessin"
        >
          <MaterialCommunityIcons
            name={fullDraw ? 'fullscreen-exit' : 'fullscreen'}
            size={20}
            color={fullDraw ? theme.accent : theme.textSecondary}
          />
        </Pressable>

        {/* Replier/déplier le panneau depuis la zone de dessin — accessible
            sans viser la barre d'outils quand on dessine. */}
        <Pressable
          style={({ pressed }) => [styles.panelFloatBtn, {
            right: panelVisible ? panelWidth + 12 : 12,
            backgroundColor: theme.panelBg,
            borderColor: theme.surfaceBorder,
          }, pressed && { opacity: 0.7 }]}
          onPress={() => setPanelVisible(v => !v)}
          hitSlop={4}
          accessibilityLabel={panelVisible ? 'Replier le panneau' : 'Déplier le panneau'}
        >
          <MaterialCommunityIcons
            name={panelVisible ? 'arrow-collapse-right' : 'dock-right'}
            size={20}
            color={theme.textSecondary}
          />
        </Pressable>

        {toolbarRight && !fullDraw && (
          <ToolBar
            onUndo={undo}
            onRedo={redo}
            onClear={handleClear}
            onLayersToggle={() => setShowLayers(v => !v)}
            onPanelToggle={() => setPanelVisible(v => !v)}
            panelVisible={panelVisible}
            canUndo={history.length > 0 || !!selection}
            canRedo={redoStack.length > 0}
            position="right"
          popupMode={settings.toolbarMode ?? 'bar'}
          />
        )}
      </View>

      {/* Recording indicator */}
      {recording && (
        <View style={styles.recBadge}>
          <View style={styles.recDot} />
        </View>
      )}

      {/* Keyboard shortcuts cheat sheet — the shortcuts already existed but
          had no in-app discovery path other than trial and error. */}
      <Modal visible={showShortcuts} transparent animationType="fade" onRequestClose={() => setShowShortcuts(false)}>
        <Pressable style={styles.shortcutsOverlay} onPress={() => setShowShortcuts(false)}>
          <View
            style={[styles.shortcutsSheet, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.shortcutsHeader}>
              <Text style={[styles.shortcutsTitle, { color: theme.textPrimary }]}>Raccourcis clavier</Text>
              <Pressable onPress={() => setShowShortcuts(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {[
                { keys: 'B / P / E / G / L / V', label: 'Pinceau / Crayon / Gomme / Remplir / Lasso / Déplacer' },
                { keys: 'Ctrl/Cmd + Z', label: 'Annuler' },
                { keys: 'Ctrl/Cmd + Maj + Z', label: 'Rétablir' },
                { keys: 'Ctrl/Cmd + Y', label: 'Rétablir (alternatif)' },
                { keys: 'Ctrl/Cmd + S', label: 'Sauvegarder' },
                { keys: 'Ctrl/Cmd + E', label: 'Exporter' },
                { keys: 'Ctrl/Cmd + +/-', label: 'Zoom avant / arrière' },
                { keys: 'Ctrl/Cmd + 0', label: 'Réinitialiser le zoom' },
                { keys: '[ / ]', label: 'Réduire / agrandir la taille du pinceau' },
                { keys: 'Échap', label: 'Annuler la sélection' },
                { keys: '?', label: 'Afficher ce menu' },
              ].map(item => (
                <View key={item.keys} style={[styles.shortcutRow, { borderBottomColor: theme.surfaceBorder }]}>
                  <View style={[styles.shortcutKeys, { backgroundColor: theme.surfaceHigh }]}>
                    <Text style={[styles.shortcutKeysText, { color: theme.textPrimary }]}>{item.keys}</Text>
                  </View>
                  <Text style={[styles.shortcutLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  fullscreenBtn: {
    position: 'absolute',
    top: 8,
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 30,
  },
  panelFloatBtn: {
    position: 'absolute',
    bottom: BOTTOM_PANEL_HEIGHT + 72,
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 30,
  },
  zoomControls: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1,
  },
  zoomBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace', minWidth: 40, textAlign: 'center' },
  // Shortcuts modal
  shortcutsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  shortcutsSheet: { width: 380, maxWidth: '90%', borderRadius: 18, borderWidth: 1, padding: 20 },
  shortcutsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  shortcutsTitle: { fontSize: 17, fontWeight: '700' },
  shortcutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  shortcutKeys: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 130 },
  shortcutKeysText: { fontSize: 11, fontWeight: '700', fontFamily: 'monospace', textAlign: 'center' },
  shortcutLabel: { fontSize: 12, flex: 1 },
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
