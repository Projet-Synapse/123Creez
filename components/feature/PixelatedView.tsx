// Vue pixélisée (Android / iOS) : l'instantané raster du canevas, à la
// résolution du document, est agrandi par Skia avec un échantillonnage
// « plus proche voisin » (aucun lissage). Affichage seul, jamais exporté.
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Image, Skia, FilterMode, MipmapMode } from '@shopify/react-native-skia';

export interface PixelatedViewProps {
  /** PNG encodé en base64 (sans préfixe data:) sur natif. */
  source: string;
  width: number;
  height: number;
}

export default function PixelatedView({ source, width, height }: PixelatedViewProps) {
  const image = useMemo(() => {
    try {
      return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(source));
    } catch {
      return null;
    }
  }, [source]);
  if (!image) return null;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Image
        image={image}
        x={0}
        y={0}
        width={width}
        height={height}
        fit="fill"
        sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
      />
    </Canvas>
  );
}
