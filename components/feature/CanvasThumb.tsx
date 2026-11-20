// Vignette d'une toile dans les cartes du vault.
//
// On n'ouvre PLUS le JSON complet de la toile (calques, images base64,
// tous les traits) pour chaque carte : si une vignette JPEG basse
// résolution est à jour, on l'affiche directement. Sinon un placeholder,
// et une file d'attente génère la vignette en arrière-plan.
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CanvasMeta } from '@/services/vaultService';
import { isThumbFresh } from '@/services/galleryThumb';
import { enqueueGalleryThumb } from '@/services/galleryThumbRefresh';

interface CanvasThumbProps {
  meta: CanvasMeta;
  /** Taille rendue de l'aperçu (px) — la toile s'y adapte (cover). Si
      absentes, le conteneur est mesuré au layout (cellules en %). */
  width?: number;
  height?: number;
  /** 'none' : la carte (au ratio de la toile) montre la toile ENTIÈRE sans
      rognage ; 'slice' : remplit et rogne (mosaïque décorative). */
  fit?: 'none' | 'slice';
  style?: Record<string, unknown> | object;
}

const CanvasThumb: React.FC<CanvasThumbProps> = ({ meta, width, height, fit = 'slice', style }) => {
  const fresh = isThumbFresh(meta);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const frameW = width ?? measured?.w ?? 0;
  const frameH = height ?? measured?.h ?? 0;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setMeasured(prev => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
  };

  useEffect(() => {
    if (fresh) return;
    enqueueGalleryThumb({
      id: meta.id,
      updatedAt: meta.updatedAt,
      thumbnail: meta.thumbnail,
      thumbAt: meta.thumbAt,
      width: meta.width,
      height: meta.height,
    });
  }, [fresh, meta.id, meta.updatedAt, meta.thumbnail, meta.thumbAt, meta.width, meta.height]);

  return (
    <View style={[styles.frame, width != null && { width }, height != null && { height }, style]} onLayout={onLayout}>
      {fresh && meta.thumbnail && frameW > 0 && frameH > 0 ? (
        <Image
          source={{ uri: meta.thumbnail }}
          style={{ width: frameW, height: frameH }}
          resizeMode={fit === 'slice' ? 'cover' : 'contain'}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: meta.thumbnailColor || '#ffffff' }]}>
          {meta.strokeCount === 0 ? (
            <MaterialCommunityIcons name="brush" size={30} color="#9aa0a6" />
          ) : (
            <View style={styles.info}>
              <Text style={styles.strokeCount}>{meta.strokeCount}</Text>
              <Text style={styles.dims}>{meta.width}×{meta.height}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  info: { alignItems: 'center' },
  strokeCount: { fontSize: 16, fontWeight: '700', color: '#555' },
  dims: { fontSize: 10, color: '#777', marginTop: 2 },
});

export default React.memo(CanvasThumb);
