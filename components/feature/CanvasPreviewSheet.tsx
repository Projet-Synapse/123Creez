// Feuille d'aperçu d'une toile : vignette en grand + infos, puis « Ouvrir ».
// Le tap sur une carte de la galerie affiche cet écran au lieu d'ouvrir
// directement l'espace de travail.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import CanvasThumb from '@/components/feature/CanvasThumb';
import { buildCanvasPreview } from '@/services/canvasPreview';
import { formatDrawingTime, getCanvasStorageBytes, loadCanvas, type CanvasMeta, type Folder } from '@/services/vaultService';

interface CanvasPreviewSheetProps {
  meta: CanvasMeta | null;
  folders: Folder[];
  onClose: () => void;
  onOpen: () => void;
}

const CanvasPreviewSheet: React.FC<CanvasPreviewSheetProps> = ({ meta, folders, onClose, onOpen }) => {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [layerCount, setLayerCount] = useState<number | null>(null);
  const [dataBytes, setDataBytes] = useState<number | null>(null);
  const canvasId = meta?.id ?? null;

  useEffect(() => {
    if (!canvasId) {
      setLayerCount(null);
      setDataBytes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [data, bytes] = await Promise.all([
          loadCanvas(canvasId),
          getCanvasStorageBytes(canvasId),
        ]);
        if (cancelled) return;
        setLayerCount(data?.layers.length ?? null);
        setDataBytes(bytes);
      } catch {
        if (!cancelled) {
          setLayerCount(null);
          setDataBytes(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [canvasId]);

  const folderName = meta?.folderId
    ? (folders.find(f => f.id === meta.folderId)?.name ?? null)
    : null;
  const drawingTimeLabel = meta?.drawingTime && meta.drawingTime > 0
    ? formatDrawingTime(meta.drawingTime)
    : null;
  const info = meta
    ? buildCanvasPreview(meta, { folderName, layerCount, dataBytes, drawingTimeLabel })
    : null;

  const maxThumbW = Math.max(160, winW - 48);
  const maxThumbH = Math.max(160, Math.round(winH * 0.42));
  const ratio = meta ? meta.width / Math.max(1, meta.height) : 1;
  let thumbW = maxThumbW;
  let thumbH = Math.round(thumbW / ratio);
  if (thumbH > maxThumbH) {
    thumbH = maxThumbH;
    thumbW = Math.round(thumbH * ratio);
  }

  return (
    <Modal
      visible={meta != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityLabel="Fermer l'aperçu"
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(16, insets.bottom + 8), paddingTop: Math.max(12, insets.top) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Fermer l'aperçu"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="close" size={22} color={theme.textPrimary} />
            </Pressable>
          </View>

          {meta && info ? (
            <>
              <View style={[styles.thumbWrap, { width: thumbW, height: thumbH }]}>
                <CanvasThumb meta={meta} width={thumbW} height={thumbH} fit="none" />
              </View>
              <Text style={styles.title} numberOfLines={2}>{info.name}</Text>
              <ScrollView style={styles.rows} contentContainerStyle={styles.rowsInner} bounces={false}>
                {info.rows.map(row => (
                  <View key={row.key} style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowValue}>{row.value}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.actions}>
                <Pressable
                  style={styles.openBtn}
                  onPress={onOpen}
                  accessibilityLabel="Ouvrir la toile dans l'espace de travail"
                  accessibilityRole="button"
                >
                  <Text style={styles.openBtnText}>Ouvrir</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color="#0d0d0d" />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
};

function makeStyles(theme: any) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    sheet: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      paddingHorizontal: 16,
      maxHeight: '92%',
      borderWidth: 1,
      borderColor: theme.surfaceBorder,
    },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
    closeBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.surfaceHigh,
    },
    thumbWrap: {
      alignSelf: 'center',
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.surfaceBorder,
      backgroundColor: theme.surfaceHigh,
      marginTop: 8,
    },
    title: {
      fontSize: 20, fontWeight: '700', color: theme.textPrimary,
      textAlign: 'center', marginTop: 14, marginBottom: 8,
    },
    rows: { flexGrow: 0, maxHeight: 220 },
    rowsInner: { paddingVertical: 4 },
    row: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.surfaceBorder,
    },
    rowLabel: { fontSize: 13, color: theme.textMuted, fontWeight: '600' },
    rowValue: { fontSize: 13, color: theme.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
    openBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 48, paddingHorizontal: 20, borderRadius: 12,
      backgroundColor: theme.accent,
    },
    openBtnText: { fontSize: 15, fontWeight: '700', color: '#0d0d0d' },
  });
}

export default CanvasPreviewSheet;
