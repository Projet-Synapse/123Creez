// Powered by OnSpace.AI
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, Text, Pressable, TextInput,
  FlatList, ScrollView, Modal, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVault } from '@/hooks/useVault';
import { useTheme } from '@/hooks/useTheme';
import { useAlert } from '@/template';
import { CanvasMeta, Folder } from '@/services/vaultService';

const FOLDER_COLORS = ['#4ecdc4', '#ff6b6b', '#ffd700', '#6bcb77', '#7c4dff', '#ff8800', '#00b0ff', '#f48fb1'];

// ─── Canvas dimension presets ─────────────────────────────────────────────────
interface DimPreset {
  label: string;
  width: number;
  height: number;
  icon: string;
}

const DIM_PRESETS: DimPreset[] = [
  { label: 'Portrait HD', width: 1080, height: 1920, icon: 'phone-portrait' },
  { label: 'Paysage HD', width: 1920, height: 1080, icon: 'monitor' },
  { label: 'Carré', width: 1080, height: 1080, icon: 'square-outline' },
  { label: 'A4 Portrait', width: 794, height: 1123, icon: 'file-outline' },
  { label: 'A4 Paysage', width: 1123, height: 794, icon: 'file-rotate-left-outline' },
  { label: '2K', width: 2560, height: 1440, icon: 'television' },
  { label: 'Vignette', width: 400, height: 400, icon: 'image-filter-frames' },
  { label: 'Personnalisé', width: 0, height: 0, icon: 'pencil-ruler' },
];

export default function VaultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const { canvases, folders, loading, createCanvas, removeCanvas, renameCanvas,
    moveCanvas, duplicateCanvas, createFolder, renameFolder, removeFolder } = useVault();

  const [activeFolderId, setActiveFolderId] = useState<string | 'root'>('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCanvas, setShowNewCanvas] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingCanvasId, setMovingCanvasId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [contextMenu, setContextMenu] = useState<{ type: 'canvas' | 'folder'; id: string } | null>(null);
  const [renaming, setRenaming] = useState<{ type: 'canvas' | 'folder'; id: string; name: string } | null>(null);

  // Canvas dimensions
  const [selectedPreset, setSelectedPreset] = useState<DimPreset>(DIM_PRESETS[0]);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [dimStep, setDimStep] = useState<'dims' | 'name'>('dims');

  const styles = makeStyles(theme);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // A search looks across every canvas regardless of folder — finding a
  // canvas by name shouldn't require remembering which folder it's in.
  const searchResults = isSearching
    ? canvases.filter(c => c.name.toLowerCase().includes(trimmedQuery))
    : [];

  const visibleCanvases = canvases.filter(c =>
    activeFolderId === 'root' ? c.folderId === null : c.folderId === activeFolderId
  );
  const rootFolders = folders.filter(f => f.parentId === null);

  const getCanvasDims = () => {
    if (selectedPreset.label === 'Personnalisé') {
      return {
        w: Math.max(100, parseInt(customWidth) || 1080),
        h: Math.max(100, parseInt(customHeight) || 1080),
      };
    }
    return { w: selectedPreset.width, h: selectedPreset.height };
  };

  const handleOpenNewCanvas = useCallback(() => {
    setNewName('');
    setSelectedPreset(DIM_PRESETS[0]);
    setCustomWidth('1080');
    setCustomHeight('1080');
    setDimStep('dims');
    setShowNewCanvas(true);
  }, []);

  const handleCreateCanvas = useCallback(async () => {
    const name = newName.trim() || 'Toile sans titre';
    const folderId = activeFolderId === 'root' ? null : activeFolderId;
    const { w, h } = getCanvasDims();
    const id = await createCanvas(name, folderId, w, h);
    setShowNewCanvas(false);
    setNewName('');
    router.push(`/editor/${id}`);
  }, [newName, activeFolderId, createCanvas, router, selectedPreset, customWidth, customHeight]);

  const handleCreateFolder = useCallback(async () => {
    const name = newName.trim() || 'Nouveau dossier';
    await createFolder(name, folderColor);
    setShowNewFolder(false);
    setNewName('');
  }, [newName, folderColor, createFolder]);

  const handleContextMenu = useCallback((type: 'canvas' | 'folder', id: string) => {
    setContextMenu({ type, id });
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renaming) return;
    if (renaming.type === 'canvas') await renameCanvas(renaming.id, renaming.name);
    else await renameFolder(renaming.id, renaming.name);
    setRenaming(null);
  }, [renaming, renameCanvas, renameFolder]);

  const handleDelete = useCallback((type: 'canvas' | 'folder', id: string, name: string) => {
    setContextMenu(null);
    showAlert(
      `Supprimer "${name}" ?`,
      type === 'folder'
        ? 'Les toiles dans ce dossier seront déplacées à la racine.'
        : 'Cette toile sera supprimée définitivement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: () => type === 'canvas' ? removeCanvas(id) : removeFolder(id),
        },
      ]
    );
  }, [showAlert, removeCanvas, removeFolder]);

  const handleDuplicate = useCallback(async (id: string) => {
    setContextMenu(null);
    await duplicateCanvas(id);
  }, [duplicateCanvas]);

  const handleMove = useCallback((id: string) => {
    setContextMenu(null);
    setMovingCanvasId(id);
    setShowMoveModal(true);
  }, []);

  const handleOpenCanvas = useCallback(async (id: string) => {
    router.push(`/editor/${id}`);
  }, [router]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderFolder = useCallback(({ item }: { item: Folder }) => {
    const count = canvases.filter(c => c.folderId === item.id).length;
    const isActive = activeFolderId === item.id;
    return (
      <Pressable
        style={[styles.folderCard, isActive && { borderColor: item.color, borderWidth: 2 }]}
        onPress={() => setActiveFolderId(item.id)}
        onLongPress={() => handleContextMenu('folder', item.id)}
      >
        <MaterialCommunityIcons name="folder" size={28} color={item.color} />
        <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.folderCount}>{count} toile{count !== 1 ? 's' : ''}</Text>
      </Pressable>
    );
  }, [activeFolderId, canvases, handleContextMenu, styles]);

  const renderCanvas = useCallback(({ item }: { item: CanvasMeta }) => (
    <Pressable
      style={styles.canvasCard}
      onPress={() => handleOpenCanvas(item.id)}
      onLongPress={() => handleContextMenu('canvas', item.id)}
    >
      <View style={[styles.canvasThumbnail, { backgroundColor: item.thumbnailColor || '#ffffff' }]}>
        {item.strokeCount === 0 ? (
          <MaterialCommunityIcons name="brush-outline" size={32} color={theme.textMuted} />
        ) : (
          <View style={styles.thumbInfo}>
            <Text style={styles.thumbStrokeCount}>{item.strokeCount}</Text>
            <Text style={styles.thumbDims}>{item.width}×{item.height}</Text>
          </View>
        )}
      </View>
      <View style={styles.canvasInfo}>
        {renaming?.type === 'canvas' && renaming.id === item.id ? (
          <TextInput
            style={styles.inlineInput}
            value={renaming.name}
            onChangeText={n => setRenaming(r => r ? { ...r, name: n } : null)}
            onSubmitEditing={handleRenameSubmit}
            onBlur={handleRenameSubmit}
            autoFocus
          />
        ) : (
          <Text style={styles.canvasName} numberOfLines={1}>{item.name}</Text>
        )}
        <Text style={styles.canvasDate}>{formatDate(item.updatedAt)}</Text>
        <Text style={styles.canvasDims}>{item.width} × {item.height} px</Text>
      </View>
      <Pressable
        style={styles.moreBtn}
        onPress={() => handleContextMenu('canvas', item.id)}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="dots-vertical" size={18} color={theme.textMuted} />
      </Pressable>
    </Pressable>
  ), [renaming, handleOpenCanvas, handleContextMenu, handleRenameSubmit, theme, styles]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  const contextItem = contextMenu
    ? (contextMenu.type === 'canvas'
      ? canvases.find(c => c.id === contextMenu.id)
      : folders.find(f => f.id === contextMenu.id))
    : null;

  const { w: previewW, h: previewH } = showNewCanvas ? getCanvasDims() : { w: 1, h: 1 };
  const aspectLabel = showNewCanvas ? `${previewW} × ${previewH} px` : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style={theme.statusBarStyle} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="brush-variant" size={22} color={theme.accent} />
          <Text style={styles.appTitle}>PaintStudio</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={() => setShowNewFolder(true)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="folder-plus-outline" size={22} color={theme.textSecondary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push('/settings')}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="cog-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Search */}
      {canvases.length > 0 && (
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher une toile..."
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
          />
          {isSearching && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isSearching ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Résultats</Text>
              <Text style={styles.sectionCount}>{searchResults.length}</Text>
            </View>

            {searchResults.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="magnify-close" size={56} color={theme.textMuted} />
                <Text style={styles.emptyTitle}>Aucun résultat</Text>
                <Text style={styles.emptySubtitle}>Aucune toile ne correspond à &ldquo;{searchQuery.trim()}&rdquo;</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={c => c.id}
                renderItem={renderCanvas}
                scrollEnabled={false}
                contentContainerStyle={styles.canvasList}
              />
            )}
          </>
        ) : (
          <>
            {/* Breadcrumb */}
            <View style={styles.breadcrumbRow}>
              <Pressable
                style={[styles.breadcrumb, activeFolderId === 'root' && styles.breadcrumbActive]}
                onPress={() => setActiveFolderId('root')}
              >
                <MaterialCommunityIcons name="home-outline" size={14} color={activeFolderId === 'root' ? theme.accent : theme.textMuted} />
                <Text style={[styles.breadcrumbText, activeFolderId === 'root' && { color: theme.accent }]}>Racine</Text>
              </Pressable>
              {activeFolderId !== 'root' && (() => {
                const folder = folders.find(f => f.id === activeFolderId);
                return folder ? (
                  <>
                    <MaterialCommunityIcons name="chevron-right" size={14} color={theme.textMuted} />
                    <View style={[styles.breadcrumb, styles.breadcrumbActive]}>
                      <MaterialCommunityIcons name="folder" size={14} color={folder.color} />
                      <Text style={[styles.breadcrumbText, { color: theme.accent }]}>{folder.name}</Text>
                    </View>
                  </>
                ) : null;
              })()}
            </View>

            {/* Folders */}
            {activeFolderId === 'root' && rootFolders.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Dossiers</Text>
                <FlatList
                  data={rootFolders}
                  keyExtractor={f => f.id}
                  renderItem={renderFolder}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.foldersRow}
                  scrollEnabled={rootFolders.length > 3}
                />
              </>
            )}

            {/* Canvas list */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {activeFolderId === 'root' ? 'Toutes les toiles' : folders.find(f => f.id === activeFolderId)?.name ?? 'Toiles'}
              </Text>
              <Text style={styles.sectionCount}>{visibleCanvases.length}</Text>
            </View>

            {visibleCanvases.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="brush-outline" size={56} color={theme.textMuted} />
                <Text style={styles.emptyTitle}>Aucune toile</Text>
                <Text style={styles.emptySubtitle}>Créez votre première toile pour commencer</Text>
              </View>
            ) : (
              <FlatList
                data={visibleCanvases}
                keyExtractor={c => c.id}
                renderItem={renderCanvas}
                scrollEnabled={false}
                contentContainerStyle={styles.canvasList}
              />
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { transform: [{ scale: 0.95 }] }]}
        onPress={handleOpenNewCanvas}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#0d0d0d" />
      </Pressable>

      {/* ─── New Canvas Modal ─── */}
      <Modal visible={showNewCanvas} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewCanvas(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouvelle toile</Text>

            {dimStep === 'dims' ? (
              <>
                <Text style={styles.dimLabel}>Format</Text>
                <View style={styles.presetGrid}>
                  {DIM_PRESETS.map(p => {
                    const isActive = selectedPreset.label === p.label;
                    return (
                      <Pressable
                        key={p.label}
                        style={[styles.presetBtn, isActive && { borderColor: theme.accent, backgroundColor: theme.activeGlow }]}
                        onPress={() => setSelectedPreset(p)}
                      >
                        <MaterialCommunityIcons
                          name={p.icon as any}
                          size={20}
                          color={isActive ? theme.accent : theme.textSecondary}
                        />
                        <Text style={[styles.presetLabel, isActive && { color: theme.accent }]}>{p.label}</Text>
                        {p.width > 0 && (
                          <Text style={styles.presetDims}>{p.width}×{p.height}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {selectedPreset.label === 'Personnalisé' && (
                  <View style={styles.customDimRow}>
                    <View style={styles.dimInputGroup}>
                      <Text style={styles.dimInputLabel}>Largeur (px)</Text>
                      <TextInput
                        style={styles.dimInput}
                        value={customWidth}
                        onChangeText={setCustomWidth}
                        keyboardType="number-pad"
                        placeholder="1080"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                    <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} style={{ marginTop: 20 }} />
                    <View style={styles.dimInputGroup}>
                      <Text style={styles.dimInputLabel}>Hauteur (px)</Text>
                      <TextInput
                        style={styles.dimInput}
                        value={customHeight}
                        onChangeText={setCustomHeight}
                        keyboardType="number-pad"
                        placeholder="1080"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  </View>
                )}

                <View style={[styles.dimPreview, { borderColor: theme.surfaceBorder }]}>
                  <MaterialCommunityIcons name="information-outline" size={14} color={theme.textMuted} />
                  <Text style={styles.dimPreviewText}>{previewW} × {previewH} px</Text>
                </View>

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setShowNewCanvas(false)}>
                    <Text style={[styles.btnText, { color: theme.textSecondary }]}>Annuler</Text>
                  </Pressable>
                  <Pressable style={styles.createBtn} onPress={() => setDimStep('name')}>
                    <Text style={[styles.btnText, { color: '#0d0d0d', fontWeight: '700' }]}>Suivant</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#0d0d0d" />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dimPreview, { borderColor: theme.surfaceBorder, marginBottom: 12 }]}>
                  <MaterialCommunityIcons name={selectedPreset.icon as any} size={14} color={theme.accent} />
                  <Text style={[styles.dimPreviewText, { color: theme.accent }]}>{selectedPreset.label} — {previewW}×{previewH} px</Text>
                </View>
                <TextInput
                  style={styles.modalInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Nom de la toile..."
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                  onSubmitEditing={handleCreateCanvas}
                />
                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setDimStep('dims')}>
                    <MaterialCommunityIcons name="chevron-left" size={16} color={theme.textSecondary} />
                    <Text style={[styles.btnText, { color: theme.textSecondary }]}>Retour</Text>
                  </Pressable>
                  <Pressable style={styles.createBtn} onPress={handleCreateCanvas}>
                    <MaterialCommunityIcons name="brush" size={16} color="#0d0d0d" />
                    <Text style={[styles.btnText, { color: '#0d0d0d', fontWeight: '700' }]}>Créer</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* New Folder Modal */}
      <Modal visible={showNewFolder} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewFolder(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouveau dossier</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Nom du dossier..."
              placeholderTextColor={theme.textMuted}
              autoFocus
              onSubmitEditing={handleCreateFolder}
            />
            <Text style={styles.colorLabel}>Couleur</Text>
            <View style={styles.colorRow}>
              {FOLDER_COLORS.map(c => (
                <Pressable
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, folderColor === c && styles.colorDotActive]}
                  onPress={() => setFolderColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowNewFolder(false)}>
                <Text style={[styles.btnText, { color: theme.textSecondary }]}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.createBtn} onPress={handleCreateFolder}>
                <MaterialCommunityIcons name="folder-plus" size={16} color="#0d0d0d" />
                <Text style={[styles.btnText, { color: '#0d0d0d', fontWeight: '700' }]}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Context Menu */}
      <Modal visible={contextMenu !== null} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setContextMenu(null)}>
          <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.contextTitle} numberOfLines={1}>
              {contextItem ? ('name' in contextItem ? contextItem.name : '') : ''}
            </Text>
            {contextMenu?.type === 'canvas' && (
              <>
                <Pressable style={styles.contextItem} onPress={() => { setContextMenu(null); handleOpenCanvas(contextMenu.id); }}>
                  <MaterialCommunityIcons name="pencil" size={18} color={theme.accent} />
                  <Text style={styles.contextItemText}>Ouvrir</Text>
                </Pressable>
                <Pressable style={styles.contextItem} onPress={() => {
                  setContextMenu(null);
                  const c = canvases.find(x => x.id === contextMenu.id);
                  setRenaming({ type: 'canvas', id: contextMenu.id, name: c?.name ?? '' });
                }}>
                  <MaterialCommunityIcons name="rename-box" size={18} color={theme.textSecondary} />
                  <Text style={styles.contextItemText}>Renommer</Text>
                </Pressable>
                <Pressable style={styles.contextItem} onPress={() => handleDuplicate(contextMenu.id)}>
                  <MaterialCommunityIcons name="content-copy" size={18} color={theme.textSecondary} />
                  <Text style={styles.contextItemText}>Dupliquer</Text>
                </Pressable>
                <Pressable style={styles.contextItem} onPress={() => handleMove(contextMenu.id)}>
                  <MaterialCommunityIcons name="folder-move-outline" size={18} color={theme.textSecondary} />
                  <Text style={styles.contextItemText}>Déplacer vers...</Text>
                </Pressable>
                <View style={styles.contextDivider} />
                <Pressable style={styles.contextItem} onPress={() => {
                  const c = canvases.find(x => x.id === contextMenu.id);
                  handleDelete('canvas', contextMenu.id, c?.name ?? 'cette toile');
                }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.danger} />
                  <Text style={[styles.contextItemText, { color: theme.danger }]}>Supprimer</Text>
                </Pressable>
              </>
            )}
            {contextMenu?.type === 'folder' && (
              <>
                <Pressable style={styles.contextItem} onPress={() => {
                  setContextMenu(null);
                  const f = folders.find(x => x.id === contextMenu.id);
                  setRenaming({ type: 'folder', id: contextMenu.id, name: f?.name ?? '' });
                }}>
                  <MaterialCommunityIcons name="rename-box" size={18} color={theme.textSecondary} />
                  <Text style={styles.contextItemText}>Renommer</Text>
                </Pressable>
                <View style={styles.contextDivider} />
                <Pressable style={styles.contextItem} onPress={() => {
                  const f = folders.find(x => x.id === contextMenu.id);
                  handleDelete('folder', contextMenu.id, f?.name ?? 'ce dossier');
                }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.danger} />
                  <Text style={[styles.contextItemText, { color: theme.danger }]}>Supprimer</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Move Modal */}
      <Modal visible={showMoveModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowMoveModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Déplacer vers...</Text>
            <Pressable style={styles.moveOption} onPress={async () => {
              if (movingCanvasId) await moveCanvas(movingCanvasId, null);
              setShowMoveModal(false);
            }}>
              <MaterialCommunityIcons name="home-outline" size={20} color={theme.textSecondary} />
              <Text style={styles.moveOptionText}>Racine</Text>
            </Pressable>
            {folders.map(f => (
              <Pressable key={f.id} style={styles.moveOption} onPress={async () => {
                if (movingCanvasId) await moveCanvas(movingCanvasId, f.id);
                setShowMoveModal(false);
              }}>
                <MaterialCommunityIcons name="folder" size={20} color={f.color} />
                <Text style={styles.moveOptionText}>{f.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: 16,
      backgroundColor: theme.panelBg, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    appTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, letterSpacing: 0.5 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    content: { flex: 1 },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, height: 40,
      borderRadius: 12, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary, height: '100%' },
    breadcrumbRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
    breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: theme.surfaceHigh },
    breadcrumbActive: { backgroundColor: theme.activeGlow },
    breadcrumbText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    sectionCount: { fontSize: 12, color: theme.textMuted, backgroundColor: theme.surfaceHigh, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontWeight: '600' },
    foldersRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
    folderCard: { width: 100, padding: 12, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.surfaceBorder, alignItems: 'center', gap: 6 },
    folderName: { fontSize: 12, color: theme.textPrimary, fontWeight: '600', textAlign: 'center' },
    folderCount: { fontSize: 10, color: theme.textMuted },
    canvasList: { paddingHorizontal: 16, gap: 10, paddingBottom: 16 },
    canvasCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.surfaceBorder },
    canvasThumbnail: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.surfaceBorder },
    thumbInfo: { alignItems: 'center', gap: 2 },
    thumbStrokeCount: { fontSize: 13, color: '#555', fontWeight: '700' },
    thumbDims: { fontSize: 8, color: '#888' },
    canvasInfo: { flex: 1 },
    canvasName: { fontSize: 15, color: theme.textPrimary, fontWeight: '600', marginBottom: 2 },
    canvasDate: { fontSize: 11, color: theme.textMuted },
    canvasDims: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
    moreBtn: { padding: 8 },
    inlineInput: { fontSize: 15, color: theme.textPrimary, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: theme.accent, paddingVertical: 0 },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, gap: 10 },
    emptyTitle: { fontSize: 18, color: theme.textSecondary, fontWeight: '600' },
    emptySubtitle: { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
    fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', shadowColor: theme.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12, borderTopWidth: 1, borderColor: theme.surfaceBorder },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.surfaceBorder, alignSelf: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
    modalInput: { backgroundColor: theme.surfaceHigh, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: theme.textPrimary, borderWidth: 1, borderColor: theme.surfaceBorder },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: theme.surfaceHigh, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
    createBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
    btnText: { fontSize: 15, fontWeight: '600' },
    // Dimension picker
    dimLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetBtn: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder },
    presetLabel: { fontSize: 13, color: theme.textSecondary, fontWeight: '600', flex: 1 },
    presetDims: { fontSize: 9, color: theme.textMuted },
    customDimRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    dimInputGroup: { flex: 1 },
    dimInputLabel: { fontSize: 11, color: theme.textMuted, fontWeight: '600', marginBottom: 4 },
    dimInput: { backgroundColor: theme.surfaceHigh, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.surfaceBorder, fontFamily: 'monospace' },
    dimPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, backgroundColor: theme.surfaceHigh },
    dimPreviewText: { fontSize: 12, color: theme.textMuted, fontWeight: '600', fontFamily: 'monospace' },
    // Folder
    colorLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
    colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
    colorDotActive: { borderColor: theme.textPrimary, transform: [{ scale: 1.15 }] },
    // Context menu
    contextMenu: { position: 'absolute', top: '30%', left: 32, right: 32, backgroundColor: theme.surface, borderRadius: 18, padding: 8, borderWidth: 1, borderColor: theme.surfaceBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 20 },
    contextTitle: { fontSize: 12, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },
    contextItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
    contextItemText: { fontSize: 15, color: theme.textPrimary, fontWeight: '500' },
    contextDivider: { height: 1, backgroundColor: theme.surfaceBorder, marginVertical: 4, marginHorizontal: 8 },
    moveOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder },
    moveOptionText: { fontSize: 16, color: theme.textPrimary, fontWeight: '500' },
  });
}
