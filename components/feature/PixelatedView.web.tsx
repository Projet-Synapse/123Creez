// Vue pixélisée (web / Electron), affichage seul.
//
// Rendue dans l'espace écran, hors de la vue zoomée, avec la même
// transformation tirée des shared values. L'instantané fait un pixel par
// pixel de document. Le navigateur l'agrandit avec
// `image-rendering: pixelated`, donc sans lissage.
import React from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { meetFitRect } from '@/services/gestureMath';

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
}

export default function PixelatedView({
  source, width, height, docW, docH, translateX, translateY, scale,
}: PixelatedViewProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const fit = meetFitRect(width, height, docW, docH);
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    >
      <img
        src={source}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', left: fit.x, top: fit.y, width: fit.w, height: fit.h,
          imageRendering: 'pixelated', pointerEvents: 'none', userSelect: 'none',
        }}
      />
    </Animated.View>
  );
}
