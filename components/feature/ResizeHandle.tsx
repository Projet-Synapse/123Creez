// Poignée de redimensionnement des barres latérales.
//
// Une bande verticale fine posée sur le bord d'un panneau : on la saisit à
// la souris (ou au doigt) et chaque mouvement appelle onResize avec l'écart
// horizontal depuis le début du drag. Le parent applique le delta à la
// largeur de son panneau et persiste au relâchement — la poignée ne connaît
// rien au panneau qu'elle redimensionne.
//
// Capture dès le mousedown (startShouldSetResponderCapture) : react-native-web
// laisse sinon le responder principal de l'écran gagner la course.
import React, { useRef } from 'react';
import { View, StyleSheet, PanResponder, Platform, type GestureResponderEvent } from 'react-native';

interface ResizeHandleProps {
  /** Sens dans lequel le panneau s'agrandit quand on tire vers la droite :
      'right' (poignée à gauche du panneau, +1) ou 'left' (poignée à droite du
      panneau, -1). Sert à convertir le delta souris en delta de largeur. */
  panelSide: 'left' | 'right';
  onResize: (widthDelta: number) => void;
  onResizeEnd: () => void;
  borderColor: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ panelSide, onResize, onResizeEnd, borderColor }) => {
  const grantX = useRef(0);
  const sign = panelSide === 'left' ? 1 : -1;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        grantX.current = e.nativeEvent.pageX;
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        onResize(sign * (e.nativeEvent.pageX - grantX.current));
      },
      onPanResponderRelease: () => onResizeEnd(),
      onPanResponderTerminate: () => onResizeEnd(),
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.handle,
        { backgroundColor: borderColor },
        Platform.OS === 'web' && ({ cursor: 'ew-resize' } as Record<string, string>),
      ]}
    />
  );
};

const styles = StyleSheet.create({
  handle: {
    width: 8,
    alignSelf: 'stretch',
    opacity: 0.35,
  },
});

export default ResizeHandle;
