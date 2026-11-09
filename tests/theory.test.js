/* Pruebas del núcleo de teoría de Chord Assist. */
global.window = global;
require('../js/theory.js');

const T = global.window.Theory;
let fallos = 0;

function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fallos++; }
}

function best(pcs, bass) {
  const c = T.best(pcs, bass);
  return c ? T.chordSymbol(c.root, c.chord) : null;
}
const first = (pcs) => best(pcs, pcs[0]);

console.log('Diccionario');
const ids = new Set();
let dup = 0;
T.CHORD_TYPES.forEach((c) => {
  if (ids.has(c.id)) { dup++; console.log('  id repetido: ' + c.id); }
  ids.add(c.id);
  if (!c.intervals || !c.intervals.length) console.log('  sin intervalos: ' + c.id);
  const v = T.voicingOf(c);
  for (let i = 1; i < v.length; i++) {
    if (v[i] <= v[i - 1]) console.log('  voicing no ascendente: ' + c.id + ' ' + JSON.stringify(v));
  }
});
ok(dup === 0, 'sin ids repetidos (' + T.CHORD_TYPES.length + ' acordes)');
ok(T.CHORD_TYPES.length >= 40, 'el selector tiene ' + T.CHORD_TYPES.length + ' tipos');
ok(T.GROUPS.length === 5, 'grupos: ' + T.GROUPS.map((g) => g.title).join(', '));

console.log('Identificación básica');
ok(first([0, 4, 7]) === 'C', 'C major');
ok(first([0, 3, 7]) === 'Cm', 'C minor');
ok(first([0, 4, 7, 10]) === 'C7', 'C dominant 7th');
ok(first([0, 7]) === 'C5', 'C fifth');
ok(first([0, 3, 6]) === 'Cdim', 'C diminished');
ok(first([0, 4, 8]) === 'Caug', 'C augmented');
ok(first([0, 5, 7]) === 'Csus4', 'C sus4');
ok(first([0, 2, 7]) === 'Csus2', 'C sus2');
ok(first([0, 5, 7, 10]) === 'C7sus4', 'C 7sus4');
ok(first([0, 4, 7, 9]) === 'C6', 'C E G A con Do en el bajo da C6');
  ok(best([0, 4, 7, 9], 9) === 'Am7', 'las mismas notas con La en el bajo dan Am7');
ok(first([0, 4, 7, 11]) === 'Cmaj7', 'C maj7');
ok(first([0, 3, 7, 10]) === 'Cm7', 'C m7');
ok(first([0, 3, 6, 10]) === 'Cm7\u266D5', 'C half-diminished');
ok(first([0, 3, 7, 11]) === 'CmMaj7', 'C minor major 7th');

console.log('Extensiones');
ok(first([0, 4, 7, 11, 2]) === 'Cmaj9', 'C maj9');
ok(first([0, 4, 7, 10, 2]) === 'C9', 'C 9');
ok(first([0, 3, 7, 10, 2]) === 'Cm9', 'C m9');
ok(first([0, 4, 7, 11, 2, 9]) === 'Cmaj13', 'C maj13');
ok(first([0, 4, 7, 10, 2, 9]) === 'C13', 'C 13');
ok(first([0, 4, 7, 10, 1]) === 'C7\u266D9', 'C 7b9');
ok(first([0, 4, 7, 10, 3]) === 'C7\u266F9', 'C 7#9');
ok(first([0, 4, 6, 10]) === 'C7\u266D5', 'C 7b5');
ok(first([0, 4, 8, 10]) === 'C7\u266F5', 'C 7#5');
ok(first([0, 3, 4, 7, 10]) === 'C7\u266F9', 'C7#9 con la 3ª menor en el set');

console.log('Voicings');
const maj13 = T.CHORDS.maj13;
ok(JSON.stringify(T.voicingOf(maj13)) === JSON.stringify([0, 4, 7, 11, 14, 21]), 'maj13 apila 9 y 13 arriba');
ok(JSON.stringify(T.pitchClasses(0, maj13.intervals)) === JSON.stringify([0, 2, 4, 7, 9, 11]), 'maj13 pitch classes');
const n13 = T.voicingOf(T.CHORDS['13']).map((iv) => 48 + iv);
ok(n13.join(',') === '48,52,55,58,62,69', 'C13 desde C3: ' + n13.join(','));



console.log('Escalas compatibles');
const scaleIds = (pcs, root) => T.scalesForChord(pcs, root).map((s) => s.id);

ok(scaleIds([0, 4, 7, 11], 0).indexOf('ionian') !== -1, 'Cmaj7 admite jónica');
ok(scaleIds([0, 4, 7, 11], 0).indexOf('lydian') !== -1, 'Cmaj7 admite lidia');
ok(scaleIds([0, 4, 7, 11], 0).indexOf('mixolydian') === -1, 'Cmaj7 no admite mixolidia (le falta la 7ª mayor)');
ok(scaleIds([0, 4, 7, 11], 0).indexOf('majorPent') === -1, 'Cmaj7 no admite pentatónica mayor');
ok(scaleIds([0, 4, 7], 0)[0] === 'ionian', 'C mayor arranca con la jónica');
ok(scaleIds([0, 4, 7], 0).indexOf('ionian') !== -1, 'C mayor admite jónica');
ok(scaleIds([0, 4, 7, 10], 0).indexOf('mixolydian') !== -1, 'C7 admite mixolidia');
ok(scaleIds([0, 4, 7, 10], 0).indexOf('phrygianDom') !== -1, 'C7 admite frigia dominante');
ok(scaleIds([0, 4, 7, 10], 0).indexOf('dimHalfWhole') !== -1, 'C7 admite disminuida S-T');
ok(scaleIds([0, 3, 7, 10], 0).indexOf('dorian') !== -1, 'Cm7 admite dórica');
ok(scaleIds([0, 3, 7, 10], 0).indexOf('aeolian') !== -1, 'Cm7 admite eólica');
ok(scaleIds([0, 3, 6, 10], 0).indexOf('locrian') !== -1, 'Cm7b5 admite locria');
ok(scaleIds([0, 3, 6, 9], 0).indexOf('dimWholeHalf') !== -1, 'Cdim7 admite disminuida T-S');
ok(scaleIds([0, 4, 8], 0).indexOf('wholeTone') !== -1, 'Caug admite tonos enteros');
ok(scaleIds([0, 4, 8], 0).indexOf('augmented') !== -1, 'Caug admite aumentada');
ok(scaleIds([0, 1, 2], 0).length === 0, 'un clúster no tiene escalas');

const ion = T.SCALES.filter((x) => x.id === 'ionian')[0];
ok(T.scaleNotes(0, ion).join(',') === '0,2,4,5,7,9,11', 'notas de la jónica de C');
ok(T.scaleNotes(2, ion).join(',') === '2,4,6,7,9,11,1', 'notas de la jónica de D');


console.log('Buscador de escalas');
ok(T.SCALES.length >= 37, 'biblioteca con ' + T.SCALES.length + ' escalas');
['egyptian','spanish8','japanese1','japanese2','iwato','hirajoshi1','hirajoshi2','chinese','kumoi','overtone','ultralocrian','persian','doubleHarmonic'].forEach((id) => {
  ok(T.SCALES.some((x) => x.id === id), 'incluye ' + id);
});
const found = T.scalesForNotes([0, 2, 4]);
ok(found.some((x) => x.root === 0 && x.scale.id === 'majorPent'), 'C D E -> C pentatónica mayor');
ok(found.some((x) => x.root === 9 && x.scale.id === 'minorPent'), 'C D E -> A pentatónica menor');
ok(found.some((x) => x.root === 2 && x.scale.id === 'egyptian'), 'C D E -> D egipcia');
const wt = found.filter((x) => x.scale.id === 'wholeTone');
ok(wt.length === 1, 'tonos enteros aparece una sola vez (' + wt.length + ')');
ok(T.scalesForNotes([0]).length === 0, 'con una sola nota no propone escalas');

console.log('Grados según el acorde');
ok(T.degreeOf(T.CHORDS.maj13, 2) === '9', 'maj13: la 2 es 9');
ok(T.degreeOf(T.CHORDS.maj13, 9) === '13', 'maj13: la 6 es 13');
ok(T.degreeOf(T.CHORDS['13'], 9) === '13', '13: la 6 es 13');
ok(T.degreeOf(T.CHORDS['13'], 2) === '9', '13: la 2 es 9');
ok(T.degreeOf(T.CHORDS.s11, 6) === '\u266F11', 'maj7#11: el tritono es #11');
ok(T.degreeOf(T.CHORDS['7b5'], 6) === '\u266D5', '7b5: el tritono es b5');
ok(T.degreeOf(T.CHORDS['7b9'], 1) === '\u266D9', '7b9: la b2 es b9');
ok(T.degreeOf(T.CHORDS['7s9'], 3) === '\u266F9', '7#9: la b3 es #9');
ok(T.degreeOf(T.CHORDS.sus2, 2) === '2', 'sus2: la 2 es 2');
ok(T.degreeOf(T.CHORDS.add9, 2) === '9', 'add9: la 2 es 9');
ok(T.degreeOf(T.CHORDS.m11, 5) === '11', 'm11: la 4 es 11');
ok(T.degreeOf(T.CHORDS['7sus4'], 5) === '4', '7sus4: la 4 es 4');
ok(T.degreeOf(T.CHORDS.m7, 3) === '\u266D3', 'm7: la b3 es b3');
ok(T.degreeOf(T.CHORDS.mMaj7, 3) === '\u266D3', 'mMaj7: la b3 es b3');
ok(T.degreeOf(null, 7) === '5', 'sin acorde cae al intervalo');

console.log('Nombres');
ok(T.enName(1) === 'C\u266F', 'pc 1 -> C#');
ok(T.noteName(1) === 'Do\u266F', 'pc 1 -> Do#');
ok(T.chordSymbol(9, T.CHORDS.m7) === 'Am7', 'Am7');
ok(T.intervalLabel(10) === '\u266D7', '10 semitonos -> b7');

console.log('');
if (fallos) { console.log(fallos + ' FALLO(S)'); process.exit(1); }
console.log('Todo OK');
