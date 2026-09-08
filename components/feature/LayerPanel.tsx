// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCanvas } from '@/hooks/useCanvas';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

const LayerPanel: React.FC = () => {
  const {
    layers, activeLayerId, setActiveLayerId,
    addLayer, removeLayer, toggleLayerVisibility, setLayerOpacity, clearLayer
  } = useCanvas();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calques</Text>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          onPress={addLayer}
        >
          <MaterialCommunityIcons name="plus" size={18} color={Colors.accent} />
        </Pressable>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {[...layers].reverse().map(layer => {
          const isActive = layer.id === activeLayerId;
          return (
            <View key={layer.id} style={[styles.layerItem, isActive && styles.layerItemActive]}>
              <Pressable
                style={styles.layerMain}
                onPress={() => setActiveLayerId(layer.id)}
              >
                {/* Mini preview */}
                <View style={styles.miniPreview}>
                  <MaterialCommunityIcons
                    name="layers"
                    size={16}
                    color={isActive ? Colors.accent : Colors.textSecondary}
                  />
                </View>

                <View style={styles.layerInfo}>
                  <Text style={[styles.layerName, isActive && styles.layerNameActive]}>
                    {layer.name}
                  </Text>
                  <Text style={styles.layerMeta}>
                    {layer.strokes.length} trait{layer.strokes.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </Pressable>

              {/* Controls */}
              <View style={styles.layerControls}>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => toggleLayerVisibility(layer.id)}
                  hitSlop={6}
                >
                  <MaterialCommunityIcons
                    name={layer.visible ? 'eye' : 'eye-off'}
                    size={16}
                    color={layer.visible ? Colors.textSecondary : Colors.textMuted}
                  />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => clearLayer(layer.id)}
                  hitSlop={6}
                >
                  <MaterialCommunityIcons name="eraser" size={16} color={Colors.textMuted} />
                </Pressable>
                {layers.length > 1 && (
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => removeLayer(layer.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={Colors.danger} />
                  </Pressable>
                )}
              </View>

              {/* Opacity slider */}
              {isActive && (
                <View style={styles.opacityRow}>
                  <Text style={styles.opacityLabel}>Opacité</Text>
                  <Text style={styles.opacityValue}>{Math.round(layer.opacity * 100)}%</Text>
                  <Slider
                    style={styles.opacitySlider}
                    minimumValue={0.1}
                    maximumValue={1}
                    value={layer.opacity}
                    onValueChange={(v) => setLayerOpacity(layer.id, v)}
                    minimumTrackTintColor={Colors.accent}
                    maximumTrackTintColor={Colors.surfaceBorder}
                    thumbTintColor={Colors.accent}
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.activeGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  layerItem: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  layerItemActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(78,205,196,0.08)',
  },
  layerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  miniPreview: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  layerInfo: {
    flex: 1,
  },
  layerName: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  layerNameActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  layerMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  layerControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: 4,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  opacityLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    width: 45,
  },
  opacityValue: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    width: 32,
    textAlign: 'right',
  },
  opacitySlider: {
    flex: 1,
    height: 30,
  },
});

export default React.memo(LayerPanel);
