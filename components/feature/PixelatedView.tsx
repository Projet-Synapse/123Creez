// Vue pixélisée (Android / iOS), affichage seul, jamais exportée.
//
// Rendue dans l'ESPACE ÉCRAN, hors de l'Animated.View zoomée. Sinon, la
// transformation native (scale) agrandissait la texture Skia en bilinéaire
// et rendait l'image floue. Ici, translation et zoom sont appliqués DANS
// Skia, à partir des mêmes shared values que le Svg, avec un échantillonnage
// « plus proche voisin ».
//
// L'instantané (services/pixelSnapshot.ts) fait déjà un pixel par pixel de
// document : il est seulement agrandi. La transformation est calée sur les
// pixels physiques de l'écran (services/pixelGrid.ts) : chaque pixel de
// document devient un carré uni à bord franc (8 ou 9 px à 860 %, jamais une
// frange de couleur mélangée).
import React from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import { Canvas, Group, Image, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { pixelAlignedTransform } from '@/services/pixelGrid';
import type { PixelSnapshot } from '@/services/pixelSnapshot';

export interface PixelatedViewProps {
  /** Image Skia de docW × docH px (natif). */
  source: PixelSnapshot;
  width: number;
  height: number;
  docW: number;
  docH: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
}

export default function PixelatedView({
  source, width, height, docW, docH, translateX, translateY, scale,
}: PixelatedViewProps) {
  const rasterW = source.width();
  const rasterH = source.height();
  const pr = PixelRatio.get();
  // Même placement que l'Animated.View (translate puis scale autour du
  // centre de la zone, viewBox « meet »), arrondi au pixel physique.
  const transform = useDerivedValue(() => {
    const t = pixelAlignedTransform(
      width, height, docW, docH, rasterW, rasterH,
      translateX.value, translateY.value, scale.value, pr,
    );
    return [
      { translateX: t.x },
      { translateY: t.y },
      { scaleX: t.sx },
      { scaleY: t.sy },
    ];
  });
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group transform={transform}>
        <Image
          image={source}
          x={0}
          y={0}
          width={rasterW}
          height={rasterH}
          fit="fill"
          sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
        />
      </Group>
    </Canvas>
  );
}
