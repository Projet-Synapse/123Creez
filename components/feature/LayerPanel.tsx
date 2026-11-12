// Powered by OnSpace.AI
//
// Fenêtre des calques, version compacte (inspirée d'IbisPaint) : une ligne
// par calque — vraie vignette | nom | œil | actions — et l'opacité du calque
// actif en bas de la carte. Rendue en panneau FLOTTANT au-dessus de la toile
// par l'éditeur (cf. app/editor/[id].tsx) : la toile n'est plus réduite.
import React from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCanvas } from '@/hooks/useCanvas';
import { pickImageAsDataUrl } from '@/services/pickImage';
import { fitContain } from '@/services/layerPanelLayout';
import { CanvasArt } from '@/components/feature/CanvasArt';
import type { Layer } from '@/contexts/CanvasContext';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

const THUMB = 48;

interface ThumbProps {
  layer: Layer;
  contentWidth: number;
  contentHeight: number;
}

/** Vignette réelle du contenu d'UN calque (traits, photo, formes, texte) sur
    damier de transparence, toile entière visible (fit « meet »). Mémorisée :
    ne se recalcule que si le CONTENU de ce calque change (les mises à jour
    du contexte gardent la référence des tableaux non modifiés) — glisser le
    curseur d'opacité ne redessine pas la vignette. */
function LayerThumbBase({ layer, contentWidth, contentHeight }: ThumbProps) {
  const fit = fitContain(contentWidth, contentHeight, THUMB - 4);
  // Contenu montré même si le calque est masqué ou transparent : la vignette
  // sert à reconnaître le calque ; l'état masqué est rendu par l'œil + un voile.
  const { id, strokes, images, shapes, texts } = layer;
  const shown = React.useMemo(
    () => [{ id, strokes, images, shapes, texts, visible: true, opacity: 1 }],
    [id, strokes, images, shapes, texts],
  );
  return (
    <View style={[styles.thumb, !layer.visible && styles.thumbHidden]}>
      <View style={{ width: fit.width, height: fit.height, overflow: 'hidden', borderRadius: 3 }}>
        <CanvasArt
          layers={shown}
          width={fit.width}
          height={fit.height}
          contentWidth={contentWidth > 0 ? contentWidth : fit.width}
          contentHeight={contentHeight > 0 ? contentHeight : fit.height}
          variant={`layerthumb-${layer.id}`}
          bg="checker"
          preserveAspect="meet"
        />
      </View>
    </View>
  );
}

const sameThumb = (a: ThumbProps, b: ThumbProps) =>
  a.contentWidth === b.contentWidth && a.contentHeight === b.contentHeight
  && a.layer.id === b.layer.id && a.layer.visible === b.layer.visible
  && a.layer.strokes === b.layer.strokes && a.layer.images === b.layer.images
  && a.layer.shapes === b.layer.shapes && a.layer.texts === b.layer.texts;

const LayerThumb = React.memo(LayerThumbBase, sameThumb);

interface Props {
  /** Ferme le panneau flottant (bouton ✕ de l'en-tête). */
  onClose?: () => void;
  /** Dimensions LOGIQUES de la toile (coordonnées des traits) — vignettes. */
  contentWidth: number;
  contentHeight: number;
  /** Hauteur max de la carte : la liste défile au-delà. */
  maxHeight?: number;
}

const LayerPanel: React.FC<Props> = ({ onClose, contentWidth, contentHeight, maxHeight }) => {
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

  const activeLayer = layers.find(l => l.id === activeLayerId) ?? null;

  const importPhoto = async () => {
    setAddMenu(false);
    setImportError(null);
    try {
      const img = await pickImageAsDataUrl();
      if (!img) return;
      addPhotoLayer(img.src, img.width, img.height);
      setActiveTool('move');
    } catch (e) {
      console.error('[calques] import photo échoué', e);
      setImportError("Impossible d'importer cette image.");
    }
  };

  const renderLayer = (layer: Layer) => {
    const isActive = layer.id === activeLayerId;
    return (
      <View key={layer.id} style={[styles.layerRow, isActive && styles.layerRowActive]}>
        <Pressable
          style={styles.layerMain}
          onPress={() => setActiveLayerId(layer.id)}
          accessibilityLabel={`Calque ${layer.name}`}
          accessibilityState={{ selected: isActive }}
        >
          <LayerThumb layer={layer} contentWidth={contentWidth} contentHeight={contentHeight} />
          <Text
            style={[styles.layerName, isActive && styles.layerNameActive, !layer.visible && styles.layerNameHidden]}
            numberOfLines={1}
          >
            {layer.name}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => toggleLayerVisibility(layer.id)}
          hitSlop={4}
          accessibilityLabel={layer.visible ? 'Masquer le calque' : 'Afficher le calque'}
        >
          <MaterialCommunityIcons
            name={layer.visible ? 'eye' : 'eye-off'}
            size={18}
            color={layer.visible ? Colors.textSecondary : Colors.textMuted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => clearLayer(layer.id)}
          hitSlop={4}
          accessibilityLabel="Effacer le calque"
        >
          <MaterialCommunityIcons name="eraser" size={17} color={Colors.textMuted} />
        </Pressable>
        {layers.length > 1 && (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={() => removeLayer(layer.id)}
            hitSlop={4}
            accessibilityLabel="Supprimer le calque"
          >
            <MaterialCommunityIcons name="trash-can-outline" size={17} color={Colors.danger} />
          </Pressable>
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
    <View style={[styles.card, maxHeight != null && { maxHeight }]}>
      {/* En-tête : titre, groupe, +, fermer */}
      <View style={styles.header}>
        <Text style={styles.title}>Calques</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              const g = addLayerGroup();
              setRenamingGroup(g.id);
              setGroupName(g.name);
            }}
            accessibilityLabel="Nouveau groupe"
          >
            <MaterialCommunityIcons name="folder-outline" size={18} color={Colors.accent} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setAddMenu(v => !v)}
            accessibilityLabel="Ajouter un calque"
          >
            <MaterialCommunityIcons name={addMenu ? 'minus' : 'plus'} size={18} color={Colors.accent} />
          </Pressable>
          {onClose && (
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              onPress={onClose}
              hitSlop={6}
              accessibilityLabel="Fermer les calques"
            >
              <MaterialCommunityIcons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          )}
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

      {/* Liste : défile quand il y a beaucoup de calques */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listInner}
        showsVerticalScrollIndicator
        persistentScrollbar
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
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
                    style={({ pressed }) => [styles.iconBtnSm, pressed && { opacity: 0.6 }]}
                    onPress={() => toggleGroupVisibility(group.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={16} color={Colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtnSm, pressed && { opacity: 0.6 }]}
                    onPress={() => { setRenamingGroup(group.id); setGroupName(group.name); }}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={15} color={Colors.textMuted} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtnSm, pressed && { opacity: 0.6 }]}
                    onPress={() => removeLayerGroup(group.id)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="close" size={15} color={Colors.danger} />
                  </Pressable>
                </View>
              </View>
              {!group.collapsed && (
                <View style={styles.groupLayers}>{inGroup.map(renderLayer)}</View>
              )}
            </View>
          );
        })}

        {ungrouped.length > 0 && (
          <>
            {layerGroups.length > 0 && <Text style={styles.ungroupedLabel}>Sans groupe</Text>}
            {ungrouped.map(renderLayer)}
          </>
        )}
      </ScrollView>

      {/* Barre du bas : opacité (et groupe) du calque ACTIF, façon IbisPaint */}
      {activeLayer && (
        <View style={styles.footer}>
          <View style={styles.opacityRow}>
            <MaterialCommunityIcons name="circle-opacity" size={16} color={Colors.textMuted} />
            <Slider
              style={styles.opacitySlider}
              minimumValue={0.1}
              maximumValue={1}
              value={activeLayer.opacity}
              onValueChange={(v) => setLayerOpacity(activeLayer.id, v)}
              minimumTrackTintColor={Colors.accent}
              maximumTrackTintColor={Colors.surfaceBorder}
              thumbTintColor={Colors.accent}
              accessibilityLabel="Opacité du calque"
            />
            <Text style={styles.opacityValue}>{Math.round(activeLayer.opacity * 100)} %</Text>
          </View>
          {layerGroups.length > 0 && (
            <View style={styles.groupAssignRow}>
              <MaterialCommunityIcons name="folder-outline" size={15} color={Colors.textMuted} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChips}>
                <Pressable
                  style={[styles.groupChip, !activeLayer.groupId && styles.groupChipActive]}
                  onPress={() => setLayerGroup(activeLayer.id, null)}
                >
                  <Text style={[styles.groupChipText, !activeLayer.groupId && styles.groupChipTextActive]}>Aucun</Text>
                </Pressable>
                {layerGroups.map(g => (
                  <Pressable
                    key={g.id}
                    style={[styles.groupChip, activeLayer.groupId === g.id && styles.groupChipActive]}
                    onPress={() => setLayerGroup(activeLayer.id, g.id)}
                  >
                    <Text style={[styles.groupChipText, activeLayer.groupId === g.id && styles.groupChipTextActive]} numberOfLines={1}>
                      {g.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    // Fond sombre 123Créez semi-transparent : la toile reste devinable dessous.
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.activeGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listInner: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  groupBlock: {
    marginBottom: Spacing.xs,
  },
  groupLayers: {
    paddingLeft: Spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
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
    flexShrink: 1,
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
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 2,
    marginBottom: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(36,36,36,0.85)',
  },
  layerRowActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(78,205,196,0.12)',
  },
  layerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbHidden: {
    opacity: 0.4,
  },
  layerName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  layerNameActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  layerNameHidden: {
    color: Colors.textMuted,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSm: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  opacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  opacitySlider: {
    flex: 1,
    height: 32,
  },
  opacityValue: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontFamily: 'monospace',
    minWidth: 44,
    textAlign: 'right',
  },
  groupAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  addMenu: {
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  addMenuText: { color: Colors.textPrimary, fontSize: FontSize.sm },
  addMenuError: { color: Colors.danger, fontSize: FontSize.xs, marginHorizontal: Spacing.md, marginTop: Spacing.xs },
});

export default React.memo(LayerPanel);
