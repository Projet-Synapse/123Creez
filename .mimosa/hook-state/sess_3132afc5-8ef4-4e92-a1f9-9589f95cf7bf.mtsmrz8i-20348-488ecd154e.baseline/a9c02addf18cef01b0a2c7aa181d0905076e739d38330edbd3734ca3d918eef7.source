// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import Slider from '@react-native-community/slider';
import { useCanvas } from '@/hooks/useCanvas';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

const PRESET_SIZES = [2, 5, 10, 20, 40];

const BrushPanel: React.FC = () => {
  const { brushSize, setBrushSize, brushOpacity, setBrushOpacity, activeColor, activeTool } = useCanvas();

  const previewSize = Math.min(brushSize, 50);
  const displayColor = activeTool === 'eraser' ? '#ffffff' : activeColor;

  return (
    <View style={styles.container}>
      {/* Brush preview */}
      <View style={styles.previewArea}>
        <View style={styles.previewBg}>
          <View style={[
            styles.brushDot,
            {
              width: previewSize,
              height: previewSize,
              borderRadius: previewSize / 2,
              backgroundColor: displayColor,
              opacity: brushOpacity,
            }
          ]} />
        </View>
      </View>

      {/* Size */}
      <View style={styles.row}>
        <Text style={styles.label}>Taille</Text>
        <Text style={styles.value}>{Math.round(brushSize)}px</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={80}
        value={brushSize}
        onValueChange={setBrushSize}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.surfaceBorder}
        thumbTintColor={Colors.accent}
      />

      {/* Preset sizes */}
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

      {/* Opacity */}
      <View style={styles.row}>
        <Text style={styles.label}>Opacité</Text>
        <Text style={styles.value}>{Math.round(brushOpacity * 100)}%</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0.05}
        maximumValue={1}
        value={brushOpacity}
        onValueChange={setBrushOpacity}
        minimumTrackTintColor={Colors.accentGold}
        maximumTrackTintColor={Colors.surfaceBorder}
        thumbTintColor={Colors.accentGold}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  previewArea: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  previewBg: {
    width: '100%',
    height: 80,
    backgroundColor: '#e8e8e8',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  brushDot: {
    backgroundColor: '#000',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  slider: {
    width: '100%',
    height: 36,
    marginBottom: Spacing.xs,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  presetBtn: {
    width: 40,
    height: 40,
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
