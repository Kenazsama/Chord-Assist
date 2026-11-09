/* =====================================================================
   theory.js — Teoría musical pura. Sin DOM, sin audio.

   Todo se maneja en pitch classes (0 = C, 11 = B).
   El diccionario de acordes es el corazón de Chord Assist: cubre las
   tríadas, los sus, las familias mayor/menor y todos los dominantes
   alterados del selector.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- Nombres de notas ---------- */
  const NOTE = {
    esSharp: ['Do', 'Do\u266F', 'Re', 'Re\u266F', 'Mi', 'Fa', 'Fa\u266F', 'Sol', 'Sol\u266F', 'La', 'La\u266F', 'Si'],
    esFlat:  ['Do', 'Re\u266D', 'Re', 'Mi\u266D', 'Mi', 'Fa', 'Sol\u266D', 'Sol', 'La\u266D', 'La', 'Si\u266D', 'Si'],
    enSharp: ['C', 'C\u266F', 'D', 'D\u266F', 'E', 'F', 'F\u266F', 'G', 'G\u266F', 'A', 'A\u266F', 'B'],
    enFlat:  ['C', 'D\u266D', 'D', 'E\u266D', 'E', 'F', 'G\u266D', 'G', 'A\u266D', 'A', 'B\u266D', 'B']
  };

  /* ---------- Intervalos ---------- */
  const INTERVALS = [
    { semis: 0,  label: '1',      name: 'unísono' },
    { semis: 1,  label: '\u266D2', name: 'segunda menor' },
    { semis: 2,  label: '2',      name: 'segunda mayor' },
    { semis: 3,  label: '\u266D3', name: 'tercera menor' },
    { semis: 4,  label: '3',      name: 'tercera mayor' },
    { semis: 5,  label: '4',      name: 'cuarta justa' },
    { semis: 6,  label: '\u266D5', name: 'tritono' },
    { semis: 7,  label: '5',      name: 'quinta justa' },
    { semis: 8,  label: '\u266F5', name: 'quinta aumentada' },
    { semis: 9,  label: '6',      name: 'sexta mayor' },
    { semis: 10, label: '\u266D7', name: 'séptima menor' },
    { semis: 11, label: '7',      name: 'séptima mayor' }
  ];

  /* ---------- Diccionario de acordes ----------
     intervals: pitch classes desde la raíz (para identificar por oído/vista)
     voicing:   semitonos absolutos para construir las notas (9nas, 11nas
                y 13nas apiladas arriba de la octava)
     rank:      prioridad al identificar, más alto = nombre más probable */
  const CHORD_TYPES = [
    /* --- Tríadas y básicos --- */
    { id: 'maj',    group: 'Tríadas y básicos', label: 'Major',                        es: 'mayor',                        symbol: '',        intervals: [0, 4, 7],       rank: 100 },
    { id: 'min',    group: 'Tríadas y básicos', label: 'Minor',                        es: 'menor',                        symbol: 'm',       intervals: [0, 3, 7],       rank: 98 },
    { id: 'dom7',   group: 'Tríadas y básicos', label: 'Dominant 7th',                 es: 'séptima dominante',            symbol: '7',       intervals: [0, 4, 7, 10],   rank: 92 },
    { id: 'five',   group: 'Tríadas y básicos', label: 'Fifth',                        es: 'quinta (power)',               symbol: '5',       intervals: [0, 7],          rank: 30 },
    { id: 'dim',    group: 'Tríadas y básicos', label: 'Diminished',                   es: 'disminuido',                   symbol: 'dim',     intervals: [0, 3, 6],       rank: 70 },
    { id: 'aug',    group: 'Tríadas y básicos', label: 'Augmented',                    es: 'aumentado',                    symbol: 'aug',     intervals: [0, 4, 8],       rank: 60 },
    { id: 'majb5',  group: 'Tríadas y básicos', label: 'Major diminished 5th',         es: 'mayor con quinta disminuida',  symbol: '(\u266D5)', intervals: [0, 4, 6],     rank: 22 },

    /* --- Suspendidos --- */
    { id: 'sus2',   group: 'Suspendidos', label: 'Suspended 2nd',                      es: 'suspendido 2ª',                symbol: 'sus2',    intervals: [0, 2, 7],       rank: 72 },
    { id: 'sus4',   group: 'Suspendidos', label: 'Suspended 4th',                      es: 'suspendido 4ª',                symbol: 'sus4',    intervals: [0, 5, 7],       rank: 75 },
    { id: '7sus4',  group: 'Suspendidos', label: 'Dominant 7th suspended 4th',         es: 'dominante 7ª suspendida 4ª',   symbol: '7sus4',   intervals: [0, 5, 7, 10],   rank: 48 },

    /* --- Mayores --- */
    { id: 'six',     group: 'Mayores', label: 'Major 6th',                 es: 'sexta mayor',                        symbol: '6',        intervals: [0, 4, 7, 9],          rank: 66 },
    { id: 'add9',    group: 'Mayores', label: 'Major added 9th',           es: 'novena agregada',                    symbol: 'add9',     intervals: [0, 2, 4, 7],          voicing: [0, 4, 7, 14],          rank: 68 },
    { id: 'maj7',    group: 'Mayores', label: 'Major 7th',                 es: 'séptima mayor',                      symbol: 'maj7',     intervals: [0, 4, 7, 11],         rank: 94 },
    { id: 'maj9',    group: 'Mayores', label: 'Major 9th',                 es: 'novena mayor',                       symbol: 'maj9',     intervals: [0, 2, 4, 7, 11],      voicing: [0, 4, 7, 11, 14],      rank: 86 },
    { id: 'maj11',   group: 'Mayores', label: 'Major 11th',                es: 'oncena mayor',                       symbol: 'maj11',    intervals: [0, 2, 4, 5, 7, 11],   voicing: [0, 4, 7, 11, 14, 17],  rank: 52 },
    { id: 'maj13',   group: 'Mayores', label: 'Major 13th',                es: 'trecena mayor',                      symbol: 'maj13',    intervals: [0, 2, 4, 7, 9, 11],   voicing: [0, 4, 7, 11, 14, 21],  rank: 50 },
    { id: 's11',     group: 'Mayores', label: 'Sharp 11th',                es: 'séptima mayor con oncena aumentada', symbol: 'maj7\u266F11',  intervals: [0, 4, 6, 11],     rank: 40 },
    { id: 'maj7b5',  group: 'Mayores', label: 'Major 7th, flat 5th',       es: 'séptima mayor con quinta disminuida', symbol: 'maj7\u266D5', intervals: [0, 4, 6, 11],     rank: 39 },
    { id: 'maj7s5',  group: 'Mayores', label: 'Major 7th, sharp 5th',      es: 'séptima mayor con quinta aumentada',  symbol: 'maj7\u266F5', intervals: [0, 4, 8, 11],     rank: 42 },

    /* --- Menores --- */
    { id: 'm6',     group: 'Menores', label: 'Minor 6th',                    es: 'menor sexta',                          symbol: 'm6',      intervals: [0, 3, 7, 9],         rank: 62 },
    { id: 'madd9',  group: 'Menores', label: 'Minor added 9th',              es: 'menor novena agregada',                symbol: 'madd9',   intervals: [0, 2, 3, 7],         voicing: [0, 3, 7, 14],          rank: 55 },
    { id: 'm69',    group: 'Menores', label: 'Minor 6th, added 9th',         es: 'menor sexta con novena',               symbol: 'm6/9',    intervals: [0, 2, 3, 7, 9],      voicing: [0, 3, 7, 9, 14],       rank: 38 },
    { id: 'm7',     group: 'Menores', label: 'Minor 7th',                    es: 'menor séptima',                        symbol: 'm7',      intervals: [0, 3, 7, 10],        rank: 90 },
    { id: 'm9',     group: 'Menores', label: 'Minor 9th',                    es: 'menor novena',                         symbol: 'm9',      intervals: [0, 2, 3, 7, 10],     voicing: [0, 3, 7, 10, 14],      rank: 82 },
    { id: 'm11',    group: 'Menores', label: 'Minor 11th',                   es: 'menor oncena',                         symbol: 'm11',     intervals: [0, 2, 3, 5, 7, 10],  voicing: [0, 3, 7, 10, 14, 17],  rank: 45 },
    { id: 'm13',    group: 'Menores', label: 'Minor 13th',                   es: 'menor trecena',                        symbol: 'm13',     intervals: [0, 2, 3, 7, 9, 10],  voicing: [0, 3, 7, 10, 14, 21],  rank: 44 },
    { id: 'mMaj7',  group: 'Menores', label: 'Minor, Major 7th',             es: 'menor con séptima mayor',              symbol: 'mMaj7',   intervals: [0, 3, 7, 11],        rank: 46 },
    { id: 'mMaj9',  group: 'Menores', label: 'Minor 9th, Major 7th',         es: 'menor novena con séptima mayor',       symbol: 'mMaj9',   intervals: [0, 2, 3, 7, 11],     voicing: [0, 3, 7, 11, 14],      rank: 40 },
    { id: 'm7b5',   group: 'Menores', label: 'Half-diminished (minor 7th flat 5th)', es: 'semidisminuido',              symbol: 'm7\u266D5', intervals: [0, 3, 6, 10],      rank: 56 },
    { id: 'm7s5',   group: 'Menores', label: 'Minor 7th, sharp 5th',         es: 'menor séptima con quinta aumentada',   symbol: 'm7\u266F5', intervals: [0, 3, 8, 10],      rank: 35 },

    /* --- Dominantes --- */
    { id: '9',      group: 'Dominantes', label: 'Dominant 9th',               es: 'novena dominante',                    symbol: '9',       intervals: [0, 2, 4, 7, 10],     voicing: [0, 4, 7, 10, 14],      rank: 84 },
    { id: '11',     group: 'Dominantes', label: 'Dominant 11th',              es: 'oncena dominante',                    symbol: '11',      intervals: [0, 2, 4, 5, 7, 10],  voicing: [0, 4, 7, 10, 14, 17],  rank: 58 },
    { id: '13',     group: 'Dominantes', label: 'Dominant 13th',              es: 'trecena dominante',                   symbol: '13',      intervals: [0, 2, 4, 7, 9, 10],  voicing: [0, 4, 7, 10, 14, 21],  rank: 57 },
    { id: '7b5',    group: 'Dominantes', label: 'Dominant 7th, flat 5th',     es: 'séptima dominante con quinta disminuida', symbol: '7\u266D5',  intervals: [0, 4, 6, 10],      rank: 44 },
    { id: '7s5',    group: 'Dominantes', label: 'Dominant 7th, sharp 5th',    es: 'séptima dominante con quinta aumentada',  symbol: '7\u266F5',  intervals: [0, 4, 8, 10],      rank: 43 },
    { id: '7b9',    group: 'Dominantes', label: 'Dominant 7th, flat 9th',     es: 'séptima dominante con novena menor',  symbol: '7\u266D9',  intervals: [0, 1, 4, 7, 10],    voicing: [0, 4, 7, 10, 13],      rank: 50 },
    { id: '7s9',    group: 'Dominantes', label: 'Dominant 7th, sharp 9th',    es: 'séptima dominante con novena aumentada', symbol: '7\u266F9', intervals: [0, 3, 4, 7, 10],   voicing: [0, 4, 7, 10, 15],      rank: 49 },
    { id: '7b5b9',  group: 'Dominantes', label: 'Dominant 7th, flat 5th, flat 9th',   es: 'dominante 7ª, 5ª y 9ª disminuidas',  symbol: '7\u266D5\u266D9', intervals: [0, 1, 4, 6, 10],  voicing: [0, 4, 6, 10, 13], rank: 28 },
    { id: '7b5s9',  group: 'Dominantes', label: 'Dominant 7th, flat 5th, sharp 9th',  es: 'dominante 7ª, 5ª disminuida y 9ª aumentada', symbol: '7\u266D5\u266F9', intervals: [0, 3, 4, 6, 10],  voicing: [0, 4, 6, 10, 15], rank: 27 },
    { id: '7s5b9',  group: 'Dominantes', label: 'Dominant 7th, sharp 5th, flat 9th',  es: 'dominante 7ª, 5ª aumentada y 9ª disminuida', symbol: '7\u266F5\u266D9', intervals: [0, 1, 4, 8, 10],  voicing: [0, 4, 8, 10, 13], rank: 26 },
    { id: '7s5s9',  group: 'Dominantes', label: 'Dominant 7th, sharp 5th, sharp 9th', es: 'dominante 7ª, 5ª y 9ª aumentadas',   symbol: '7\u266F5\u266F9', intervals: [0, 3, 4, 8, 10],  voicing: [0, 4, 8, 10, 15], rank: 25 },
    { id: '9b5',    group: 'Dominantes', label: 'Dominant 9th, flat 5th',     es: 'novena dominante con quinta disminuida', symbol: '9\u266D5', intervals: [0, 2, 4, 6, 10],  voicing: [0, 4, 6, 10, 14],      rank: 33 },
    { id: '9s5',    group: 'Dominantes', label: 'Dominant 9th, sharp 5th',    es: 'novena dominante con quinta aumentada',  symbol: '9\u266F5', intervals: [0, 2, 4, 8, 10],  voicing: [0, 4, 8, 10, 14],      rank: 32 },
    { id: '13s11',  group: 'Dominantes', label: 'Dominant 13th, added sharp 11th', es: 'trecena dominante con oncena aumentada', symbol: '13\u266F11', intervals: [0, 4, 6, 7, 9, 10], voicing: [0, 4, 7, 10, 18, 21], rank: 24 },
    { id: '13b9',   group: 'Dominantes', label: 'Dominant 13th, flat 9th',    es: 'trecena dominante con novena menor', symbol: '13\u266D9', intervals: [0, 1, 4, 7, 9, 10], voicing: [0, 4, 7, 10, 13, 21],  rank: 31 },
    { id: '11b9',   group: 'Dominantes', label: 'Dominant 11th, flat 9th',    es: 'oncena dominante con novena menor',  symbol: '11\u266D9', intervals: [0, 1, 4, 5, 7, 10], voicing: [0, 4, 7, 10, 13, 17], rank: 30 }
  ];

  /* ---------- Escalas y modos ----------
     intervals relativos a la tónica de la escala. */
  const SCALES = [
    { id: 'ionian',        name: 'Jónica',              family: 'Mayor',          intervals: [0, 2, 4, 5, 7, 9, 11], rank: 100 },
    { id: 'dorian',        name: 'Dórica',              family: 'Menor',          intervals: [0, 2, 3, 5, 7, 9, 10], rank: 95 },
    { id: 'mixolydian',    name: 'Mixolidia',           family: 'Dominante',      intervals: [0, 2, 4, 5, 7, 9, 10], rank: 92 },
    { id: 'lydian',        name: 'Lidia',               family: 'Mayor',          intervals: [0, 2, 4, 6, 7, 9, 11], rank: 90 },
    { id: 'aeolian',       name: 'Eólica (menor)',      family: 'Menor',          intervals: [0, 2, 3, 5, 7, 8, 10], rank: 88 },
    { id: 'phrygian',      name: 'Frigia',              family: 'Menor',          intervals: [0, 1, 3, 5, 7, 8, 10], rank: 85 },
    { id: 'majorPent',     name: 'Pentatónica mayor',   family: 'Pentatónica',    intervals: [0, 2, 4, 7, 9],        rank: 80 },
    { id: 'minorPent',     name: 'Pentatónica menor',   family: 'Pentatónica',    intervals: [0, 3, 5, 7, 10],       rank: 78 },
    { id: 'phrygianDom',   name: 'Frigia dominante',    family: 'Dominante',      intervals: [0, 1, 4, 5, 7, 8, 10], rank: 75 },
    { id: 'lydianDom',     name: 'Lidia dominante',     family: 'Dominante',      intervals: [0, 2, 4, 6, 7, 9, 10], rank: 74 },
    { id: 'melodicMinor',  name: 'Menor melódica',      family: 'Menor',          intervals: [0, 2, 3, 5, 7, 9, 11], rank: 72 },
    { id: 'harmonicMinor', name: 'Menor armónica',      family: 'Menor',          intervals: [0, 2, 3, 5, 7, 8, 11], rank: 70 },
    { id: 'blues',         name: 'Blues',               family: 'Blues',          intervals: [0, 3, 5, 6, 7, 10],    rank: 65 },
    { id: 'altered',       name: 'Alterada',            family: 'Dominante',      intervals: [0, 1, 3, 4, 6, 8, 10], rank: 62 },
    { id: 'locrian',       name: 'Locria',              family: 'Disminuida',     intervals: [0, 1, 3, 5, 6, 8, 10], rank: 60 },
    { id: 'locrianNat2',   name: 'Locria \u266E2',     family: 'Disminuida',     intervals: [0, 2, 3, 5, 6, 8, 10], rank: 58 },
    { id: 'wholeTone',     name: 'Tonos enteros',       family: 'Simétrica',      intervals: [0, 2, 4, 6, 8, 10],    rank: 55 },
    { id: 'harmonicMajor', name: 'Mayor armónica',      family: 'Mayor',          intervals: [0, 2, 4, 5, 7, 8, 11], rank: 52 },
    { id: 'dimWholeHalf',  name: 'Disminuida (T\u2013S)', family: 'Simétrica',   intervals: [0, 2, 3, 5, 6, 8, 9, 11], rank: 50 },
    { id: 'dimHalfWhole',  name: 'Disminuida (S\u2013T)', family: 'Simétrica',   intervals: [0, 1, 3, 4, 6, 7, 9, 10], rank: 50 },
    { id: 'dorianB2',      name: 'Dórica \u266D2',     family: 'Menor',          intervals: [0, 1, 3, 5, 7, 9, 10], rank: 48 },
    { id: 'mixolydianB6',  name: 'Mixolidia \u266D6',  family: 'Dominante',      intervals: [0, 2, 4, 5, 7, 8, 10], rank: 47 },
    { id: 'lydianAug',     name: 'Lidia aumentada',     family: 'Menor melódica', intervals: [0, 2, 4, 6, 8, 9, 11], rank: 45 },
    { id: 'augmented',     name: 'Aumentada',           family: 'Simétrica',      intervals: [0, 3, 4, 7, 8, 11],    rank: 44 },

    /* --- Exóticas y asiáticas --- */
    { id: 'egyptian',       name: 'Egipcia',             family: 'Pentatónica',    intervals: [0, 2, 5, 7, 10],          rank: 40 },
    { id: 'spanish8',       name: 'Española de 8 notas', family: 'Exótica',        intervals: [0, 1, 3, 4, 5, 6, 8, 10], rank: 30 },
    { id: 'japanese1',      name: 'Japonesa 1',          family: 'Asiática',       intervals: [0, 1, 5, 7, 8],           rank: 42 },
    { id: 'japanese2',      name: 'Japonesa 2',          family: 'Asiática',       intervals: [0, 2, 5, 7, 8],           rank: 41 },
    { id: 'iwato',          name: 'Iwato',               family: 'Asiática',       intervals: [0, 1, 5, 6, 10],          rank: 38 },
    { id: 'hirajoshi1',     name: 'Hirajoshi 1',         family: 'Asiática',       intervals: [0, 2, 3, 7, 8],           rank: 43 },
    { id: 'hirajoshi2',     name: 'Hirajoshi 2',         family: 'Asiática',       intervals: [0, 1, 5, 7, 10],          rank: 37 },
    { id: 'chinese',        name: 'China',               family: 'Asiática',       intervals: [0, 4, 6, 7, 11],          rank: 36 },
    { id: 'kumoi',          name: 'Kumoi',               family: 'Asiática',       intervals: [0, 2, 3, 7, 9],           rank: 35 },
    { id: 'overtone',       name: 'Overtone',            family: 'Dominante',      intervals: [0, 2, 4, 6, 7, 9, 10],    rank: 46 },
    { id: 'ultralocrian',   name: 'Ultralocria',         family: 'Disminuida',     intervals: [0, 1, 3, 4, 6, 8, 9],     rank: 25 },
    { id: 'doubleHarmonic', name: 'Doble armónica',      family: 'Exótica',        intervals: [0, 1, 4, 5, 7, 8, 11],    rank: 34 },
    { id: 'persian',        name: 'Persa',               family: 'Exótica',        intervals: [0, 1, 4, 5, 6, 8, 11],    rank: 33 }
  ];

  /* Escalas cuya tónica es la raíz del acorde y que contienen todas sus notas.
     Ordenadas de la más compacta (menos notas extra) a la más amplia. */
  function scalesForChord(pcs, root) {
    const rel = pcs.map((p) => mod12(p - root));
    const out = SCALES.filter((sc) => {
      const set = sc.intervals;
      for (let i = 0; i < rel.length; i++) {
        if (set.indexOf(rel[i]) === -1) return false;
      }
      return true;
    });
    out.sort((a, b) => b.rank - a.rank || a.intervals.length - b.intervals.length);
    return out;
  }

  /* Todas las escalas (de cualquier tónica) que contienen el conjunto de notas.
     Sirve para el buscador de escalas a partir de las notas tocadas. */
  function scalesForNotes(pcs) {
    const set = sortPcs(pcs);
    if (set.length < 2) return [];
    const out = [];
    const seen = new Set();
    for (let root = 0; root < 12; root++) {
      const rel = set.map((p) => mod12(p - root));
      for (let i = 0; i < SCALES.length; i++) {
        const sc = SCALES[i];
        let ok = true;
        for (let j = 0; j < rel.length; j++) {
          if (sc.intervals.indexOf(rel[j]) === -1) { ok = false; break; }
        }
        if (!ok) continue;
        // Las escalas simétricas (tonos enteros, disminuidas) aparecen con
        // varias tónicas y las mismas notas: mostramos una sola vez.
        const pcsKey = sc.intervals.map((iv) => mod12(root + iv)).sort((a, b) => a - b).join(',');
        const key = sc.id + '|' + pcsKey;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ root, scale: sc, extra: sc.intervals.length - rel.length });
      }
    }
    out.sort((a, b) => a.extra - b.extra || b.scale.rank - a.scale.rank || a.root - b.root);
    return out;
  }

  function scaleNotes(root, scale) {
    return scale.intervals.map((iv) => mod12(root + iv));
  }

  const CHORDS = {};
  CHORD_TYPES.forEach((c) => { CHORDS[c.id] = c; });

  const GROUPS = [];
  CHORD_TYPES.forEach((c) => {
    let g = GROUPS.find((x) => x.title === c.group);
    if (!g) { g = { title: c.group, items: [] }; GROUPS.push(g); }
    g.items.push(c.id);
  });

  /* ---------- Utilidades ---------- */
  const mod12 = (n) => ((n % 12) + 12) % 12;

  function noteName(pc, opts) {
    const o = opts || {};
    const flat = !!o.flat;
    const lang = o.lang || 'es';
    let table;
    if (lang === 'en') table = flat ? NOTE.enFlat : NOTE.enSharp;
    else table = flat ? NOTE.esFlat : NOTE.esSharp;
    return table[mod12(pc)];
  }

  const esName = (pc) => NOTE.esSharp[mod12(pc)];
  const enName = (pc) => NOTE.enSharp[mod12(pc)];
  const intervalLabel = (semis) => INTERVALS[mod12(semis)].label;
  const intervalName = (semis) => INTERVALS[mod12(semis)].name;

  const chordSymbol = (root, chord) => enName(root) + (chord ? chord.symbol : '');

  const pitchClasses = (root, intervals) => intervals.map((i) => mod12(root + i));

  const voicingOf = (chord) => (chord.voicing || chord.intervals);

  function sortPcs(pcs) {
    return Array.from(new Set(pcs.map(mod12))).sort((a, b) => a - b);
  }

  /* Nombre del grado que cumple una nota dentro de un acorde concreto.
     La misma tecla puede ser 9ª o 2ª, ♭5 o ♯11, 6ª o 13ª según el acorde. */
  const SUS_IDS = { '7sus4': true, sus4: true, sus2: true };
  const NINTH_IDS = { add9: true, madd9: true, m69: true };

  function degreeOf(chord, semis) {
    if (!chord) return intervalLabel(semis);
    const iv = chord.intervals;
    const hasSeventh = iv.indexOf(10) !== -1 || iv.indexOf(11) !== -1;

    if (semis === 0) return '1';
    if (semis === 7) return '5';
    if (semis === 4) return '3';
    if (semis === 10) return '\u266D7';
    if (semis === 11) return '7';

    if (semis === 3) return iv.indexOf(4) !== -1 ? '\u266F9' : '\u266D3';

    if (semis === 5) return hasSeventh && !SUS_IDS[chord.id] ? '11' : '4';
    if (semis === 2) {
      if (SUS_IDS[chord.id]) return '2';
      if (hasSeventh || NINTH_IDS[chord.id]) return '9';
      return '2';
    }
    if (semis === 9) return hasSeventh ? '13' : '6';
    if (semis === 1) return '\u266D9';
    if (semis === 6) return (chord.id === 's11' || chord.id === '13s11') ? '\u266F11' : '\u266D5';
    if (semis === 8) return '\u266F5';
    return intervalLabel(semis);
  }

  function sameIntervals(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ---------- Identificación ----------
     Devuelve todas las interpretaciones exactas, ordenadas por rank. */
  function identify(pcs) {
    const set = sortPcs(pcs);
    if (set.length < 2) return [];
    const out = [];
    for (let root = 0; root < 12; root++) {
      const rel = set.map((p) => mod12(p - root)).sort((a, b) => a - b);
      for (let i = 0; i < CHORD_TYPES.length; i++) {
        const chord = CHORD_TYPES[i];
        if (sameIntervals(rel, chord.intervals)) {
          out.push({ root, chord, rank: chord.rank });
        }
      }
    }
    out.sort((a, b) => b.rank - a.rank || a.root - b.root);
    return out;
  }

  function describeSet(pcs) {
    return identify(pcs).map((c) => ({
      root: c.root,
      chord: c.chord,
      symbol: chordSymbol(c.root, c.chord)
    }));
  }

  /* Mejor nombre para un conjunto de notas, teniendo en cuenta el bajo.
     Si el bajo coincide con la raíz de alguna interpretación, esa gana:
     {C,E,G,A} con C en el bajo es C6; con A en el bajo es Am7. */
  function best(pcs, bassPc) {
    const cands = identify(pcs);
    if (!cands.length) return null;
    if (bassPc != null) {
      const b = mod12(bassPc);
      const conBajo = cands.filter((c) => c.root === b);
      if (conBajo.length) return conBajo[0];
    }
    return cands[0];
  }

  global.Theory = {
    NOTE,
    INTERVALS,
    CHORD_TYPES,
    CHORDS,
    GROUPS,
    SCALES,
    mod12,
    noteName,
    esName,
    enName,
    intervalLabel,
    intervalName,
    chordSymbol,
    pitchClasses,
    voicingOf,
    sortPcs,
    sameIntervals,
    degreeOf,
    scalesForChord,
    scalesForNotes,
    scaleNotes,
    identify,
    best,
    describeSet
  };
})(window);
