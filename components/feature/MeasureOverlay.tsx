// Outil Mesure : surcouche d'AFFICHAGE (jamais dans les calques, l'historique,
// la sauvegarde, la synchro ni l'export) + petit panneau d'options.
// Dessinée en coordonnées ÉCRAN, hors de la vue zoomée : épaisseur et texte
// restent constants quel que soit le zoom.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import {
  Measure, MeasureMode, ViewParams, docToScreen, distance, segmentAngleDeg,
  angleAtVertex, formatLen, formatDeg,
} from '@/services/measureMath';

const COL = '#ff4fa3';
const HALO = 'rgba(0,0,0,0.55)';

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 7 + 12;
  return (
    <>
      <Rect x={x - w / 2} y={y - 11} width={w} height={20} rx={6} fill={HALO} />
      <SvgText x={x} y={y + 4} fill="#fff" fontSize={12} fontWeight="700" textAnchor="middle">{text}</SvgText>
    </>
  );
}

export function MeasureGraphics({ measure, view, width, height }: {
  measure: Measure; view: ViewParams; width: number; height: number;
}) {
  const A = docToScreen(measure.a, view);
  const B = measure.b ? docToScreen(measure.b, view) : null;
  const V = measure.v ? docToScreen(measure.v, view) : null;
  const seg = (p: { x: number; y: number }, q: { x: number; y: number }, key: string) => (
    <React.Fragment key={key}>
      <Line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={HALO} strokeWidth={4} strokeLinecap="round" />
      <Line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={COL} strokeWidth={2} strokeLinecap="round" />
    </React.Fragment>
  );
  const handle = (p: { x: number; y: number }, key: string) => (
    <Circle key={key} cx={p.x} cy={p.y} r={7} fill="#fff" stroke={COL} strokeWidth={2.5} />
  );
  let label: React.ReactNode = null;
  if (measure.mode === 'distance' && B) {
    const t = `${formatLen(distance(measure.a, measure.b!))} · ${formatDeg(segmentAngleDeg(measure.a, measure.b!))}`;
    label = <Label x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 18} text={t} />;
  } else if (measure.mode === 'angle' && V && B) {
    label = <Label x={V.x} y={V.y - 22} text={formatDeg(angleAtVertex(measure.a, measure.v!, measure.b!))} />;
  } else if (measure.mode === 'angle' && V) {
    label = <Label x={(A.x + V.x) / 2} y={(A.y + V.y) / 2 - 18} text={formatLen(distance(measure.v!, measure.a))} />;
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {measure.mode === 'distance' && B && seg(A, B, 'ab')}
      {measure.mode === 'angle' && V && seg(V, A, 'va')}
      {measure.mode === 'angle' && V && B && seg(V, B, 'vb')}
      {handle(A, 'ha')}
      {B && handle(B, 'hb')}
      {V && handle(V, 'hv')}
      {label}
    </Svg>
  );
}

function Chip({ on, label, onPress, accent }: { on: boolean; label: string; onPress: () => void; accent: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.chip, on && { backgroundColor: accent }]}>
      <Text style={[styles.chipText, on && { color: '#0d0d0d' }]}>{label}</Text>
    </Pressable>
  );
}

function NumField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (n: number) => void }) {
  const shown = value === null ? '' : String(Math.round(value * 10) / 10);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [shown]);
  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (isFinite(n)) onCommit(n);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={draft ?? shown}
        editable={value !== null}
        onChangeText={setDraft}
        onSubmitEditing={commit}
        onBlur={commit}
        keyboardType="numeric"
        returnKeyType="done"
        selectTextOnFocus
      />
    </View>
  );
}

export function MeasurePanel(props: {
  accent: string;
  mode: MeasureMode; setMode: (m: MeasureMode) => void;
  snap15: boolean; setSnap15: (v: boolean) => void;
  snapEnds: boolean; setSnapEnds: (v: boolean) => void;
  measure: Measure | null;
  onLen: (n: number) => void; onDeg: (n: number) => void;
  onTrace: () => void; onClear: () => void;
}) {
  const { accent, mode, measure } = props;
  const complete = !!measure && !!measure.b && (measure.mode === 'distance' || !!measure.v);
  let len: number | null = null;
  let deg: number | null = null;
  if (measure && measure.b) {
    if (measure.mode === 'distance') {
      len = distance(measure.a, measure.b);
      deg = segmentAngleDeg(measure.a, measure.b);
    } else if (measure.v) {
      len = distance(measure.v, measure.b);
      deg = angleAtVertex(measure.a, measure.v, measure.b);
    }
  }
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Chip on={mode === 'distance'} label="Distance" onPress={() => props.setMode('distance')} accent={accent} />
        <Chip on={mode === 'angle'} label="Angle" onPress={() => props.setMode('angle')} accent={accent} />
        <Chip on={props.snap15} label="15°" onPress={() => props.setSnap15(!props.snap15)} accent={accent} />
        <Chip on={props.snapEnds} label="Accroche" onPress={() => props.setSnapEnds(!props.snapEnds)} accent={accent} />
      </View>
      <View style={styles.row}>
        <NumField label={mode === 'distance' ? 'Longueur' : 'Bras 2'} value={len} onCommit={props.onLen} />
        <NumField label={mode === 'distance' ? 'Angle /horiz.' : 'Angle'} value={deg} onCommit={props.onDeg} />
      </View>
      <View style={styles.row}>
        <Pressable disabled={!complete} onPress={props.onTrace} hitSlop={6}
          style={[styles.action, { backgroundColor: accent, opacity: complete ? 1 : 0.4 }]}>
          <Text style={[styles.actionText, { color: '#0d0d0d' }]}>Tracer</Text>
        </Pressable>
        <Pressable disabled={!measure} onPress={props.onClear} hitSlop={6}
          style={[styles.action, { opacity: measure ? 1 : 0.4 }]}>
          <Text style={styles.actionText}>Effacer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', top: 8, left: 8, padding: 8, gap: 6, borderRadius: 12,
    backgroundColor: 'rgba(20,20,20,0.88)', maxWidth: 320,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    minHeight: 32, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipText: { color: '#eee', fontSize: 12, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldLabel: { color: '#bbb', fontSize: 11 },
  input: {
    minWidth: 64, height: 32, paddingHorizontal: 8, borderRadius: 8, color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)', fontSize: 13,
  },
  action: {
    minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  actionText: { color: '#eee', fontSize: 13, fontWeight: '700' },
});
