// Aperçu direct d'une toile dans les cartes du vault.
//
// Avant : les vignettes étaient des JPEG générés par des API navigateur
// (canvas 2D) — absentes sur mobile natif, donc aucun aperçu sur Android.
// Désormais la carte rend la toile elle-même via le moteur SVG partagé
// (CanvasArt, natif), mise à l'échelle par viewBox. Le canvas data est chargé
// une fois et gardé en mémoire (clé id@updatedAt) pour éviter les relectures
// AsyncStorage à chaque défilement de la grille.
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CanvasArt } from '@/components/feature/CanvasArt';
import { loadCanvas, type CanvasMeta, type CanvasData } from '@/services/vaultService';

// Cache mémoire des aperçus : clé id@updatedAt. Assez petit pour rester
// borné (les plus anciennes entrées sont éjectées au-delà de 60 toiles).
const PREVIEW_LIMIT = 60;
const previewCache = new Map<string, CanvasData | 'missing'>();

function cacheKey(meta: CanvasMeta): string {
  return `${meta.id}@${meta.updatedAt}`;
}

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
  const key = cacheKey(meta);
  const [data, setData] = useState<CanvasData | 'missing' | null>(() => previewCache.get(key) ?? null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const frameW = width ?? measured?.w ?? 0;
  const frameH = height ?? measured?.h ?? 0;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setMeasured(prev => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
  };

  useEffect(() => {
    const cached = previewCache.get(key);
    if (cached) {
      if (cached !== data) setData(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await loadCanvas(meta.id);
        if (cancelled) return;
        const entry: CanvasData | 'missing' = raw ?? 'missing';
        if (previewCache.size >= PREVIEW_LIMIT) {
          const first = previewCache.keys().next().value;
          if (first) previewCache.delete(first);
        }
        previewCache.set(key, entry);
        setData(entry);
      } catch {
        if (!cancelled) setData('missing');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loaded = data && data !== 'missing' ? data : null;

  return (
    <View style={[styles.frame, width != null && { width }, height != null && { height }, style]} onLayout={onLayout}>
      {loaded && frameW > 0 && frameH > 0 ? (
        <CanvasArt
          layers={loaded.layers}
          width={frameW}
          height={frameH}
          contentWidth={meta.width}
          contentHeight={meta.height}
          variant={`thumb-${meta.id}-${meta.updatedAt}`}
          bg={meta.transparentBg ? 'checker' : '#ffffff'}
          preserveAspect={fit}
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
