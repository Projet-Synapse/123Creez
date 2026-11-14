// Vue pixélisée (web / Electron), affichage seul.
//
// Rendue dans l'espace écran, hors de la vue zoomée, avec la même
// transformation tirée des shared values. L'instantané fait un pixel par
// pixel de document. Le navigateur l'agrandit avec
// `image-rendering: pixelated`, donc sans lissage, et la position est calée
// sur les pixels physiques (devicePixelRatio) : carrés unis, bords francs.
import React from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { docRasterSize, pixelAlignedTransform } from '@/services/pixelGrid';

export interface PixelatedViewProps {
  /** URL data:image/png sur web. */
  source: string;
  width: number;
  height: number;
  docW: number;
  docH: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  /** Rotation de la vue (degrés) autour du centre de la zone. */
  rotation: SharedValue<number>;
}

export default function PixelatedView({
  source, width, height, docW, docH, translateX, translateY, scale, rotation,
}: PixelatedViewProps) {
  const { w: rasterW, h: rasterH } = docRasterSize(docW, docH);
  const pr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const style = useAnimatedStyle(() => {
    const t = pixelAlignedTransform(
      width, height, docW, docH, rasterW, rasterH,
      translateX.value, translateY.value, scale.value, pr,
    );
    // Le scale CSS se fait autour du centre de la boîte : on compense pour
    // que le coin haut-gauche tombe exactement en (t.x, t.y).
    return {
      transform: [
        { translateX: t.x - (rasterW / 2) * (1 - t.sx) },
        { translateY: t.y - (rasterH / 2) * (1 - t.sy) },
        { scaleX: t.sx },
        { scaleY: t.sy },
      ],
    };
  });
  // Rotation de vue autour du centre de la zone (cette vue n'est plus dans
  // l'Animated.View tournée du Svg) ; le navigateur garde le rendu pixelated.
  const rotStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'visible' }, rotStyle]}
    >
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: rasterW, height: rasterH }, style]}
    >
      <img
        src={source}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', left: 0, top: 0, width: rasterW, height: rasterH,
          imageRendering: 'pixelated', pointerEvents: 'none', userSelect: 'none',
        }}
      />
    </Animated.View>
    </Animated.View>
  );
}
