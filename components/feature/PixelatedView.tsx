// Vue pixélisée (Android / iOS), affichage seul, jamais exportée.
//
// Rendue dans l'ESPACE ÉCRAN, hors de l'Animated.View zoomée. Sinon, la
// transformation native (scale) agrandissait la texture Skia en bilinéaire
// et rendait l'image floue. Ici, translation et zoom sont appliqués DANS
// Skia, à partir des mêmes shared values que le Svg, avec un échantillonnage
// « plus proche voisin ».
//
// L'instantané est capturé à la taille native de la vue, sans
// redimensionnement filtré par view-shot. Il est ensuite ramené à un pixel
// par pixel de document, en Nearest, dans une surface hors écran.
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Group, Image, Skia, FilterMode, MipmapMode, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { meetFitRect } from '@/services/gestureMath';

export interface PixelatedViewProps {
  /** PNG encodé en base64 (sans préfixe data:) sur natif, taille native de la vue. */
  source: string;
  width: number;
  height: number;
  docW: number;
  docH: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
}

/** Ramène la capture (zone entière, px natifs) à docW × docH px, en Nearest. */
function toDocPixels(src: SkImage, width: number, height: number, docW: number, docH: number): SkImage | null {
  const fit = meetFitRect(width, height, docW, docH);
  const sx = src.width() / width;
  const sy = src.height() / height;
  const outW = Math.max(1, Math.round(docW));
  const outH = Math.max(1, Math.round(docH));
  const surface = Skia.Surface.MakeOffscreen(outW, outH);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.drawImageRectOptions(
    src,
    Skia.XYWHRect(fit.x * sx, fit.y * sy, fit.w * sx, fit.h * sy),
    Skia.XYWHRect(0, 0, outW, outH),
    FilterMode.Nearest, MipmapMode.None,
  );
  surface.flush();
  return surface.makeImageSnapshot().makeNonTextureImage();
}

export default function PixelatedView({
  source, width, height, docW, docH, translateX, translateY, scale,
}: PixelatedViewProps) {
  const image = useMemo(() => {
    try {
      const raw = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(source));
      return raw ? toDocPixels(raw, width, height, docW, docH) : null;
    } catch {
      return null;
    }
  }, [source, width, height, docW, docH]);
  // Même transformation que l'Animated.View : translate puis scale autour
  // du centre de la zone (origine des transformations React Native).
  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);
  if (!image) return null;
  const fit = meetFitRect(width, height, docW, docH);
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group transform={transform} origin={{ x: width / 2, y: height / 2 }}>
        <Image
          image={image}
          x={fit.x}
          y={fit.y}
          width={fit.w}
          height={fit.h}
          fit="fill"
          sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
        />
      </Group>
    </Canvas>
  );
}
