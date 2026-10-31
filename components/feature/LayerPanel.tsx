// Powered by OnSpace.AI
import React from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCanvas } from '@/hooks/useCanvas';
import { pickImageAsDataUrl, fitPhotoSize } from '@/services/pickImage';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

const LayerPanel: React.FC = () => {
  const {
    layers, layerGroups, activeLayerId, setActiveLayerId,
    addLayer, addPhotoLayer, setActiveTool, removeLayer, toggleLayerVisibility, setLayerOpacity, clearLayer,
    addLayerGroup, renameLayerGroup, removeLayerGroup, toggleGroupCollapsed,
    setLayerGroup, toggleGroupVisibility,
  } = useCanvas();
  const [renamingGroup, setRenamingGroup] = React.useState<string | null>(null);
  const [groupName, setGroupName] = React.useState('');
  const [addMenu, setAddMenu] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);

  const importPhoto = async () => {
    setAddMenu(false);
    setImportError(null);
    try {
      const img = await pickImageAsDataUrl();
      if (!img) return;
      const { width, height } = fitPhotoSize(img.width, img.height);
      addPhotoLayer(img.src, width, height);
      setActiveTool('move');
    } catch (e) {
      console.error('[calques] import photo échoué', e);
      setImportError("Impossible d'importer cette image.");
    }
  };

  const renderLayer = (layer: (typeof layers)[number]) => {
    const isActive = layer.id === activeLayerId;
    return (
      <View key={layer.id} style={[styles.layerItem, isActive && styles.layerItemActive]}>
        <Pressable
          style={styles.layerMain}
          onPress={() => setActiveLayerId(layer.id)}
        >
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

        {isActive && (
          <>
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
            {layerGroups.length > 0 && (
              <View style={styles.groupAssignRow}>
                <Text style={styles.opacityLabel}>Groupe</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChips}>
                  <Pressable
                    style={[styles.groupChip, !layer.groupId && styles.groupChipActive]}
                    onPress={() => setLayerGroup(layer.id, null)}
                  >
                    <Text style={[styles.groupChipText, !layer.groupId && styles.groupChipTextActive]}>Aucun</Text>
                  </Pressable>
                  {layerGroups.map(g => (
                    <Pressable
                      key={g.id}
                      style={[styles.groupChip, layer.groupId === g.id && styles.groupChipActive]}
                      onPress={() => setLayerGroup(layer.id, g.id)}
                    >
                      <Text style={[styles.groupChipText, layer.groupId === g.id && styles.groupChipTextActive]} numberOfLines={1}>
                        {g.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  // Ordre d'affichage : groupes (ordre de création), puis calques sans
  // groupe. À l'intérieur d'une section, l'ordre d'empilement est conservé
  // (haut de liste = premier plan).
  const groupedIds = new Set(layerGroups.map(g => g.id));
  const ungrouped = [...layers].reverse().filter(l => !l.groupId || !groupedIds.has(l.groupId));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calques</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              const g = addLayerGroup();
              setRenamingGroup(g.id);
              setGroupName(g.name);
            }}
          >
            <MaterialCommunityIcons name="folder-outline" size={18} color={Colors.accent} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setAddMenu(v => !v)}
            accessibilityLabel="Ajouter un calque"
          >
            <MaterialCommunityIcons name={addMenu ? 'close' : 'plus'} size={18} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      {addMenu && (
        <View style={styles.addMenu}>
          <Pressable style={styles.addMenuItem} onPress={() => { setAddMenu(false); addLayer('raster'); }}>
            <MaterialCommunityIcons name="brush" size={16} color={Colors.accent} />
            <Text style={styles.addMenuText}>Calque normal</Text>
          </Pressable>
          <Pressable style={styles.addMenuItem} onPress={() => { setAddMenu(false); addLayer('vector'); }}>
            <MaterialCommunityIcons name="vector-curve" size={16} color={Colors.accent} />
            <Text style={styles.addMenuText}>Calque vectoriel</Text>
          </Pressable>
          <Pressable style={styles.addMenuItem} onPress={importPhoto}>
            <MaterialCommunityIcons name="image-plus" size={16} color={Colors.accent} />
            <Text style={styles.addMenuText}>Importer une photo</Text>
          </Pressable>
        </View>
      )}
      {importError && <Text style={styles.addMenuError}>{importError}</Text>}

      <View style={styles.list}>
        {layerGroups.map(group => {
          const inGroup = [...layers].reverse().filter(l => l.groupId === group.id);
          return (
            <View key={group.id} style={styles.groupBlock}>
              <View style={styles.groupHeader}>
                <Pressable
                  style={styles.groupTitleRow}
                  onPress={() => toggleGroupCollapsed(group.id)}
                >
                  <MaterialCommunityIcons
                    name={group.collapsed ? 'chevron-right' : 'chevron-down'}
                    size={16}
                    color={Colors.textSecondary}
                  />
                  {renamingGroup === group.id ? (
                    <TextInput
                      style={styles.groupRenameInput}
                      value={groupName}
                      onChangeText={setGroupName}
                      onSubmitEditing={() => { renameLayerGroup(group.id, groupName.trim() || group.name); setRenamingGroup(null); }}
                      onBlur={() => { renameLayerGroup(group.id, groupName.trim() || group.name); setRenamingGroup(null); }}
                      autoFocus
                    />
                  ) : (
                    <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                  )}
                  <Text style={styles.groupCount}>{inGroup.length}</Text>
                </Pressable>
                <View style={styles.groupActions}>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => toggleGroupVisibility(group.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={16} color={Colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => { setRenamingGroup(group.id); setGroupName(group.name); }}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={15} color={Colors.textMuted} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => removeLayerGroup(group.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="close" size={15} color={Colors.danger} />
                  </Pressable>
                </View>
              </View>
              {!group.collapsed && inGroup.map(renderLayer)}
            </View>
          );
        })}

        {ungrouped.length > 0 && (
          <>
            {layerGroups.length > 0 && <Text style={styles.ungroupedLabel}>Sans groupe</Text>}
            {ungrouped.map(renderLayer)}
          </>
        )}
      </View>
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
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  groupBlock: {
    marginBottom: Spacing.xs,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  groupName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groupRenameInput: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingVertical: 0,
    minWidth: 80,
    flex: 1,
  },
  groupCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupActions: {
    flexDirection: 'row',
    gap: 2,
  },
  ungroupedLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
  },
  groupAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  groupChips: {
    flex: 1,
  },
  groupChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Colors.surfaceHigh,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  groupChipActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(78,205,196,0.1)',
  },
  groupChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  groupChipTextActive: {
    color: Colors.accent,
    fontWeight: '600',
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
  addMenu: {
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  addMenuText: { color: Colors.textPrimary, fontSize: FontSize.sm },
  addMenuError: { color: Colors.danger, fontSize: FontSize.xs, marginBottom: Spacing.sm },
});

export default React.memo(LayerPanel);
