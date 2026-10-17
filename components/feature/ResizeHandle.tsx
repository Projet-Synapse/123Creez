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
  /** Côté où se trouve LE PANNEAU par rapport à la poignée. Le bord suit
      toujours le curseur : poignée sur le bord DROIT du panneau ('right'),
      tirer vers la droite agrandit ; poignée sur le bord GAUCHE ('left'),
      tirer vers la gauche agrandit. */
  panelSide: 'left' | 'right';
  onResize: (widthDelta: number) => void;
  onResizeEnd: () => void;
  borderColor: string;
  /** Couleur d'accentuation affichée pendant le drag. */
  activeColor?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ panelSide, onResize, onResizeEnd, borderColor, activeColor }) => {
  const grantX = useRef(0);
  const [dragging, setDragging] = React.useState(false);
  const sign = panelSide === 'right' ? 1 : -1;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        grantX.current = e.nativeEvent.pageX;
        setDragging(true);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        onResize(sign * (e.nativeEvent.pageX - grantX.current));
      },
      onPanResponderRelease: () => { setDragging(false); onResizeEnd(); },
      onPanResponderTerminate: () => { setDragging(false); onResizeEnd(); },
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.handle,
        { backgroundColor: dragging && activeColor ? activeColor : borderColor },
        dragging && { opacity: 1 },
        Platform.OS === 'web' && ({ cursor: 'ew-resize' } as Record<string, string>),
      ]}
      hitSlop={{ left: 12, right: 12 }}
    />
  );
};

const styles = StyleSheet.create({
  handle: {
    width: 14,
    alignSelf: 'stretch',
    opacity: 0.4,
  },
});

export default ResizeHandle;
