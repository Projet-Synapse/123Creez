// Vue pixélisée (web / Electron) : l'instantané raster du canevas, à la
// résolution du document, est agrandi par le navigateur avec
// `image-rendering: pixelated` (aucun lissage). Affichage seul.
import React from 'react';

export interface PixelatedViewProps {
  /** URL data:image/png sur web. */
  source: string;
  width: number;
  height: number;
}

export default function PixelatedView({ source, width, height }: PixelatedViewProps) {
  return (
    <img
      src={source}
      alt=""
      draggable={false}
      style={{
        position: 'absolute', left: 0, top: 0, width, height,
        imageRendering: 'pixelated', pointerEvents: 'none', userSelect: 'none',
      }}
    />
  );
}
