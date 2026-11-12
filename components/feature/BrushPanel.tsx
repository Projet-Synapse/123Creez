// Powered by OnSpace.AI
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, LayoutChangeEvent } from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';
import {
  clampBrushOpacity,
  clampBrushSize,
  PREVIEW_HEIGHT,
  previewStrokePath,
} from '@/services/brushPreview';

const PRESET_SIZES = [2, 5, 10, 20, 40];

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

const BrushPanel: React.FC = () => {
  const { brushSize, setBrushSize, brushOpacity, setBrushOpacity, activeColor, activeTool } = useCanvas();
  const { settings, updateSettings } = useTheme();
  const [previewW, setPreviewW] = useState(0);

  const displayColor = activeTool === 'eraser' ? '#ffffff' : activeColor;
  const linecap = activeTool === 'pencil' ? 'square' : 'round';

  const stroke = useMemo(
    () => previewStrokePath(previewW, PREVIEW_HEIGHT, brushSize),
    [previewW, brushSize],
  );

  const onPreviewLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPreviewW((prev) => (prev === w ? prev : w));
  }, []);

  return (
    <View style={styles.container}>
      {/* Aperçu en trait ondulé : couleur, taille, opacité, bout rond ou carré. */}
      <View style={styles.previewArea}>
        <View style={styles.previewBg} onLayout={onPreviewLayout}>
          {previewW > 0 && (
            <Svg width={previewW} height={PREVIEW_HEIGHT}>
              <Defs>
                {/* Damier : le noir et le blanc restent visibles (un fond
                    uni blanc ou noir ferait disparaître le trait). Motif
                    proche des vignettes de calques, un peu plus contrasté
                    car le cadre est petit. */}
                <Pattern
                  id="brush-preview-checker"
                  width={16}
                  height={16}
                  patternUnits="userSpaceOnUse"
                >
                  <Rect x={0} y={0} width={8} height={8} fill="#b0b0b0" />
                  <Rect x={8} y={0} width={8} height={8} fill="#e8e8e8" />
                  <Rect x={0} y={8} width={8} height={8} fill="#e8e8e8" />
                  <Rect x={8} y={8} width={8} height={8} fill="#b0b0b0" />
                </Pattern>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={previewW}
                height={PREVIEW_HEIGHT}
                fill="url(#brush-preview-checker)"
              />
              <Path
                d={stroke.d}
                fill="none"
                stroke={displayColor}
                strokeWidth={stroke.strokeWidth}
                strokeLinecap={linecap}
                strokeLinejoin="round"
                strokeOpacity={brushOpacity}
              />
            </Svg>
          )}
        </View>
      </View>

      {/* Stabilisateur du tracé — accessible en dessinant (réglage persistant) */}
      <View style={styles.row}>
        <Text style={styles.label}>Stabilisateur</Text>
        <Text style={styles.value}>{settings.strokeStabilizer ?? 0}%</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={5}
        value={settings.strokeStabilizer ?? 0}
        onSlidingComplete={v => updateSettings({ strokeStabilizer: Math.round(v) })}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.surfaceBorder}
        thumbTintColor={Colors.accent}
      />

      {/* Taille : libellé + valeur, puis − curseur + (le slider seul est trop étroit à 150 px). */}
      <View style={styles.row}>
        <Text style={styles.label}>Taille</Text>
        <Text style={styles.value}>{Math.round(brushSize)}px</Text>
      </View>
      <View style={styles.stepRow}>
        <StepButton
          icon="minus"
          label="Taille moins 1"
          onStep={() => setBrushSize(clampBrushSize(brushSize - 1))}
        />
        <Slider
          style={styles.stepSlider}
          minimumValue={1}
          maximumValue={80}
          step={1}
          value={brushSize}
          onValueChange={setBrushSize}
          minimumTrackTintColor={Colors.accent}
          maximumTrackTintColor={Colors.surfaceBorder}
          thumbTintColor={Colors.accent}
          accessibilityLabel="Taille du pinceau"
        />
        <StepButton
          icon="plus"
          label="Taille plus 1"
          onStep={() => setBrushSize(clampBrushSize(brushSize + 1))}
        />
      </View>

      {/* Pastilles de taille, juste sous le curseur Taille (tiennent à 150 px). */}
      <View style={styles.presetRow}>
        {PRESET_SIZES.map(size => (
          <Pressable
            key={size}
            style={({ pressed }) => [
              styles.presetBtn,
              Math.round(brushSize) === size && styles.presetBtnActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setBrushSize(size)}
          >
            <View style={[styles.presetDot, {
              width: Math.min(size, 20) + 4,
              height: Math.min(size, 20) + 4,
              borderRadius: (Math.min(size, 20) + 4) / 2,
              backgroundColor: Math.round(brushSize) === size ? Colors.accent : Colors.textSecondary,
            }]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Opacité</Text>
        <Text style={styles.value}>{Math.round(brushOpacity * 100)}%</Text>
      </View>
      <View style={styles.stepRow}>
        <StepButton
          icon="minus"
          label="Opacité moins 1 pour cent"
          onStep={() => setBrushOpacity(clampBrushOpacity(brushOpacity - 0.01))}
        />
        <Slider
          style={styles.stepSlider}
          minimumValue={0.05}
          maximumValue={1}
          step={0.01}
          value={brushOpacity}
          onValueChange={setBrushOpacity}
          minimumTrackTintColor={Colors.accentGold}
          maximumTrackTintColor={Colors.surfaceBorder}
          thumbTintColor={Colors.accentGold}
          accessibilityLabel="Opacité du pinceau"
        />
        <StepButton
          icon="plus"
          label="Opacité plus 1 pour cent"
          onStep={() => setBrushOpacity(clampBrushOpacity(brushOpacity + 0.01))}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Panneau compact : marges réduites ; les curseurs gardent 36 px de haut
  // pour rester faciles à saisir au doigt.
  container: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  previewArea: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  previewBg: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    // Gris moyen visible avant le premier onLayout (pas un fond blanc).
    backgroundColor: '#c8c8c8',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  slider: {
    width: '100%',
    height: 36,
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
    marginBottom: 2,
  },
  stepBtn: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSlider: {
    flex: 1,
    height: 36,
    marginHorizontal: -4,
  },
  // Les 5 tailles se partagent la largeur (le panneau peut descendre à 150 px).
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  presetBtn: {
    flex: 1,
    maxWidth: 40,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    backgroundColor: Colors.activeGlow,
  },
  presetDot: {},
});

export default React.memo(BrushPanel);
