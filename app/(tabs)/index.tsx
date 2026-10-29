// Powered by OnSpace.AI
import { effectiveFolderId } from '@/services/syncDecide';
import { SyncPausedBanner } from '@/components/feature/SyncJournal';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Text, Pressable, TextInput,
  FlatList, ScrollView, Modal, ActivityIndicator, Image,
  PanResponder, GestureResponderEvent, PanResponderGestureState, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FontSize } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVault } from '@/hooks/useVault';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readImageSize } from '@/services/vaultFolderService';
import { useTheme } from '@/hooks/useTheme';
import { useAlert } from '@/template';
import { CanvasMeta, Folder, FolderPreviewMode, loadCanvas } from '@/services/vaultService';
import CanvasThumb from '@/components/feature/CanvasThumb';

const FOLDER_COLORS = ['#4ecdc4', '#ff6b6b', '#ffd700', '#6bcb77', '#7c4dff', '#ff8800', '#00b0ff', '#f48fb1'];

// ─── Canvas dimension presets ─────────────────────────────────────────────────
interface DimPreset {
  label: string;
  width: number;
  height: number;
  icon: string;
}

type SortMode = 'manual' | 'updated' | 'name' | 'created';
type ViewSize = 'compact' | 'medium' | 'large';

const SORT_MODES: { id: SortMode; label: string; icon: string }[] = [
  { id: 'manual', label: 'Manuel', icon: 'cursor-move' },
  { id: 'updated', label: 'Récent', icon: 'clock-outline' },
  { id: 'name', label: 'Nom', icon: 'sort-alphabetical-ascending' },
  { id: 'created', label: 'Création', icon: 'calendar-plus' },
];

const VIEW_SIZES: { id: ViewSize; label: string; columns: number; icon: string }[] = [
  { id: 'compact', label: 'Compact', columns: 4, icon: 'view-comfy' },
  { id: 'medium', label: 'Moyen', columns: 3, icon: 'view-grid-outline' },
  { id: 'large', label: 'Grand', columns: 2, icon: 'view-dashboard-outline' },
];

const FOLDER_PREVIEW_LABELS: Record<FolderPreviewMode, string> = {
  recent: 'Dernière toile',
  mosaic: 'Mosaïque 2×2',
  classic: 'Icône seule',
};

const DIM_PRESETS: DimPreset[] = [
  { label: 'Portrait HD', width: 1080, height: 1920, icon: 'cellphone' },
  { label: 'Paysage HD', width: 1920, height: 1080, icon: 'monitor' },
  { label: 'Carré', width: 1080, height: 1080, icon: 'square-outline' },
  { label: 'A4 Portrait', width: 794, height: 1123, icon: 'file-outline' },
  { label: 'A4 Paysage', width: 1123, height: 794, icon: 'rotate-left' },
  { label: '2K', width: 2560, height: 1440, icon: 'television' },
  { label: 'Vignette', width: 400, height: 400, icon: 'image-filter-frames' },
  { label: 'Personnalisé', width: 0, height: 0, icon: 'pencil-ruler' },
];

interface CardLayout {
  x: number; y: number; width: number; height: number;
}

const GRID_GAP = 10;

// ─── Shared card gesture handling ─────────────────────────────────────────────
// Souris ET tactile : l'appui immobile est capté dès le doigt posé — un
// relâchement sans mouvement est le TAP (ouvre la toile), ~550 ms sans
// bouger ouvre le menu. Le scroll vertical reprend la main tant qu'aucun
// drag horizontal n'a démarré (les flicks continuent de faire défiler la
// grille) ; une fois le drag commencé, il peut partir dans tous les sens.
// Callbacks through refs to dodge stale closures.
interface CardGesturesOpts {
  onTap: () => void;
  onLongPress: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}

function useCardGestures(opts: CardGesturesOpts) {
  const cb = useRef(opts);
  cb.current = opts;
  const moved = useRef(false);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  return useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: (e: GestureResponderEvent) => {
      // Mouse: claim immediately (the wheel scrolls, and nested Pressables
      // would otherwise hold the responder and block the steal on move).
      return ((e.nativeEvent as any)?.type ?? '').startsWith('mouse');
    },
    // Touch: claim on finger-down TOO — sans ça, un tap immobile n'était
    // jamais remis à la carte (release non reçue) et n'ouvrait rien sur
    // Android ; le scroll vertical repasse par TerminationRequest.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
      // Touch path (mouse already claimed on start): horizontal-first, or any
      // direction once held — quick flicks keep scrolling the page.
      const dist = Math.hypot(g.dx, g.dy);
      const held = Date.now() - startedAt.current > 300;
      return (Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy)) || (held && dist > 10);
    },
    onPanResponderGrant: () => {
      startedAt.current = Date.now();
      moved.current = false;
      lpTimer.current = setTimeout(() => {
        if (!moved.current) cb.current.onLongPress();
      }, 550);
    },
    onPanResponderMove: (e, g) => {
      if (!moved.current && Math.hypot(g.dx, g.dy) > 8) {
        moved.current = true;
        if (lpTimer.current) clearTimeout(lpTimer.current);
        cb.current.onDragStart();
      }
      if (moved.current) {
        cb.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      }
    },
    onPanResponderRelease: () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
      if (!moved.current) cb.current.onTap();
      else cb.current.onDragEnd();
    },
    onPanResponderTerminate: () => {
      // The scroll view stole the gesture (touch scroll): neither a tap nor
      // a drag — just clean up.
      if (lpTimer.current) clearTimeout(lpTimer.current);
      if (moved.current) cb.current.onDragEnd();
      moved.current = false;
    },
    onPanResponderTerminationRequest: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
      // Scroll vertical : il garde la main tant qu'aucun drag (horizontal ou
      // appui long tenu) n'a réellement commencé.
      const held = Date.now() - startedAt.current > 300;
      return !moved.current && !held
        && !(Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy));
    },
  })).current;
}

interface DragState {
  kind: 'canvas' | 'folder';
  id: string;
  name: string;
  thumb?: string;
  x: number;
  y: number;
  active: boolean;
}

// ─── Canvas card: framed preview + title below ────────────────────────────────
const CanvasCard = React.memo(function CanvasCard({
  item, thumbH, thumbW, cellWidth, styles, theme,
  isDragging, isHovered, renamingName,
  onTap, onLongPress, onDragStart, onDragMove, onDragEnd,
  onOpen, onMenu, onRenameSubmit, onRenameChange,
  registerLayout,
}: {
  item: CanvasMeta;
  thumbH: number;
  thumbW: number;
  cellWidth: number;
  styles: any;
  theme: any;
  isDragging: boolean;
  isHovered: boolean;
  renamingName: string | null;
  onTap: () => void;
  onLongPress: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMenu: () => void;
  onRenameSubmit: () => void;
  onRenameChange: (name: string) => void;
  registerLayout: (l: CardLayout) => void;
}) {
  const viewRef = useRef<View>(null);
  const gestures = useCardGestures({
    onTap,
    onLongPress,
    onDragStart,
    onDragMove,
    onDragEnd,
  });

  return (
    <View
      ref={viewRef}
      style={[styles.canvasCell, { width: cellWidth }, isDragging && { opacity: 0.35 }]}
      onLayout={() => {
        viewRef.current?.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) =>
          registerLayout({ x: px, y: py, width: w, height: h }));
      }}
    >
      <View style={styles.canvasCard}>
        {/* Gesture area: thumb + texts. The menu button stays OUTSIDE so its
            press is never swallowed by the drag responder. */}
        <View {...(renamingName !== null ? {} : gestures.panHandlers)}>
          <View style={[styles.canvasFrame, { height: thumbH }, isHovered && { borderColor: theme.accent, borderWidth: 2 }]}>
            <CanvasThumb meta={item} width={thumbW} height={thumbH} fit="none" />
          </View>
          {renamingName !== null ? (
            <TextInput
              style={styles.inlineInput}
              value={renamingName}
              onChangeText={onRenameChange}
              onSubmitEditing={onRenameSubmit}
              onBlur={onRenameSubmit}
              autoFocus
            />
          ) : (
            <Text style={styles.canvasName} numberOfLines={1}>{item.name}</Text>
          )}
          <Text style={styles.canvasMetaLine}>
            {new Date(item.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
            {' · '}{item.width} × {item.height}
          </Text>
        </View>
        <Pressable style={styles.cardMoreBtn} onPress={onMenu} hitSlop={8}>
          <MaterialCommunityIcons name="dots-vertical" size={16} color="#444" />
        </Pressable>
      </View>
    </View>
  );
});

// ─── Folder card: per-folder preview mode ─────────────────────────────────────
const FolderCard = React.memo(function FolderCard({
  item, previewThumbs, count, isActive, isDropTarget, styles, theme,
  onTap, onLongPress, onDragStart, onDragMove, onDragEnd, registerLayout,
}: {
  item: Folder;
  previewThumbs: CanvasMeta[];
  count: number;
  isActive: boolean;
  isDropTarget: boolean;
  styles: any;
  theme: any;
  onTap: () => void;
  onLongPress: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  registerLayout: (l: CardLayout) => void;
}) {
  const viewRef = useRef<View>(null);
  const gestures = useCardGestures({ onTap, onLongPress, onDragStart, onDragMove, onDragEnd });

  const mode: FolderPreviewMode = item.previewMode ?? 'recent';
  const hasPreview = count > 0;

  const body = !hasPreview || mode === 'classic' ? (
    <MaterialCommunityIcons name="folder" size={30} color={item.color} />
  ) : mode === 'mosaic' ? (
    <View style={styles.folderMosaic}>
      {[0, 1, 2, 3].map(i => {
        const t = previewThumbs[i];
        return t
          ? <CanvasThumb key={t.id} meta={t} style={styles.folderMosaicCell} />
          : <View key={i} style={[styles.folderMosaicCell, styles.folderMosaicEmpty]} />;
      })}
    </View>
  ) : (
    previewThumbs[0]
      ? <CanvasThumb meta={previewThumbs[0]} style={styles.folderPreviewImg} />
      : null
  );

  const showScrim = hasPreview && mode !== 'classic';

  return (
    <View
      ref={viewRef}
      {...gestures.panHandlers}
      onLayout={() => {
        viewRef.current?.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) =>
          registerLayout({ x: px, y: py, width: w, height: h }));
      }}
    >
      <View
        style={[
          styles.folderCard,
          isActive && { borderColor: item.color, borderWidth: 2 },
          isDropTarget && { borderColor: theme.accent, borderWidth: 2 },
        ]}>
        {body}
        {showScrim && (
          <View style={styles.folderScrim}>
            <MaterialCommunityIcons name="folder" size={13} color={item.color} />
            <Text style={styles.folderNameOnImage} numberOfLines={1}>{item.name}</Text>
          </View>
        )}
        {!showScrim && (
          <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
        )}
        <Text style={[styles.folderCount, showScrim && styles.folderCountOverlay]}>
          {count} toile{count !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
});

export default function VaultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const { width: winW } = useWindowDimensions();
  const {
    canvases, folders, loading, createCanvas, removeCanvas, renameCanvas,
    moveCanvas, duplicateCanvas, createFolder, renameFolder, removeFolder,
    reorderCanvases, reorderFolders, setFolderPreview,
    loadCanvasData, createImageCanvas,
  } = useVault();

  const [activeFolderId, setActiveFolderId] = useState<string | 'root'>('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [viewSize, setViewSize] = useState<ViewSize>('medium');
  const [showNewCanvas, setShowNewCanvas] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingCanvasId, setMovingCanvasId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [contextMenu, setContextMenu] = useState<{ type: 'canvas' | 'folder'; id: string } | null>(null);
  const [renaming, setRenaming] = useState<{ type: 'canvas' | 'folder'; id: string; name: string } | null>(null);

  // ─── Drag & drop state ────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverFolderId, setHoverFolderId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const cardLayouts = useRef(new Map<string, CardLayout>());
  // Drop intent is tracked in a plain ref mutated synchronously during the
  // drag: at 200 px/frame the mouseup can land before React commits the
  // hover state, so state-mirrored refs would read stale (null) values.
  const dropIntent = useRef<{ folderId: string | null; index: number | null; active: boolean }>({
    folderId: null, index: null, active: false,
  });
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const hoverFolderRef = useRef<string | null>(null);
  hoverFolderRef.current = hoverFolderId;
  const hoverIndexRef = useRef<number | null>(null);
  hoverIndexRef.current = hoverIndex;
  const visibleRef = useRef<CanvasMeta[]>([]);
  const rootFoldersRef = useRef<Folder[]>([]);
  const handleDragEndRef = useRef<(kind: 'canvas' | 'folder', id: string) => void>(() => { });

  // Canvas dimensions
  const [selectedPreset, setSelectedPreset] = useState<DimPreset>(DIM_PRESETS[0]);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [dimStep, setDimStep] = useState<'dims' | 'name'>('dims');
  // Fond transparent (damier) demandé pour la toile importée en cours.
  const [importTransparent, setImportTransparent] = useState(false);
  // Import d’image à la création : dataURL + dimensions de l’image source.
  const [importedSrc, setImportedSrc] = useState<string | null>(null);
  const [importedDims, setImportedDims] = useState<{ w: number; h: number } | null>(null);

  const styles = makeStyles(theme);

  // Restore the preferred card size once.
  useEffect(() => {
    AsyncStorage.getItem('vault:viewSize').then(v => {
      if (v === 'compact' || v === 'medium' || v === 'large') setViewSize(v);
    }).catch(() => { });
  }, []);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Sorting: "Manuel" follows the drag & drop order, the others behave as
  // before. Sorting applies uniformly wherever a canvas list is shown.
  const sortCanvases = useCallback((list: CanvasMeta[]) => {
    const sorted = [...list];
    if (sortMode === 'manual') sorted.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt);
    else if (sortMode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt);
    else sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted;
  }, [sortMode]);

  const cycleSortMode = useCallback(() => {
    setSortMode(prev => {
      const idx = SORT_MODES.findIndex(m => m.id === prev);
      return SORT_MODES[(idx + 1) % SORT_MODES.length].id;
    });
  }, []);

  const cycleViewSize = useCallback(() => {
    setViewSize(prev => {
      const idx = VIEW_SIZES.findIndex(v => v.id === prev);
      const next = VIEW_SIZES[(idx + 1) % VIEW_SIZES.length].id;
      AsyncStorage.setItem('vault:viewSize', next).catch(() => { });
      return next;
    });
  }, []);

  // A search looks across every canvas regardless of folder — finding a
  // canvas by name shouldn't require remembering which folder it's in.
  const searchResults = isSearching
    ? sortCanvases(canvases.filter(c => c.name.toLowerCase().includes(trimmedQuery)))
    : [];

  // Une toile dont le dossier n'existe pas localement (reçue avant lui) est
  // affichée à la racine au lieu d'être invisible.
  const folderIdSet = new Set(folders.map(f => f.id));
  const visibleCanvases = sortCanvases(canvases.filter(c => {
    const fid = effectiveFolderId(c.folderId, folderIdSet);
    return activeFolderId === 'root' ? fid === null : fid === activeFolderId;
  }));
  visibleRef.current = visibleCanvases;
  const rootFolders = folders
    .filter(f => effectiveFolderId(f.parentId, folderIdSet) === null)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt);
  rootFoldersRef.current = rootFolders;
  const activeSortMode = SORT_MODES.find(m => m.id === sortMode)!;
  const activeView = VIEW_SIZES.find(v => v.id === viewSize)!;

  // Grid geometry: card width from the chosen density, thumbnail height from
  // the canvas aspect ratio (clamped so extreme formats stay usable).
  const contentW = Math.min(winW, 1400) - 32;
  const numColumns = activeView.columns;
  const colW = Math.floor((contentW - numColumns * GRID_GAP) / numColumns);
  // L'aperçu épouse le ratio de la toile (portrait haut, paysage bas),
  // borné pour que les formats extrêmes restent lisibles. La base est la
  // largeur RÉELLE du cadre (colW - 18 : padding 8×2 + bordures) — sinon
  // le ratio du cadre diffère de celui du contenu et l'image se déforme.
  const thumbHFor = useCallback((item: CanvasMeta) => {
    const thumbW = colW - 18;
    const aspect = item.width > 0 ? item.width / item.height : 1;
    return Math.round(Math.min(thumbW * 2.2, Math.max(thumbW * 0.55, thumbW / aspect)));
  }, [colW]);

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
    setImportedSrc(null);
    setImportedDims(null);
    setShowNewCanvas(true);
  }, []);

  // Import d’image : picker (type image) -> dataURL (PNG conservé, donc
  // transparence préservée) -> dimensions -> étape nom. Chaque étape est
  // journalisée (console.error passe dans logcat même en release, balise
  // ReactNativeJS) : un échec silencieux ici était indébogable côté mobile.
  const handlePickImage = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: false,
        // true (défaut) : le fichier est copié dans le cache de l'app et
        // l'URI renvoyé est un file:// lisible directement — sur Android le
        // content:// du sélecteur système dépend de permissions temporaires.
        copyToCacheDirectory: true,
      });
      console.error('[import] picker renvoyé:', JSON.stringify({
        canceled: result.canceled,
        assets: result.assets?.map((a) => ({ uri: a.uri?.slice(0, 48), mimeType: a.mimeType, size: a.size })),
      }));
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      let src = asset.uri;
      if (!src) return;
      if (!src.startsWith('data:')) {
        // Natif : le picker renvoie un fichier local (file:// ou content://),
        // pas un dataURL comme sur web — on lit le fichier en base64 pour
        // retomber sur le format unique (rendu, vignette, sync). PNG
        // conservé, donc transparence préservée.
        console.error('[import] lecture base64 de', src.slice(0, 48));
        const base64 = await FileSystem.readAsStringAsync(src, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.error('[import] base64 lu, longueur', base64.length);
        src = `data:${asset.mimeType || 'image/png'};base64,${base64}`;
      }
      const dims = await readImageSize(src);
      console.error('[import] dimensions', dims.width, 'x', dims.height);
      setImportedSrc(src);
      setImportedDims({ w: dims.width, h: dims.height });
      setDimStep('name');
    } catch (error) {
      // pick annulé ou fichier illisible : on reste sur la modale telle
      // quelle — mais l'erreur part dans logcat pour le diagnostic.
      console.error('[import] échec:', error);
    }
  }, []);

  const handleCreateCanvas = useCallback(async () => {
    const name = newName.trim() || (importedSrc ? 'Toile importée' : 'Toile sans titre');
    if (importedSrc) {
      const id = await createImageCanvas(name, importedSrc, importTransparent);
      setImportedSrc(null);
      setImportedDims(null);
      setImportTransparent(false);
      setShowNewCanvas(false);
      setNewName('');
      if (id) router.push(`/editor/${id}`);
      return;
    }
    const folderId = activeFolderId === 'root' ? null : activeFolderId;
    const { w, h } = getCanvasDims();
    const id = await createCanvas(name, folderId, w, h);
    setShowNewCanvas(false);
    setNewName('');
    router.push(`/editor/${id}`);
  }, [newName, activeFolderId, createCanvas, router, selectedPreset, customWidth, customHeight, importedSrc, importTransparent, createImageCanvas]);

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

  const handleOpenCanvas = useCallback((id: string) => {
    router.push(`/editor/${id}`);
  }, [router]);

  // ─── Drag & drop resolution ───────────────────────────────────────
  const resolveDragMove = useCallback((kind: 'canvas' | 'folder', id: string, x: number, y: number) => {
    if (kind !== 'canvas') {
      dropIntent.current = { folderId: null, index: null, active: true };
      setHoverFolderId(null); setHoverIndex(null);
      return;
    }
    dropIntent.current.active = true;

    // Folder under the pointer wins (drop canvas INTO folder).
    let folderHit: string | null = null;
    for (const f of rootFoldersRef.current) {
      const l = cardLayouts.current.get(`folder:${f.id}`);
      if (l && x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
        folderHit = f.id;
        break;
      }
    }
    if (folderHit) {
      dropIntent.current.folderId = folderHit;
      dropIntent.current.index = null;
      setHoverFolderId(folderHit);
      setHoverIndex(null);
      return;
    }

    // Otherwise find the hovered canvas slot for a reorder.
    let idx: number | null = null;
    for (let i = 0; i < visibleRef.current.length; i++) {
      const c = visibleRef.current[i];
      if (c.id === id) continue;
      const l = cardLayouts.current.get(`canvas:${c.id}`);
      if (l && x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
        idx = i;
        break;
      }
    }
    dropIntent.current.folderId = null;
    dropIntent.current.index = idx;
    setHoverFolderId(null);
    setHoverIndex(idx);
  }, []);

  const resolveDragEnd = useCallback((kind: 'canvas' | 'folder', id: string) => {
    const intent = dropIntent.current;
    dropIntent.current = { folderId: null, index: null, active: false };
    setDrag(null);
    setHoverFolderId(null);
    setHoverIndex(null);
    if (!intent.active) return;

    if (kind === 'canvas') {
      if (intent.folderId) {
        moveCanvas(id, intent.folderId);
        return;
      }
      const idx = intent.index;
      if (idx === null) return;
      const ids = visibleRef.current.map(c => c.id);
      const from = ids.indexOf(id);
      if (from === -1) return;
      ids.splice(from, 1);
      const insertAt = Math.max(0, Math.min(ids.length, idx > from ? idx - 1 : idx));
      ids.splice(insertAt, 0, id);
      setSortMode('manual');
      reorderCanvases(ids);
      return;
    }

    // Folder reorder
    const idx = intent.index;
    if (idx === null) return;
    const ids = rootFoldersRef.current.map(f => f.id);
    const from = ids.indexOf(id);
    if (from === -1) return;
    ids.splice(from, 1);
    const insertAt = Math.max(0, Math.min(ids.length, idx > from ? idx - 1 : idx));
    ids.splice(insertAt, 0, id);
    reorderFolders(ids);
  }, [moveCanvas, reorderCanvases, reorderFolders]);

  handleDragEndRef.current = resolveDragEnd;

  const makeCanvasCardProps = useCallback((item: CanvasMeta) => ({
    item,
    onTap: () => handleOpenCanvas(item.id),
    onLongPress: () => handleContextMenu('canvas', item.id),
    onDragStart: () => setDrag({
      kind: 'canvas' as const, id: item.id, name: item.name, thumb: item.thumbnail, x: 0, y: 0, active: false,
    }),
    onDragMove: (x: number, y: number) => {
      setDrag(prev => prev && prev.id === item.id ? { ...prev, x, y, active: true } : prev);
      resolveDragMove('canvas', item.id, x, y);
    },
    onDragEnd: () => resolveDragEnd('canvas', item.id),
    onOpen: () => handleOpenCanvas(item.id),
    onMenu: () => handleContextMenu('canvas', item.id),
    onRenameSubmit: handleRenameSubmit,
    onRenameChange: (n: string) => setRenaming(r => r && r.type === 'canvas' && r.id === item.id ? { ...r, name: n } : r),
  }), [handleOpenCanvas, handleContextMenu, handleRenameSubmit, resolveDragMove, resolveDragEnd]);

  const makeFolderCardProps = useCallback((item: Folder, previewThumbs: CanvasMeta[], count: number) => ({
    item,
    previewThumbs,
    count,
    onTap: () => setActiveFolderId(item.id),
    onLongPress: () => handleContextMenu('folder', item.id),
    onDragStart: () => setDrag({ kind: 'folder' as const, id: item.id, name: item.name, x: 0, y: 0, active: false }),
    onDragMove: (x: number, y: number) => {
      setDrag(prev => prev && prev.id === item.id ? { ...prev, x, y, active: true } : prev);
      resolveDragMove('folder', item.id, x, y);
    },
    onDragEnd: () => resolveDragEnd('folder', item.id),
  }), [handleContextMenu, resolveDragMove, resolveDragEnd]);

  const contextItem = contextMenu
    ? (contextMenu.type === 'canvas'
      ? canvases.find(c => c.id === contextMenu.id)
      : folders.find(f => f.id === contextMenu.id))
    : null;

  const { w: previewW, h: previewH } = showNewCanvas ? getCanvasDims() : { w: 1, h: 1 };

  const renderCanvasItem = useCallback(({ item }: { item: CanvasMeta }) => (
    <CanvasCard
      {...makeCanvasCardProps(item)}
      thumbH={thumbHFor(item)}
      thumbW={colW - 18}
      cellWidth={colW + GRID_GAP}
      styles={styles}
      theme={theme}
      isDragging={drag?.kind === 'canvas' && drag.id === item.id && drag.active}
      isHovered={!!(drag?.active && hoverIndex !== null && visibleCanvases[hoverIndex]?.id === item.id)}
      renamingName={renaming?.type === 'canvas' && renaming.id === item.id ? renaming.name : null}
      registerLayout={(l) => cardLayouts.current.set(`canvas:${item.id}`, l)}
    />
  ), [makeCanvasCardProps, thumbHFor, colW, styles, theme, drag, hoverIndex, visibleCanvases, renaming]);

  const renderFolderItem = useCallback(({ item }: { item: Folder }) => {
    const contained = canvases
      .filter(c => c.folderId === item.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return (
      <FolderCard
        {...makeFolderCardProps(item, contained.slice(0, 4), contained.length)}
        isActive={activeFolderId === item.id}
        isDropTarget={!!(drag?.active && drag.kind === 'canvas' && hoverFolderId === item.id)}
        styles={styles}
        theme={theme}
        registerLayout={(l) => cardLayouts.current.set(`folder:${item.id}`, l)}
      />
    );
  }, [canvases, makeFolderCardProps, activeFolderId, drag, hoverFolderId, styles, theme]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style={theme.statusBarStyle} />
      <SyncPausedBanner />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="brush-variant" size={22} color={theme.accent} />
          <Text style={styles.appTitle}>123Créez</Text>
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

      {/* Sort + View controls */}
      {canvases.length > 1 && (
        <View style={styles.controlsRow}>
          <Pressable
            style={[styles.sortBtn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }]}
            onPress={cycleSortMode}
          >
            <MaterialCommunityIcons name={activeSortMode.icon as any} size={14} color={theme.textSecondary} />
            <Text style={styles.sortBtnText}>Trier : {activeSortMode.label}</Text>
          </Pressable>
          <Pressable
            style={[styles.sortBtn, { backgroundColor: theme.surfaceHigh, borderColor: theme.surfaceBorder }]}
            onPress={cycleViewSize}
          >
            <MaterialCommunityIcons name={activeView.icon as any} size={14} color={theme.textSecondary} />
            <Text style={styles.sortBtnText}>Affichage : {activeView.label}</Text>
          </Pressable>
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
                renderItem={renderCanvasItem}
                numColumns={numColumns}
                key={`search-${numColumns}`}
                scrollEnabled={false}
                contentContainerStyle={styles.canvasGrid}
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
                  renderItem={renderFolderItem}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.foldersRow}
                  scrollEnabled={rootFolders.length > 4}
                />
              </>
            )}

            {/* Canvas grid */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {activeFolderId === 'root' ? 'Toutes les toiles' : folders.find(f => f.id === activeFolderId)?.name ?? 'Toiles'}
              </Text>
              <Text style={styles.sectionCount}>{visibleCanvases.length}</Text>
            </View>

            {visibleCanvases.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="brush" size={56} color={theme.textMuted} />
                <Text style={styles.emptyTitle}>Aucune toile</Text>
                <Text style={styles.emptySubtitle}>Créez votre première toile pour commencer</Text>
              </View>
            ) : (
              <FlatList
                data={visibleCanvases}
                keyExtractor={c => c.id}
                renderItem={renderCanvasItem}
                numColumns={numColumns}
                key={`grid-${numColumns}`}
                scrollEnabled={false}
                contentContainerStyle={styles.canvasGrid}
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

      {/* Drag ghost */}
      <Modal visible={!!drag?.active} transparent pointerEvents="none" animationType="fade">
        <View style={styles.dragGhostLayer}>
          <View style={[styles.dragGhost, { left: (drag?.x ?? 0) - 60, top: (drag?.y ?? 0) - 50 }]}>
            {drag?.thumb ? (
              <Image source={{ uri: drag.thumb }} style={styles.dragGhostThumb} />
            ) : (
              <View style={[styles.dragGhostThumb, styles.dragGhostPlaceholder]}>
                <MaterialCommunityIcons
                  name={drag?.kind === 'folder' ? 'folder' : 'brush'}
                  size={30}
                  color={theme.textMuted}
                />
              </View>
            )}
            <Text style={styles.dragGhostName} numberOfLines={1}>{drag?.name}</Text>
          </View>
        </View>
      </Modal>

      {/* ─── New Canvas Modal ─── */}
      <Modal visible={showNewCanvas} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewCanvas(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouvelle toile</Text>

            {dimStep === 'dims' ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.importBtn, { borderColor: theme.accent, backgroundColor: theme.activeGlow }, pressed && { opacity: 0.7 }]}
                  onPress={handlePickImage}
                >
                  <MaterialCommunityIcons name="image-plus" size={20} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.importBtnTitle, { color: theme.accent }]}>Importer une image</Text>
                    <Text style={[styles.importBtnSub, { color: theme.textMuted }]}>
                      PNG (transparence), JPG… — la toile prend la taille de l’image
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} />
                </Pressable>

                <Text style={styles.dimLabel}>Ou partir d’un format vierge</Text>
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
                <View style={[styles.dimPreview, { borderColor: theme.accent, marginBottom: 12 }]}>
                  <MaterialCommunityIcons name={importedSrc ? 'image-outline' : selectedPreset.icon as any} size={14} color={theme.accent} />
                  <Text style={[styles.dimPreviewText, { color: theme.accent }]}>
                    {importedSrc
                      ? `Image importée — ${importedDims ? `${importedDims.w}×${importedDims.h}` : ''} px`
                      : `${selectedPreset.label} — ${previewW}×${previewH} px`}
                  </Text>
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
                {importedSrc && (
                  <Pressable
                    style={[styles.importTransparentRow, { borderColor: theme.surfaceBorder }]}
                    onPress={() => setImportTransparent(v => !v)}
                  >
                    <View style={[styles.importTransparentBox, importTransparent && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      {importTransparent && <MaterialCommunityIcons name="check" size={14} color="#0d0d0d" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.importTransparentLabel, { color: theme.textPrimary }]}>Fond transparent (damier)</Text>
                      <Text style={[styles.importTransparentSub, { color: theme.textMuted }]}>
                        Pour une image avec zones transparentes — l’export PNG reste transparent
                      </Text>
                    </View>
                  </Pressable>
                )}
                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => { setImportedSrc(null); setImportedDims(null); setDimStep('dims'); }}>
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
                <Text style={styles.contextSectionLabel}>Aperçu du dossier</Text>
                {(['recent', 'mosaic', 'classic'] as FolderPreviewMode[]).map(mode => {
                  const current = (contextItem as Folder | undefined)?.previewMode ?? 'recent';
                  return (
                    <Pressable key={mode} style={styles.contextItem} onPress={() => {
                      setFolderPreview(contextMenu.id, mode);
                      setContextMenu(null);
                    }}>
                      <MaterialCommunityIcons
                        name={current === mode ? 'check-circle' : 'circle-outline'}
                        size={16}
                        color={current === mode ? theme.accent : theme.textMuted}
                      />
                      <Text style={styles.contextItemText}>{FOLDER_PREVIEW_LABELS[mode]}</Text>
                    </Pressable>
                  );
                })}
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
    controlsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
    sortBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 20, borderWidth: 1,
    },
    sortBtnText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    breadcrumbRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
    breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: theme.surfaceHigh },
    breadcrumbActive: { backgroundColor: theme.activeGlow },
    breadcrumbText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    sectionCount: { fontSize: 12, color: theme.textMuted, backgroundColor: theme.surfaceHigh, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontWeight: '600' },
    foldersRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
    // Folder cards — per-folder preview (recent / mosaic / classic)
    folderCard: {
      width: 150, height: 150, borderRadius: 14, backgroundColor: theme.cardBg,
      borderWidth: 1, borderColor: theme.surfaceBorder, alignItems: 'center', justifyContent: 'center', gap: 6,
      overflow: 'hidden',
    },
    folderPreviewImg: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
    folderMosaic: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, flexDirection: 'row', flexWrap: 'wrap' },
    folderMosaicCell: { width: '50%', height: '50%' },
    folderMosaicEmpty: { backgroundColor: 'rgba(0,0,0,0.08)' },
    folderScrim: {
      position: 'absolute', left: 0, right: 0, bottom: 20,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4,
    },
    folderNameOnImage: { fontSize: 12, color: '#ffffff', fontWeight: '600', flex: 1 },
    folderCountOverlay: {
      position: 'absolute', right: 6, top: 6, bottom: 'auto',
      backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff',
      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, overflow: 'hidden',
    },
    folderName: { fontSize: 12, color: theme.textPrimary, fontWeight: '600', textAlign: 'center', paddingHorizontal: 6 },
    folderCount: { fontSize: 10, color: theme.textMuted },
    // Canvas grid cards — a real framed preview with the title below
    canvasGrid: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    canvasCell: { paddingHorizontal: GRID_GAP / 2, marginBottom: GRID_GAP },
    canvasCard: {
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 8,
      borderWidth: 1, borderColor: theme.surfaceBorder,
    },
    canvasFrame: {
      borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.surfaceBorder,
      backgroundColor: theme.surfaceHigh, marginBottom: 8,
    },
    canvasThumbImg: { width: '100%', height: '100%' },
    canvasThumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    thumbInfo: { alignItems: 'center', gap: 2 },
    thumbStrokeCount: { fontSize: 13, color: '#555', fontWeight: '700' },
    thumbDims: { fontSize: 8, color: '#888' },
    cardMoreBtn: {
      position: 'absolute', top: 4, right: 4,
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center',
    },
    canvasName: { fontSize: 13, color: theme.textPrimary, fontWeight: '600', marginBottom: 2 },
    canvasMetaLine: { fontSize: 10, color: theme.textMuted },
    inlineInput: { fontSize: 13, color: theme.textPrimary, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: theme.accent, paddingVertical: 0 },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, gap: 10 },
    emptyTitle: { fontSize: 18, color: theme.textSecondary, fontWeight: '600' },
    emptySubtitle: { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
    fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', shadowColor: theme.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
    // Drag ghost
    dragGhostLayer: { flex: 1 },
    dragGhost: {
      position: 'absolute', width: 120, alignItems: 'center',
      backgroundColor: theme.surface, borderRadius: 12, padding: 6,
      borderWidth: 2, borderColor: theme.accent,
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 12,
    },
    dragGhostThumb: { width: 108, height: 80, borderRadius: 8, backgroundColor: theme.surfaceHigh },
    dragGhostPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    dragGhostName: { fontSize: 10, color: theme.textPrimary, fontWeight: '600', marginTop: 4, maxWidth: 108 },
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
    importTransparentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8,
  },
  importTransparentBox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  importTransparentLabel: { fontSize: 13, fontWeight: '600' },
  importTransparentSub: { fontSize: 11, marginTop: 1 },
  importBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 2,
    },
    importBtnTitle: {
      fontSize: FontSize.sm,
      fontWeight: '700',
    },
    importBtnSub: {
      fontSize: FontSize.xs,
      marginTop: 1,
    },
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
    contextMenu: { position: 'absolute', top: '12%', left: 32, right: 32, backgroundColor: theme.surface, borderRadius: 18, padding: 8, borderWidth: 1, borderColor: theme.surfaceBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 20 },
    contextTitle: { fontSize: 12, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },
    contextSectionLabel: { fontSize: 11, color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
    contextItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
    contextItemText: { fontSize: 15, color: theme.textPrimary, fontWeight: '500' },
    contextDivider: { height: 1, backgroundColor: theme.surfaceBorder, marginVertical: 4, marginHorizontal: 8 },
    moveOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder },
    moveOptionText: { fontSize: 16, color: theme.textPrimary, fontWeight: '500' },
  });
}
