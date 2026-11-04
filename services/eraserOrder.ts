// Ordre de la gomme (logique PURE, testée sans React Native).
//
// Une gomme n'efface que ce qui existait AU MOMENT du gommage. Les traits
// d'un calque sont rangés dans l'ordre chronologique ; on les découpe en
// tronçons « traits dessinés puis gommes qui les suivent ». Au rendu, chaque
// tronçon est masqué par SES gommes, en enveloppant aussi tous les tronçons
// précédents :  masque2( masque1( traits1 ) + traits2 ).
// Un trait tracé APRÈS une gomme n'est donc jamais touché par elle.
// (Avant : un seul masque avec toutes les gommes, appliqué à tous les traits.)

export interface EraserSegment<S> {
  draws: S[];
  erasers: S[];
}

export function eraserSegments<S extends { tool: string }>(strokes: S[]): EraserSegment<S>[] {
  const out: EraserSegment<S>[] = [];
  let cur: EraserSegment<S> = { draws: [], erasers: [] };
  for (const s of strokes) {
    if (s.tool === 'fill') continue;
    if (s.tool === 'eraser') {
      cur.erasers.push(s);
    } else {
      if (cur.erasers.length > 0) { out.push(cur); cur = { draws: [], erasers: [] }; }
      cur.draws.push(s);
    }
  }
  if (cur.draws.length > 0 || cur.erasers.length > 0) out.push(cur);
  return out;
}
