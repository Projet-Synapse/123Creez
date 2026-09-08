// Powered by OnSpace.AI
import React, { useState, useCallback, useRef } from 'react';
import {
  View, StyleSheet, Pressable, Text, ScrollView, TextInput,
  Modal, FlatList, TouchableOpacity, PanResponder,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useCanvas } from '@/hooks/useCanvas';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

// ─── Color data ───────────────────────────────────────────────────────────────
const BASE_PALETTE = [
  '#000000', '#1a1a2e', '#16213e', '#0f3460',
  '#533483', '#e94560', '#ff6b6b', '#ffd700',
  '#ff8800', '#6bcb77', '#4ecdc4', '#45b7d1',
  '#ffffff', '#e0e0e0', '#9e9e9e', '#616161',
  '#ff5252', '#ff4081', '#e040fb', '#7c4dff',
  '#448aff', '#00b0ff', '#1de9b6', '#76ff03',
  '#ffff00', '#ffd740', '#ff6d00', '#dd2c00',
  '#795548', '#607d8b', '#f48fb1', '#80cbc4',
];

// ─── HSV / hex utilities ─────────────────────────────────────────────────────
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

// ─── Color Wheel component ────────────────────────────────────────────────────
const WHEEL_SIZE = 160;
const WHEEL_R = WHEEL_SIZE / 2;

function ColorWheel({ hue, saturation, onHSChange }: {
  hue: number;
  saturation: number;
  onHSChange: (h: number, s: number) => void;
}) {
  const wheelRef = useRef<View>(null);
  const containerRef = useRef<{ x: number; y: number } | null>(null);

  const computeHS = useCallback((px: number, py: number) => {
    const dx = px - WHEEL_R;
    const dy = py - WHEEL_R;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const s = Math.min(dist / WHEEL_R, 1);
    let h = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (h < 0) h += 360;
    onHSChange(h, s);
  }, [onHSChange]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      computeHS(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt) => {
      computeHS(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
  })).current;

  // Build hue ring segments
  const segments = 60;
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < segments; i++) {
    const angle1 = (i / segments) * 2 * Math.PI;
    const angle2 = ((i + 1) / segments) * 2 * Math.PI;
    const x1o = WHEEL_R + WHEEL_R * Math.cos(angle1);
    const y1o = WHEEL_R + WHEEL_R * Math.sin(angle1);
    const x2o = WHEEL_R + WHEEL_R * Math.cos(angle2);
    const y2o = WHEEL_R + WHEEL_R * Math.sin(angle2);
    const x1i = WHEEL_R + (WHEEL_R - 18) * Math.cos(angle1);
    const y1i = WHEEL_R + (WHEEL_R - 18) * Math.sin(angle1);
    const x2i = WHEEL_R + (WHEEL_R - 18) * Math.cos(angle2);
    const y2i = WHEEL_R + (WHEEL_R - 18) * Math.sin(angle2);
    const h = (i / segments) * 360;
    const color = hsvToHex(h, 1, 1);
    paths.push(
      <Path
        key={i}
        d={`M ${x1o} ${y1o} A ${WHEEL_R} ${WHEEL_R} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${WHEEL_R - 18} ${WHEEL_R - 18} 0 0 0 ${x1i} ${y1i} Z`}
        fill={color}
      />
    );
  }

  // Saturation gradient inside ring — simplified: just show the inner disc
  const thumbX = WHEEL_R + (saturation * (WHEEL_R - 20)) * Math.cos((hue * Math.PI) / 180);
  const thumbY = WHEEL_R + (saturation * (WHEEL_R - 20)) * Math.sin((hue * Math.PI) / 180);

  return (
    <View style={styles.wheelContainer} {...panResponder.panHandlers}>
      <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
        {/* Hue ring */}
        {paths}
        {/* Inner saturation disc */}
        <Circle cx={WHEEL_R} cy={WHEEL_R} r={WHEEL_R - 20} fill="white" />
        <Circle cx={WHEEL_R} cy={WHEEL_R} r={WHEEL_R - 20}
          fill={hsvToHex(hue, 1, 1)} opacity={saturation} />
        {/* Thumb */}
        <Circle cx={thumbX} cy={thumbY} r={6} fill={hsvToHex(hue, saturation, 1)}
          stroke="white" strokeWidth={2} />
      </Svg>
    </View>
  );
}

// ─── Custom palette storage ───────────────────────────────────────────────────
interface CustomPalette {
  id: string;
  name: string;
  colors: string[];
}

// ─── Main ColorPalette component ─────────────────────────────────────────────
const ColorPalette: React.FC = () => {
  const { activeColor, setActiveColor } = useCanvas();
  const [tab, setTab] = useState<'palette' | 'wheel' | 'custom'>('palette');
  const [showHexModal, setShowHexModal] = useState(false);
  const [customHex, setCustomHex] = useState('');
  const [recentColors, setRecentColors] = useState<string[]>([]);

  // Wheel state
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(activeColor));

  // Custom palettes
  const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
  const [editingPalette, setEditingPalette] = useState<CustomPalette | null>(null);
  const [newPaletteName, setNewPaletteName] = useState('');
  const [showNewPaletteModal, setShowNewPaletteModal] = useState(false);

  const selectColor = useCallback((color: string) => {
    setActiveColor(color);
    try {
      setHsv(hexToHsv(color));
    } catch {}
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== color);
      return [color, ...filtered].slice(0, 8);
    });
  }, [setActiveColor]);

  // Color wheel changes
  const handleWheelHS = useCallback((h: number, s: number) => {
    const newColor = hsvToHex(h, s, hsv[2]);
    setHsv([h, s, hsv[2]]);
    selectColor(newColor);
  }, [hsv, selectColor]);

  const handleValueChange = useCallback((v: number) => {
    const newColor = hsvToHex(hsv[0], hsv[1], v);
    setHsv([hsv[0], hsv[1], v]);
    selectColor(newColor);
  }, [hsv, selectColor]);

  const applyCustom = () => {
    const hex = customHex.startsWith('#') ? customHex : `#${customHex}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      selectColor(hex);
      setShowHexModal(false);
      setCustomHex('');
    }
  };

  const createPalette = () => {
    if (!newPaletteName.trim()) return;
    const p: CustomPalette = {
      id: `pal-${Date.now()}`,
      name: newPaletteName.trim(),
      colors: [activeColor],
    };
    setCustomPalettes(prev => [...prev, p]);
    setShowNewPaletteModal(false);
    setNewPaletteName('');
  };

  const addColorToPalette = (paletteId: string) => {
    setCustomPalettes(prev => prev.map(p =>
      p.id === paletteId && !p.colors.includes(activeColor)
        ? { ...p, colors: [...p.colors, activeColor] }
        : p
    ));
  };

  const removeColorFromPalette = (paletteId: string, color: string) => {
    setCustomPalettes(prev => prev.map(p =>
      p.id === paletteId ? { ...p, colors: p.colors.filter(c => c !== color) } : p
    ));
  };

  const deletePalette = (id: string) => {
    setCustomPalettes(prev => prev.filter(p => p.id !== id));
    if (editingPalette?.id === id) setEditingPalette(null);
  };

  const brightness = hsv[2];

  return (
    <View style={styles.container}>
      {/* Active color row */}
      <View style={styles.activeRow}>
        <View style={[styles.activeColor, { backgroundColor: activeColor }]} />
        <Text style={styles.hexText}>{activeColor.toUpperCase()}</Text>
        <Pressable
          style={({ pressed }) => [styles.hexBtn, pressed && { opacity: 0.7 }]}
          onPress={() => setShowHexModal(true)}
        >
          <MaterialCommunityIcons name="eyedropper" size={14} color={Colors.accent} />
          <Text style={styles.hexBtnText}>HEX</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['palette', 'wheel', 'custom'] as const).map(t => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'palette' ? 'Palette' : t === 'wheel' ? 'Roue' : 'Mes palettes'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Palette tab ── */}
      {tab === 'palette' && (
        <View>
          {recentColors.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Récents</Text>
              <View style={styles.recentRow}>
                {recentColors.map((color, i) => (
                  <Pressable
                    key={i}
                    style={[styles.colorDot, { backgroundColor: color }, activeColor === color && styles.colorDotActive]}
                    onPress={() => selectColor(color)}
                  />
                ))}
              </View>
            </>
          )}
          <Text style={styles.sectionTitle}>Couleurs</Text>
          <View style={styles.grid}>
            {BASE_PALETTE.map((color, i) => (
              <Pressable
                key={i}
                style={[
                  styles.colorCell, { backgroundColor: color },
                  activeColor === color && styles.colorCellActive,
                  color === '#ffffff' && styles.whiteCell,
                ]}
                onPress={() => selectColor(color)}
              >
                {activeColor === color && (
                  <MaterialCommunityIcons name="check" size={12}
                    color={color === '#ffffff' || color === '#ffd700' || color === '#ffff00' ? '#000' : '#fff'} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Color Wheel tab ── */}
      {tab === 'wheel' && (
        <View style={styles.wheelTab}>
          <ColorWheel hue={hsv[0]} saturation={hsv[1]} onHSChange={handleWheelHS} />

          {/* Brightness slider */}
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Luminosité</Text>
            <Text style={styles.sliderVal}>{Math.round(brightness * 100)}%</Text>
          </View>
          <View style={styles.brightnessTrack}>
            <View style={[styles.brightnessFill, {
              width: `${brightness * 100}%`,
              backgroundColor: hsvToHex(hsv[0], hsv[1], 1),
            }]} />
            <Pressable
              style={[styles.brightnessThumb, { left: `${brightness * 100}%` as any }]}
              // tap to set brightness by normalized position — simplified to buttons
            />
          </View>
          <View style={styles.brightnessButtons}>
            {[0.1, 0.25, 0.5, 0.75, 1.0].map(v => (
              <Pressable
                key={v}
                style={[styles.bBtn, { backgroundColor: hsvToHex(hsv[0], hsv[1], v) },
                  Math.abs(brightness - v) < 0.05 && styles.bBtnActive]}
                onPress={() => handleValueChange(v)}
              />
            ))}
          </View>

          {/* Preset hue strip */}
          <View style={styles.hueStrip}>
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(h => (
              <Pressable
                key={h}
                style={[styles.hueBtn, { backgroundColor: hsvToHex(h, 1, 1) },
                  Math.abs(hsv[0] - h) < 15 && styles.hueBtnActive]}
                onPress={() => handleWheelHS(h, hsv[1])}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Custom Palettes tab ── */}
      {tab === 'custom' && (
        <View style={styles.customTab}>
          <Pressable style={styles.newPaletteBtn} onPress={() => setShowNewPaletteModal(true)}>
            <MaterialCommunityIcons name="plus" size={14} color={Colors.accent} />
            <Text style={styles.newPaletteText}>Nouvelle palette</Text>
          </Pressable>

          {customPalettes.length === 0 && (
            <Text style={styles.emptyText}>Créez vos palettes personnalisées pour les réutiliser dans vos projets.</Text>
          )}

          {customPalettes.map(palette => (
            <View key={palette.id} style={styles.paletteCard}>
              <View style={styles.paletteHeader}>
                <Text style={styles.paletteName}>{palette.name}</Text>
                <View style={styles.paletteActions}>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => addColorToPalette(palette.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="plus-circle-outline" size={16} color={Colors.accent} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => deletePalette(palette.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.danger} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.paletteColors}>
                {palette.colors.map((color, i) => (
                  <Pressable
                    key={i}
                    style={[styles.palColor, { backgroundColor: color },
                      activeColor === color && styles.colorCellActive]}
                    onPress={() => selectColor(color)}
                    onLongPress={() => removeColorFromPalette(palette.id, color)}
                  />
                ))}
                {palette.colors.length === 0 && (
                  <Text style={styles.emptyPalette}>Vide</Text>
                )}
              </View>
              <Text style={styles.paletteTip}>Appuyer pour sélectionner · Maintenir pour supprimer</Text>
            </View>
          ))}
        </View>
      )}

      {/* HEX Modal */}
      <Modal visible={showHexModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowHexModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Couleur HEX</Text>
            <View style={styles.hexInputRow}>
              <Text style={styles.hashPrefix}>#</Text>
              <TextInput
                style={styles.hexInput}
                value={customHex.replace('#', '')}
                onChangeText={setCustomHex}
                placeholder="FF6B6B"
                placeholderTextColor={Colors.textMuted}
                maxLength={7}
                autoCapitalize="characters"
              />
              {customHex.length >= 6 && (
                <View style={[styles.previewDot, {
                  backgroundColor: customHex.startsWith('#') ? customHex : `#${customHex}`
                }]} />
              )}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowHexModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={applyCustom}>
                <Text style={styles.applyText}>Appliquer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* New Palette Modal */}
      <Modal visible={showNewPaletteModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewPaletteModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Nouvelle palette</Text>
            <TextInput
              style={[styles.hexInput, { borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.md, padding: 10, marginBottom: 12 }]}
              value={newPaletteName}
              onChangeText={setNewPaletteName}
              placeholder="Nom de la palette"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowNewPaletteModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={createPalette}>
                <Text style={styles.applyText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs,
  },
  activeColor: {
    width: 32, height: 32, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.surfaceBorder,
  },
  hexText: {
    color: Colors.textPrimary, fontSize: FontSize.sm,
    fontWeight: '600', flex: 1, fontFamily: 'monospace',
  },
  hexBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.surfaceHigh, paddingHorizontal: Spacing.sm,
    paddingVertical: 5, borderRadius: Radius.sm,
  },
  hexBtnText: { color: Colors.accent, fontSize: FontSize.xs, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm, padding: 2,
  },
  tabBtn: {
    flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: Radius.sm - 2,
  },
  tabBtnActive: { backgroundColor: Colors.surface },
  tabLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.accent },
  sectionTitle: {
    fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.xs, marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  recentRow: {
    flexDirection: 'row', gap: 4, flexWrap: 'wrap',
    marginBottom: Spacing.xs, paddingHorizontal: Spacing.xs,
  },
  colorDot: {
    width: 26, height: 26, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  colorDotActive: { borderColor: Colors.accent, borderWidth: 2.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: Spacing.xs },
  colorCell: {
    width: 26, height: 26, borderRadius: 5, borderWidth: 1,
    borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  colorCellActive: { borderColor: Colors.accent, borderWidth: 2 },
  whiteCell: { borderColor: '#ccc' },

  // Wheel
  wheelTab: { alignItems: 'center', paddingTop: Spacing.sm },
  wheelContainer: { width: WHEEL_SIZE, height: WHEEL_SIZE, marginBottom: Spacing.md },
  sliderRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '100%', paddingHorizontal: Spacing.sm, marginBottom: 4,
  },
  sliderLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  sliderVal: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: 'monospace' },
  brightnessTrack: {
    width: '90%', height: 6, backgroundColor: Colors.surfaceBorder,
    borderRadius: 3, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  brightnessFill: { height: '100%', borderRadius: 3 },
  brightnessThumb: { position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginLeft: -7 },
  brightnessButtons: {
    flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  bBtn: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'transparent' },
  bBtnActive: { borderColor: '#fff' },
  hueStrip: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center' },
  hueBtn: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: 'transparent' },
  hueBtnActive: { borderColor: '#fff' },

  // Custom palettes
  customTab: { paddingHorizontal: Spacing.xs },
  newPaletteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.activeGlow, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.accent,
  },
  newPaletteText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, textAlign: 'center', paddingVertical: Spacing.md },
  paletteCard: {
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  paletteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  paletteName: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  paletteActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  paletteColors: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  palColor: {
    width: 24, height: 24, borderRadius: 5,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyPalette: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
  paletteTip: { fontSize: 9, color: Colors.textMuted, fontStyle: 'italic' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalContent: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.xl, width: 280, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },
  hexInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48, gap: Spacing.xs, marginBottom: Spacing.lg,
  },
  hashPrefix: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
  hexInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600', fontFamily: 'monospace' },
  previewDot: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { flex: 1, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  applyBtn: { flex: 1, height: 44, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#0d0d0d', fontWeight: '700' },
});

export default React.memo(ColorPalette);
