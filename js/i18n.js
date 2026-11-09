/* =====================================================================
   i18n.js — Textos en castellano neutro e inglés.
   ===================================================================== */
(function (global) {
  'use strict';

  const STR = {
    es: {
      'header.donate': 'Donar',
      'header.lang': 'Idioma',

      'key.space': 'Espacio',
      'key.esc': 'Esc',
      'sc.listen': 'Escuchar',
      'sc.transpose': 'Transponer',
      'sc.clear': 'Limpiar',

      'picker.root': 'Tónica',
      'picker.type': 'Tipo de acorde',
      'picker.hint': 'El acorde se arma y suena automáticamente. Después puedes ajustarlo nota por nota en el piano o la guitarra.',

      'piano.title': 'Piano',
      'guitar.title': 'Guitarra',
      'guitar.info': '{n} cuerdas · 12 trastes',
      'guitar.custom': ' · afinación propia',
      'guitar.chords': 'Acordes',
      'guitar.scales': 'Escalas',
      'guitar.removeString': '－ Cuerda',
      'guitar.addString': '＋ Cuerda',
      'guitar.standard': 'Estándar',
      'guitar.tuneAllDown': '−1 st',
      'guitar.tuneAllUp': '+1 st',

      'chord.play': 'Escuchar',
      'chord.stop': 'Detener',
      'chord.loop': 'Loop',
      'chord.add': '＋ Agregar',
      'chord.clear': 'Limpiar',
      'chord.free': 'Sin cifrado estándar',
      'chord.single': 'nota suelta · {oct} · agrega otra para formar un intervalo',
      'chord.interval': '{name} · {n} semitonos',
      'chord.bass': ' · bajo {note}',

      'scale.title': 'Escala y modos',
      'scale.over': 'sobre {root}',
      'scale.withNotes': 'con estas notas',
      'scale.play': '▶ Escala',
      'scale.stop': '■ Parar',
      'scale.search': 'Buscar',
      'scale.emptyNoChord': 'Arma un acorde para ver sus escalas.',
      'scale.emptyNoScale': 'Ninguna escala de la biblioteca contiene todas las notas de este acorde.',
      'scale.emptyNoNotes': 'Agrega notas en el piano o la guitarra para buscar escalas.',
      'scale.emptyFewNotes': 'Agrega al menos 3 notas para buscar escalas.',
      'scale.emptyNone': 'Ninguna escala de la biblioteca contiene todas estas notas.',

      'seq.title': 'Secuencia',
      'seq.play': '▶ Tocar',
      'seq.stop': '■ Parar',
      'seq.loop': 'Loop',
      'seq.clear': 'Limpiar',
      'seq.empty': 'Todavía no hay acordes. Arma uno y agrégalo.',
      'seq.export': '⇩ JSON',
      'seq.import': '⇧ JSON',
      'seq.reps': 'Repeticiones de este acorde',
      'seq.bars': 'Compases de este acorde',
      'seq.note': 'Figura rítmica',
      'seq.dur': 'Duración de este acorde',
      'seq.save': 'Guardar',
      'seq.open': 'Abrir',
      'metro.off': 'Metrónomo: off',
      'metro.auto': 'Metrónomo: secuencia',
      'metro.on': 'Metrónomo: siempre',
      'metro.half': '1/2 BPM',
      'seq.moveBack': 'Mover atrás',
      'seq.moveFwd': 'Mover adelante',
      'seq.copy': 'Copiar',
      'seq.delete': 'Eliminar',
      'seq.step': 'Paso {n}: {sym}',
      'tempo': 'Tempo',
      'tempo.bpm': 'BPM',

      'sound.title': 'Sonido',
      'sound.wave': 'Timbre',
      'sound.volume': 'Volumen',
      'sound.attack': 'Ataque',
      'sound.decay': 'Decay',
      'sound.sustain': 'Sustain',
      'sound.release': 'Release',
      'sound.strum': 'Rasgueo',
      'wave.triangle': 'Triangular',
      'wave.sine': 'Sinusoidal',
      'wave.sawtooth': 'Sierra',
      'wave.square': 'Cuadrada',

      'midi.title': 'MIDI',
      'midi.enable': 'Activar MIDI',
      'midi.channel': 'Canal',
      'midi.locked': 'MIDI bloqueado',
      'midi.off': 'MIDI apagado',
      'chord.emptyPick': 'Elige notas en el piano o la guitarra, o arma el acorde por tónica y tipo',
      'midi.unlockHint': 'La salida MIDI y la exportación se desbloquean con el código de donante.',
      'midi.statusNoDevices': 'MIDI activo, pero no hay dispositivos de salida conectados.',
      'midi.statusActive': 'MIDI activo · {n} salida(s) disponible(s).',
      'midi.statusError': 'No se pudo activar MIDI: {err}. Recuerda servir la app por localhost o https.',

      'msg.firstNote': 'Toca alguna nota primero',
      'msg.buildChord': 'Arma un acorde primero',
      'msg.added': 'Agregado: {sym}',
      'msg.copied': 'Copiado: {sym}',
      'msg.locked': 'Necesitas el código de donante para esto.',
      'msg.exported': 'Secuencia descargada.',
      'msg.imported': 'Secuencia cargada.',
      'msg.importError': 'No se pudo leer el archivo.',

      'modal.title': 'Chord Assist es gratis',
      'modal.body': 'Si la app te resulta útil, puedes invitarme un café y te llevas el código para desbloquear la salida MIDI y la exportación de secuencias.',
      'modal.link': 'Abrir página de donaciones',
      'modal.unlock': 'Código de donante',
      'modal.unlockBtn': 'Desbloquear',
      'modal.unlockOk': 'Listo: MIDI y exportación desbloqueados.',
      'modal.unlockBad': 'El código no es correcto.',
      'modal.close': 'Cerrar',
      'modal.pro': 'Desbloqueado · gracias'
    },

    en: {
      'header.donate': 'Donate',
      'header.lang': 'Language',

      'key.space': 'Space',
      'key.esc': 'Esc',
      'sc.listen': 'Listen',
      'sc.transpose': 'Transpose',
      'sc.clear': 'Clear',

      'picker.root': 'Root',
      'picker.type': 'Chord type',
      'picker.hint': 'The chord is built and played automatically. Then you can tweak it note by note on the piano or guitar.',

      'piano.title': 'Piano',
      'guitar.title': 'Guitar',
      'guitar.info': '{n} strings · 12 frets',
      'guitar.custom': ' · custom tuning',
      'guitar.chords': 'Chords',
      'guitar.scales': 'Scales',
      'guitar.removeString': '－ String',
      'guitar.addString': '＋ String',
      'guitar.standard': 'Standard',
      'guitar.tuneAllDown': '−1 st',
      'guitar.tuneAllUp': '+1 st',

      'chord.play': 'Play',
      'chord.stop': 'Stop',
      'chord.loop': 'Loop',
      'chord.add': '＋ Add',
      'chord.clear': 'Clear',
      'chord.free': 'No standard name',
      'chord.single': 'single note · {oct} · add another one to make an interval',
      'chord.interval': '{name} · {n} semitones',
      'chord.bass': ' · bass {note}',

      'scale.title': 'Scales & modes',
      'scale.over': 'over {root}',
      'scale.withNotes': 'with these notes',
      'scale.play': '▶ Scale',
      'scale.stop': '■ Stop',
      'scale.search': 'Search',
      'scale.emptyNoChord': 'Build a chord to see its scales.',
      'scale.emptyNoScale': 'No scale in the library contains every note of this chord.',
      'scale.emptyNoNotes': 'Add notes on the piano or guitar to search scales.',
      'scale.emptyFewNotes': 'Add at least 3 notes to search scales.',
      'scale.emptyNone': 'No scale in the library contains all these notes.',

      'seq.title': 'Sequence',
      'seq.play': '▶ Play',
      'seq.stop': '■ Stop',
      'seq.loop': 'Loop',
      'seq.clear': 'Clear',
      'seq.empty': 'No chords yet. Build one and add it.',
      'seq.export': '⇩ JSON',
      'seq.import': '⇧ JSON',
      'seq.reps': 'Repeats for this chord',
      'seq.bars': 'Bars for this chord',
      'seq.note': 'Note value',
      'seq.dur': 'Duration of this chord',
      'seq.save': 'Save',
      'seq.open': 'Open',
      'metro.off': 'Metronome: off',
      'metro.auto': 'Metronome: sequence',
      'metro.on': 'Metronome: always',
      'metro.half': '1/2 BPM',
      'seq.moveBack': 'Move back',
      'seq.moveFwd': 'Move forward',
      'seq.copy': 'Copy',
      'seq.delete': 'Delete',
      'seq.step': 'Step {n}: {sym}',
      'tempo': 'Tempo',
      'tempo.bpm': 'BPM',

      'sound.title': 'Sound',
      'sound.wave': 'Timbre',
      'sound.volume': 'Volume',
      'sound.attack': 'Attack',
      'sound.decay': 'Decay',
      'sound.sustain': 'Sustain',
      'sound.release': 'Release',
      'sound.strum': 'Strum',
      'wave.triangle': 'Triangle',
      'wave.sine': 'Sine',
      'wave.sawtooth': 'Saw',
      'wave.square': 'Square',

      'midi.title': 'MIDI',
      'midi.enable': 'Enable MIDI',
      'midi.channel': 'Channel',
      'midi.locked': 'MIDI locked',
      'midi.off': 'MIDI off',
      'chord.emptyPick': 'Pick notes on the piano or guitar, or build a chord by root and type',
      'midi.unlockHint': 'MIDI output and export are unlocked with the donor code.',
      'midi.statusNoDevices': 'MIDI on, but no output devices connected.',
      'midi.statusActive': 'MIDI on · {n} output(s) available.',
      'midi.statusError': 'Could not enable MIDI: {err}. Remember to serve the app from localhost or https.',

      'msg.firstNote': 'Play a note first',
      'msg.buildChord': 'Build a chord first',
      'msg.added': 'Added: {sym}',
      'msg.copied': 'Copied: {sym}',
      'msg.locked': 'You need the donor code for this.',
      'msg.exported': 'Sequence downloaded.',
      'msg.imported': 'Sequence loaded.',
      'msg.importError': 'Could not read the file.',

      'modal.title': 'Chord Assist is free',
      'modal.body': 'If the app helps you, you can buy me a coffee and get the code to unlock MIDI output and sequence export.',
      'modal.link': 'Open the donation page',
      'modal.unlock': 'Donor code',
      'modal.unlockBtn': 'Unlock',
      'modal.unlockOk': 'Done: MIDI and export unlocked.',
      'modal.unlockBad': 'That code is not correct.',
      'modal.close': 'Close',
      'modal.pro': 'Unlocked · thank you'
    }
  };

  /* Nombres de escalas en inglés (el id es el de theory.js) */
  const SCALE_EN = {
    ionian: 'Ionian', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian',
    mixolydian: 'Mixolydian', aeolian: 'Aeolian (minor)', locrian: 'Locrian',
    harmonicMinor: 'Harmonic minor', melodicMinor: 'Melodic minor',
    majorPent: 'Major pentatonic', minorPent: 'Minor pentatonic', blues: 'Blues',
    wholeTone: 'Whole tone', dimWholeHalf: 'Diminished (W–H)', dimHalfWhole: 'Diminished (H–W)',
    phrygianDom: 'Phrygian dominant', lydianDom: 'Lydian dominant', locrianNat2: 'Locrian ♮2',
    altered: 'Altered', harmonicMajor: 'Harmonic major', dorianB2: 'Dorian ♭2',
    mixolydianB6: 'Mixolydian ♭6', lydianAug: 'Lydian augmented', augmented: 'Augmented',
    egyptian: 'Egyptian', spanish8: 'Eight tone Spanish', japanese1: 'Japanese 1',
    japanese2: 'Japanese 2', iwato: 'Iwato', hirajoshi1: 'Hirajoshi 1',
    hirajoshi2: 'Hirajoshi 2', chinese: 'Chinese', kumoi: 'Kumoi', overtone: 'Overtone',
    ultralocrian: 'Ultralocrian', doubleHarmonic: 'Double harmonic', persian: 'Persian'
  };

  let lang = 'es';

  function t(key, vars) {
    const dict = STR[lang] || STR.es;
    let s = dict[key];
    if (s == null) s = STR.es[key];
    if (s == null) s = key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : ''));
    }
    return s;
  }

  function setLang(l) {
    lang = STR[l] ? l : 'es';
    try { document.documentElement.lang = lang; } catch (e) { /* noop */ }
  }

  const getLang = () => lang;

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  function scaleName(sc) {
    if (!sc) return '';
    return lang === 'en' ? (SCALE_EN[sc.id] || sc.name) : sc.name;
  }

  global.I18N = { t, setLang, getLang, apply, scaleName, STR };
})(window);
