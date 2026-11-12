// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, StyleSheet, Pressable, Text, TextInput,
  Modal, PanResponder, LayoutChangeEvent,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useCanvas } from '@/hooks/useCanvas';
import {
  CustomPalette, getRecentColors, saveRecentColors,
  getCustomPalettes, saveCustomPalettes,
} from '@/services/paletteService';
import {
  RGB, HSV, hsvToHex, hexToHsv, hexToHsvKeep, hexToRgb, rgbToHex, normalizeHex,
  setChannel, angleToHue, hueToPoint, diamondToSv, svToDiamond,
  wheelGeometry, wheelSizeFor, wheelZone,
} from '@/services/colorMath';
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

// ─── Roue : anneau de teinte + losange saturation / valeur ───────────────────
// Un seul widget façon IbisPaint : l'anneau règle la teinte, le losange au
// centre (carré S/V tourné de 45°) règle saturation et valeur. La taille
// suit la largeur utile du panneau compact (150–248 px). Math dans
// services/colorMath.ts.
const RING_SEGMENTS = 72;

function ColorWheel({ size, hue, saturation, value, onHueChange, onSvChange }: {
  size: number;
  hue: number;
  saturation: number;
  value: number;
  onHueChange: (h: number) => void;
  onSvChange: (s: number, v: number) => void;
}) {
  const g = useMemo(() => wheelGeometry(size), [size]);

  // Le PanResponder est créé une fois : il lit géométrie et callbacks à jour
  // via des refs. La zone (anneau / losange) est fixée au toucher et gardée
  // jusqu'au lâcher : le doigt ne « saute » jamais de l'une à l'autre.
  const live = useRef({ g, onHueChange, onSvChange });
  live.current = { g, onHueChange, onSvChange };
  const zone = useRef<'ring' | 'diamond'>('ring');

  const apply = (px: number, py: number) => {
    const { g: geo, onHueChange: onH, onSvChange: onSV } = live.current;
    const dx = px - geo.r;
    const dy = py - geo.r;
    if (zone.current === 'ring') {
      onH(angleToHue(dx, dy));
    } else {
      const { s, v } = diamondToSv(dx, dy, geo.half);
      onSV(s, v);
    }
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const geo = live.current.g;
      zone.current = wheelZone(locationX - geo.r, locationY - geo.r, geo);
      apply(locationX, locationY);
    },
    onPanResponderMove: (evt) => {
      apply(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
  })).current;

  const ring = useMemo(() => {
    const { r, innerR } = g;
    const out: React.ReactNode[] = [];
    for (let i = 0; i < RING_SEGMENTS; i++) {
      // Léger recouvrement pour éviter les fentes entre segments.
      const a1 = (i / RING_SEGMENTS) * 2 * Math.PI;
      const a2 = ((i + 1.15) / RING_SEGMENTS) * 2 * Math.PI;
      const x1o = r + r * Math.cos(a1), y1o = r + r * Math.sin(a1);
      const x2o = r + r * Math.cos(a2), y2o = r + r * Math.sin(a2);
      const x1i = r + innerR * Math.cos(a1), y1i = r + innerR * Math.sin(a1);
      const x2i = r + innerR * Math.cos(a2), y2i = r + innerR * Math.sin(a2);
      out.push(
        <Path
          key={i}
          d={`M ${x1o} ${y1o} A ${r} ${r} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i} Z`}
          fill={hsvToHex((i / RING_SEGMENTS) * 360, 1, 1)}
        />
      );
    }
    return out;
  }, [g]);

  const { r, half, ringMid } = g;
  // Sommets du losange (repère SVG) : haut blanc, droite teinte, bas / gauche noirs.
  const top = { x: r, y: r - half };
  const right = { x: r + half, y: r };
  const bottom = { x: r, y: r + half };
  const left = { x: r - half, y: r };
  const diamondPath = `M ${top.x} ${top.y} L ${right.x} ${right.y} L ${bottom.x} ${bottom.y} L ${left.x} ${left.y} Z`;
  const pureHue = hsvToHex(hue, 1, 1);

  const ringThumb = hueToPoint(hue, ringMid);
  const svThumb = svToDiamond(saturation, value, half);
  const thumbR = Math.max(6, Math.round((g.r - g.innerR) / 2) - 1);

  return (
    <View
      style={{ width: size, height: size }}
      {...panResponder.panHandlers}
      accessibilityLabel="Roue de couleur : anneau de teinte et losange saturation / luminosité"
    >
      <Svg width={size} height={size}>
        <Defs>
          {/* S : blanc (S 0, arête gauche-haut) → teinte pleine (S 1, arête bas-droite). */}
          <LinearGradient id="cw-sat" gradientUnits="userSpaceOnUse"
            x1={left.x} y1={left.y} x2={bottom.x} y2={bottom.y}>
            <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="1" stopColor={pureHue} stopOpacity={1} />
          </LinearGradient>
          {/* V : voile noir, opaque à V 0 (arête gauche-bas) → nul à V 1 (arête haut-droite). */}
          <LinearGradient id="cw-val" gradientUnits="userSpaceOnUse"
            x1={left.x} y1={left.y} x2={top.x} y2={top.y}>
            <Stop offset="0" stopColor="#000000" stopOpacity={1} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {ring}
        <Path d={diamondPath} fill="url(#cw-sat)" />
        <Path d={diamondPath} fill="url(#cw-val)" />
        {/* Curseur de teinte sur l'anneau */}
        <Circle cx={r + ringThumb.x} cy={r + ringThumb.y} r={thumbR}
          fill="none" stroke="#ffffff" strokeWidth={2.5} />
        <Circle cx={r + ringThumb.x} cy={r + ringThumb.y} r={thumbR + 1.5}
          fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
        {/* Curseur S/V dans le losange */}
        <Circle cx={r + svThumb.x} cy={r + svThumb.y} r={6}
          fill={hsvToHex(hue, saturation, value)} stroke="#ffffff" strokeWidth={2} />
        <Circle cx={r + svThumb.x} cy={r + svThumb.y} r={7.5}
          fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
      </Svg>
    </View>
  );
}

// ─── Curseurs RVB ────────────────────────────────────────────────────────────
const RGB_ROWS: { ch: 0 | 1 | 2; label: string; tint: string }[] = [
  { ch: 0, label: 'R', tint: '#ff3b3b' },
  { ch: 1, label: 'V', tint: '#2ee65a' },
  { ch: 2, label: 'B', tint: '#3b6bff' },
];

/** Bouton − / + : un pas au toucher, puis répétition tant qu'on maintient. */
function StepButton({ icon, label, onStep }: {
  icon: 'minus' | 'plus';
  label: string;
  onStep: () => void;
}) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (repeat.current) clearInterval(repeat.current);
    timer.current = null;
    repeat.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  return (
    <Pressable
      style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
      hitSlop={4}
      accessibilityLabel={label}
      onPressIn={() => {
        stop();
        stepRef.current();
        timer.current = setTimeout(() => {
          repeat.current = setInterval(() => stepRef.current(), 45);
        }, 380);
      }}
      onPressOut={stop}
    >
      <MaterialCommunityIcons name={icon} size={12} color={Colors.textPrimary} />
    </Pressable>
  );
}

function RgbSliders({ rgb, onChannel, onNudge }: {
  rgb: RGB;
  onChannel: (ch: 0 | 1 | 2, value: number) => void;
  onNudge: (ch: 0 | 1 | 2, delta: number) => void;
}) {
  return (
    <View style={styles.rgbBlock}>
      {RGB_ROWS.map(({ ch, label, tint }) => (
        <View key={ch} style={styles.rgbRow}>
          <Text style={[styles.rgbLabel, { color: tint }]}>{label}</Text>
          <Text style={styles.rgbVal}>{rgb[ch]}</Text>
          <StepButton icon="minus" label={`${label} moins 1`}
            onStep={() => onNudge(ch, -1)} />
          <Slider
            style={styles.rgbSlider}
            minimumValue={0}
            maximumValue={255}
            step={1}
            value={rgb[ch]}
            onValueChange={(n) => onChannel(ch, n)}
            minimumTrackTintColor={tint}
            maximumTrackTintColor={Colors.surfaceBorder}
            thumbTintColor="#ffffff"
            accessibilityLabel={`Canal ${label}`}
          />
          <StepButton icon="plus" label={`${label} plus 1`}
            onStep={() => onNudge(ch, 1)} />
        </View>
      ))}
    </View>
  );
}

// ─── Custom palette storage ───────────────────────────────────────────────────

// ─── Main ColorPalette component ─────────────────────────────────────────────
const ColorPalette: React.FC = () => {
  const { activeColor, setActiveColor } = useCanvas();
  const [tab, setTab] = useState<'palette' | 'wheel' | 'custom'>('palette');
  const [showHexModal, setShowHexModal] = useState(false);
  const [customHex, setCustomHex] = useState('');
  const [recentColors, setRecentColors] = useState<string[]>([]);

  // Roue : HSV gardé en flottants (pas re-déduit du hex arrondi) pour que
  // les curseurs ne tremblent pas, et pour garder H / S sur gris et noir.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(activeColor));
  const [wheelWidth, setWheelWidth] = useState(0);
  const rgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  // Custom palettes
  const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
  const [editingPalette, setEditingPalette] = useState<CustomPalette | null>(null);
  const [newPaletteName, setNewPaletteName] = useState('');
  const [showNewPaletteModal, setShowNewPaletteModal] = useState(false);
  const hydrated = useRef(false);

  // Load persisted colors/palettes once, then persist every change so they
  // survive leaving the editor or restarting the app.
  useEffect(() => {
    Promise.all([getRecentColors(), getCustomPalettes()]).then(([recent, palettes]) => {
      setRecentColors(recent);
      setCustomPalettes(palettes);
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (hydrated.current) saveRecentColors(recentColors);
  }, [recentColors]);

  useEffect(() => {
    if (hydrated.current) saveCustomPalettes(customPalettes);
  }, [customPalettes]);

  // Dernière couleur choisie, à jour sans attendre le rendu (les boutons
  // ± répétés et la roue enchaînent plusieurs changements par frame).
  const lastHexRef = useRef(activeColor);

  const selectColor = useCallback((color: string, nextHsv?: HSV) => {
    lastHexRef.current = color;
    setActiveColor(color);
    if (nextHsv) setHsv(nextHsv);
    else setHsv(prev => hexToHsvKeep(color, prev));
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== color);
      return [color, ...filtered].slice(0, 8);
    });
  }, [setActiveColor]);

  // Toujours la dernière HSV : le PanResponder de la roue et le curseur
  // ne doivent pas figer teinte / sat / valeur d'un rendu précédent.
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Couleur changée ailleurs (pipette, autre panneau) : la roue suit.
  useEffect(() => {
    const hex = normalizeHex(activeColor);
    if (!hex) return;
    lastHexRef.current = hex;
    const [h, s, v] = hsvRef.current;
    if (hsvToHex(h, s, v) !== hex) setHsv(prev => hexToHsvKeep(hex, prev));
  }, [activeColor]);

  // Anneau : ne change que H.
  const handleHue = useCallback((h: number) => {
    const [, s, v] = hsvRef.current;
    const next: HSV = [h, s, v];
    hsvRef.current = next;
    selectColor(hsvToHex(h, s, v), next);
  }, [selectColor]);

  // Losange : ne change que S et V.
  const handleSv = useCallback((s: number, v: number) => {
    const h = hsvRef.current[0];
    const next: HSV = [h, s, v];
    hsvRef.current = next;
    selectColor(hsvToHex(h, s, v), next);
  }, [selectColor]);

  // RVB : un canal, puis hex → HSV (en gardant H / S si besoin).
  const handleChannel = useCallback((ch: 0 | 1 | 2, value: number) => {
    const cur = hexToRgb(lastHexRef.current);
    const next = setChannel(cur, ch, value);
    if (next[ch] === cur[ch]) return;
    selectColor(rgbToHex(next));
  }, [selectColor]);

  const handleNudge = useCallback((ch: 0 | 1 | 2, delta: number) => {
    const cur = hexToRgb(lastHexRef.current);
    handleChannel(ch, cur[ch] + delta);
  }, [handleChannel]);

  const onWheelTabLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWheelWidth(prev => (prev === w ? prev : w));
  }, []);

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
        <View style={styles.wheelTab} onLayout={onWheelTabLayout}>
          <ColorWheel
            size={wheelWidth > 0 ? wheelSizeFor(wheelWidth) : 136}
            hue={hsv[0]}
            saturation={hsv[1]}
            value={hsv[2]}
            onHueChange={handleHue}
            onSvChange={handleSv}
          />
          <RgbSliders rgb={rgb} onChannel={handleChannel} onNudge={handleNudge} />
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
  container: { paddingHorizontal: 6, paddingVertical: Spacing.xs },
  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 6, paddingHorizontal: 2,
  },
  activeColor: {
    width: 28, height: 28, borderRadius: Radius.sm,
    borderWidth: 2, borderColor: Colors.surfaceBorder,
  },
  hexText: {
    color: Colors.textPrimary, fontSize: FontSize.sm,
    fontWeight: '600', flex: 1, fontFamily: 'monospace',
  },
  hexBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.surfaceHigh, paddingHorizontal: 6,
    paddingVertical: 5, borderRadius: Radius.sm,
  },
  hexBtnText: { color: Colors.accent, fontSize: FontSize.xs, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', marginBottom: 6,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm, padding: 2,
  },
  tabBtn: {
    flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: Radius.sm - 2,
  },
  tabBtnActive: { backgroundColor: Colors.surface },
  tabLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.accent },
  sectionTitle: {
    fontSize: 10, color: Colors.textMuted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 3, marginTop: 3,
    paddingHorizontal: 2,
  },
  recentRow: {
    flexDirection: 'row', gap: 4, flexWrap: 'wrap',
    marginBottom: Spacing.xs, paddingHorizontal: 2,
  },
  colorDot: {
    width: 26, height: 26, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  colorDotActive: { borderColor: Colors.accent, borderWidth: 2.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: 2 },
  colorCell: {
    width: 26, height: 26, borderRadius: 5, borderWidth: 1,
    borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  colorCellActive: { borderColor: Colors.accent, borderWidth: 2 },
  whiteCell: { borderColor: '#ccc' },

  // Wheel
  wheelTab: { alignItems: 'center', paddingTop: 2 },
  // RVB : 3 lignes compactes, tiennent dès 150 px de panneau.
  rgbBlock: { width: '100%', marginTop: 6, gap: 2 },
  rgbRow: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  rgbLabel: { width: 9, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  rgbVal: {
    width: 22, fontSize: 10, color: Colors.textSecondary,
    fontFamily: 'monospace', textAlign: 'right',
  },
  stepBtn: {
    width: 22, height: 22, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceHigh, alignItems: 'center', justifyContent: 'center',
  },
  rgbSlider: { flex: 1, height: 28, marginHorizontal: -4 },

  // Custom palettes
  customTab: { paddingHorizontal: 2 },
  newPaletteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.activeGlow, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    marginBottom: 6, borderWidth: 1, borderColor: Colors.accent,
  },
  newPaletteText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, textAlign: 'center', paddingVertical: Spacing.md },
  paletteCard: {
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: 6, marginBottom: 6,
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
