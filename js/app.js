/* =====================================================================
   app.js — Chord Assist

   Acorde actual = conjunto de notas MIDI. De ahí salen el cifrado, el
   piano, la guitarra, la escala elegida y la secuencia.
   ===================================================================== */
(function () {
  'use strict';

  const T = window.Theory;
  const I = window.I18N;
  const A = window.AudioEngine;
  const MIDI = window.MidiOut;

  const t = (key, vars) => I.t(key, vars);
  const lang = () => I.getLang();
  const $ = (id) => document.getElementById(id);

  const NS = 'http://www.w3.org/2000/svg';
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];
  const MIN_STRINGS = 4;
  const MAX_STRINGS = 8;
  const TUNING_KEY = 'chord-assist.tuning';
  const LANG_KEY = 'chord-assist.lang';
  const PRO_KEY = 'chord-assist.pro';
  /* Sin llave maestra pública: las licencias de soporte se emiten en el VPS
     con: sudo -u paypal npm run issue -- --email ... */
  const PRO_CODE = '';
  /* URL del bot de licencias (VPS). Dejar vacío para validar sólo con la llave maestra. */
  const LICENSE_API = 'https://mqtt.domoticargentina.com/paypal';
  /* Link de pago de PayPal (Payment Link o botón). Vacío = oculta el botón de compra. */
  const PAYPAL_LINK = 'buy.html';
  /* Cada 5 minutos se recuerda la donación con un modal dentro de la app.
     Si prefieres una ventana aparte, cambia openModal() por:
       window.open('donate.html', 'chordAssistDonate', 'width=560,height=760')
     Ojo: los navegadores bloquean las ventanas que no nacen de un clic. */
  const DONATE_EVERY_MS = 5 * 60 * 1000;

  const PIANO_START = 36;   // C2
  const PIANO_OCTAVES = 3;  // hasta B4
  const PICKER_BASE = 48;   // C3

  const BEATS_CYCLE = [4, 2, 1, 0.5];
  const BARS_CYCLE = [1, 2, 4, 8, 0.5, 0.25];
  const BEATS_LABEL = { 0.5: '1/8', 1: '1/4', 2: '1/2', 4: '1/1' };

  const INTERVAL_EN = [
    'unison', 'minor second', 'major second', 'minor third', 'major third',
    'perfect fourth', 'tritone', 'perfect fifth', 'augmented fifth',
    'major sixth', 'minor seventh', 'major seventh'
  ];

  const mod12 = (n) => ((n % 12) + 12) % 12;
  const round = (v) => Math.round(v * 10) / 10;
  const octaveOf = (m) => Math.floor(m / 12) - 1;

  const svgEl = (name, attrs) => {
    const el = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  function emptyDrums() {
    return {
      rows: [
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0)
      ],
      length: 16,
      speed: 1,
      notes: [46, 51, 39, 37, 49, 42, 38, 36]
    };
  }

  function cloneDrums(d) {
    if (!d || !Array.isArray(d.rows)) return emptyDrums();
    let rows = d.rows;
    if (rows.length === 4) {
      rows = [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)].concat(rows);
    }
    if (rows.length !== 8) return emptyDrums();

    let notes;
    if (Array.isArray(d.notes) && d.notes.length === 8) notes = d.notes.slice();
    else if (Array.isArray(d.notes) && d.notes.length === 4) notes = [46, 51, 39, 37].concat(d.notes);
    else notes = [46, 51, 39, 37, 49, 42, 38, 36];

    return {
      rows: rows.map((r) => (Array.isArray(r)
        ? r.slice(0, 16).map((v) => (v ? 1 : 0))
        : new Array(16).fill(0))),
      length: Math.max(1, Math.min(16, d.length || 16)),
      speed: d.speed === 2 ? 2 : 1,
      notes: notes.map((n) => Math.max(0, Math.min(127, n | 0)))
    };
  }

  function hasDrumHits(d) {
    if (!d) return false;
    for (let c = 0; c < d.length; c++) {
      for (let r = 0; r < d.rows.length; r++) if (d.rows[r][c]) return true;
    }
    return false;
  }

  const state = {
    notes: new Set(),
    root: 0,
    explicitType: null,
    flat: false,
    chordPlaying: false,
    lastAdded: null,
    scaleSpeed: 1,
    scaleLoop: false,
    scaleOctave: 0,
    sequence: [],
    seqPlaying: false,
    seqIndex: 0,
    seqLoop: false,
    activeStep: -1,
    info: null,
    scaleSuggestions: [],
    scaleId: null,
    scaleRoot: 0,
    scaleManual: false,
    scalePcs: new Set(),
    scalePlaying: false,
    searchMode: 'chords',
    chordLoop: false,
    metronome: 'off',
    metroHalf: false,
    chordChannel: 1,
    scaleChannel: 2,
    bassChannel: 3,
    drumChannel: 10,
    bassOut: false,
    scaleAutoplay: false,
    bass: {
      enabled: false,
      waveform: 'triangle',
      volume: 0.8,
      figure: 2,
      length: 1,
      octave: 0
    },
    drumVolume: 0.9,
    drumMuted: false,
    editingIndex: null,
    drumClock: null,
    chordVolume: 1,
    seqName: 'Untitled',
    arp: null,
    arpSpeed: 1,
    arpPlaying: false,
    arpLoop: false,
    arpAuto: false,
    arpOctave: 0,
    seqArp: { cols: 16, speed: 1, volume: 0.8, auto: false, cells: {} },
    seqArpPlaying: false,
    scalePattern: 'upDown',
    scaleSeed: 20260101,
    scaleProbe: new Set(),
    triad: null,
    triadPlaying: false,
    triadLoop: false,
    triadAuto: false,
    triadOctave: 0,
    triadSpeed: 1,
    sections: [],
    suggAuto: true,
    suggRoot: 0,
    suggScaleId: 'ionian',
    bassOut: false,
    drums: emptyDrums(),
    drumAudition: false,
    guitarTuning: STANDARD_TUNING.slice()
  };

  let seqTimer = null;
  let chordMidiTimer = null;
  let metroTimer = null;
  let metroOrigin = 0;
  let metroIndex = 0;
  let seqOrigin = 0;
  let seqStepStart = 0;
  let hintTimer = null;
  let modalTimer = null;

  /* ---------------------------------------------------------------- */
  /* Derivados                                                         */
  /* ---------------------------------------------------------------- */
  const notesSorted = () => Array.from(state.notes).sort((a, b) => a - b);
  const pcsOf = () => T.sortPcs(notesSorted().map((m) => m % 12));
  const scaleSearchPcs = () => {
    const base = pcsOf();
    if (state.searchMode !== 'scales' || !state.scaleProbe || !state.scaleProbe.size) return base;
    const set = new Set(base);
    state.scaleProbe.forEach((m) => set.add(mod12(m)));
    return T.sortPcs(Array.from(set));
  };
  const bassMidi = () => (state.notes.size ? notesSorted()[0] : null);
  const bassPc = () => (state.notes.size ? mod12(bassMidi()) : null);

  /* Cifrado: siempre C, C#, D… */
  function nameOf(pc) {
    return state.flat ? T.noteName(pc, { lang: 'en', flat: true }) : T.enName(pc);
  }

  /* Nombre de la nota en el idioma de la interfaz */
  function localNote(pc) {
    return lang() === 'en' ? nameOf(pc) : T.noteName(pc, { flat: state.flat });
  }

  function intervalName(semis) {
    return lang() === 'en' ? INTERVAL_EN[mod12(semis)] : T.intervalName(semis);
  }

  function chordQuality(chord) {
    return lang() === 'en' ? chord.label : chord.es;
  }

  function scaleLabel(sc) {
    return I.scaleName(sc);
  }

  function currentInfo() {
    const notes = notesSorted();
    if (!notes.length) return null;

    const pcs = T.sortPcs(notes.map((m) => m % 12));
    const bass = mod12(notes[0]);

    let root = null;
    let chord = null;
    if (state.explicitType && T.CHORDS[state.explicitType]) {
      chord = T.CHORDS[state.explicitType];
      root = state.root;
    } else {
      const found = T.best(pcs, bass);
      if (found) { root = found.root; chord = found.chord; }
    }

    let symbol = '';
    let name = '';
    if (chord) {
      symbol = nameOf(root) + chord.symbol;
      if (bass !== root) symbol += '/' + nameOf(bass);
      name = localNote(root) + ' ' + chordQuality(chord);
      if (bass !== root) name += t('chord.bass', { note: localNote(bass) + octaveOf(notes[0]) });
    } else {
      root = bass;
      name = t('chord.free');
    }

    return { notes, pcs, bass, root, chord, symbol, name };
  }

  /* ---------------------------------------------------------------- */
  /* Acciones sobre el acorde                                          */
  /* ---------------------------------------------------------------- */
  function toggleNote(midi) {
    if (state.searchMode === 'scales') {
      if (pcsOf().indexOf(mod12(midi)) !== -1) return;
      if (state.scaleProbe.has(midi)) state.scaleProbe.delete(midi);
      else {
        state.scaleProbe.add(midi);
        A.preview(midi);
        if (isPro() && MIDI.enabled) MIDI.sendNote(midi, 350, state.scaleChannel);
      }
      if (state.scalePlaying) stopScale();
      render();
      return;
    }

    if (state.seqPlaying) stopSequence();
    if (state.scalePlaying) stopScale();
    if (state.arpPlaying) stopArp();
    if (state.seqArpPlaying) stopSeqArp();
    if (state.triadPlaying) stopTriad();
    state.scaleManual = false;

    if (state.notes.has(midi)) {
      state.notes.delete(midi);
    } else {
      state.notes.add(midi);
      A.preview(midi);
      if (isPro() && MIDI.enabled) MIDI.sendNote(midi, 350);
    }
    state.explicitType = null;
    if (state.chordPlaying) A.setNotes(notesSorted());
    render();

    const added = mod12(midi);
    if (state.notes.has(midi)) {
      state.lastAdded = added;
      setTimeout(() => {
        state.lastAdded = null;
        document.querySelectorAll('.pill.is-new').forEach((el) => el.classList.remove('is-new'));
      }, 750);
    }
  }

  function transpose(delta) {
    if (!state.notes.size) return;
    const next = new Set();
    state.notes.forEach((m) => {
      const n = m + delta;
      if (n > 0 && n < 128) next.add(n);
    });
    if (!next.size) return;
    state.notes = next;
    if (state.explicitType) state.root = mod12(state.root + delta);
    state.scaleManual = false;
    render();
    if (state.chordPlaying) A.setNotes(notesSorted());
  }

  function clearNotes() {
    if (state.seqPlaying) stopSequence();
    if (state.scalePlaying) stopScale();
    state.scaleManual = false;
    state.notes.clear();
    state.explicitType = null;
    if (state.chordPlaying) A.setNotes(notesSorted());
    render();
  }

  function applyPicker() {
    if (state.scalePlaying) stopScale();
    state.scaleManual = false;
    const root = parseInt($('rootSel').value, 10);
    const typeId = $('typeSel').value;
    const chord = T.CHORDS[typeId];
    if (!chord || Number.isNaN(root)) return;

    const voicing = T.voicingOf(chord);
    const base = PICKER_BASE + root;
    state.notes = new Set(voicing.map((iv) => base + iv));
    state.root = root;
    state.explicitType = typeId;
    render();
    playCurrent();
  }

  function syncPickerFromChord() {
    if (state.explicitType && T.CHORDS[state.explicitType]) {
      $('rootSel').value = String(state.root);
      $('typeSel').value = state.explicitType;
      return;
    }
    const info = currentInfo();
    if (!info || !info.chord) return;
    $('rootSel').value = String(info.root);
    $('typeSel').value = info.chord.id;
  }

  /* ---------------------------------------------------------------- */
  /* Sonido                                                           */
  /* ---------------------------------------------------------------- */
  function syncBassOptions() {
    A.setLayerOptions('bass', {
      waveform: state.bass.waveform,
      gain: 0.9 * state.bass.volume
    });
  }

  function syncBassUI() {
    const b = state.bass;
    const on = $('bassOn');
    const wav = $('bassWave');
    const vol = $('bassVol');
    const fig = $('bassFigure');
    const len = $('bassLength');
    const dn = $('bassOctDown');
    const up = $('bassOctUp');
    if (on) on.checked = !!b.enabled;
    if (wav) wav.value = b.waveform;
    if (vol) vol.value = String(b.volume);
    if (fig) fig.value = String(b.figure);
    if (len) len.value = String(b.length);
    if (dn) dn.classList.toggle('is-active', (b.octave || 0) < 0);
    if (up) up.classList.toggle('is-active', (b.octave || 0) > 0);
    syncBassOptions();
  }

  function startBass(startTime, totalDur) {
    const b = state.bass;
    if (!b.enabled) return;
    if (!state.info || state.info.root == null) return;

    const note = Math.max(0, Math.min(127, 36 + state.info.root + (b.octave || 0) * 12));
    const beat = 60 / A.Settings.bpm;
    const interval = Math.max(0.05, b.figure * beat);
    const dur = Math.max(0.04, b.length * beat);
    const strikes = totalDur ? Math.max(1, Math.round(totalDur / interval)) : 1;

    A.setLayerOptions('bass', { waveform: b.waveform, gain: 0.9 * b.volume });
    A.pattern([note], {
      layer: 'bass',
      startTime: startTime,
      strikes: strikes,
      intervalMs: interval * 1000,
      durMs: dur * 1000,
      repeat: !totalDur
    });

    if (isPro() && MIDI.enabled) {
      const n = totalDur ? strikes : Math.max(1, Math.round((4 * beat) / interval));
      MIDI.sendPattern([note], n, interval * 1000, dur * 1000, state.bassChannel);
    }
  }

  function stopBass() {
    A.stopLayer('bass');
    if (isPro() && MIDI.enabled) MIDI.stopChannel(state.bassChannel);
  }

  function syncChordNotes() {
    if (state.chordPlaying) A.setNotes(notesSorted());
  }

  function playCurrent() {
    const notes = notesSorted();
    if (!notes.length) {
      flash(t('msg.firstNote'));
      return;
    }
    state.chordPlaying = true;
    A.setLayerOptions('chord', { gain: state.chordVolume });
    A.start(notes, { mode: 'block', repeat: state.chordLoop, bpm: A.Settings.bpm });
    updatePlayBtn();
    startChordMidiLoop();

    if (state.scaleAutoplay && selectedScale()) {
      startScaleAt(A.now() + 0.06);
      state.scalePlaying = true;
      updateScaleBtn();
    }

    if (state.bass.enabled) {
      const beat = 60 / A.Settings.bpm;
      startBass(A.now() + 0.05, state.chordLoop ? null : beat * 2);
    }

    if (state.arpAuto && state.arp) {
      startArpAt(A.now() + 0.06);
    }

    if (state.triadAuto && state.triad) {
      startTriadAt(A.now() + 0.06);
    }

    if (state.seqArp.auto) {
      const cols = state.seqArp.cols;
      const stepSec = ((60 / A.Settings.bpm) / 4) / (state.seqArp.speed || 1);
      startSeqArpAt(A.now() + 0.06, cols * stepSec);
    }

    if (!state.drumMuted && hasDrumHits(state.drums)) {
      const beat = 60 / A.Settings.bpm;
      const colDur = (beat / 4) / (state.drums.speed || 1);
      const at = A.now() + 0.05;
      A.drumStart(
        { rows: state.drums.rows, length: state.drums.length, colDur: colDur },
        { startTime: at, totalDur: state.drums.length * colDur }
      );
      state.drumClock = { start: at, colDur: colDur, length: state.drums.length };
      startCursorLoop();
    }
  }

  function midiChord(notes, durMs) {
    if (!isPro() || !MIDI.enabled) return;
    MIDI.sendNotes(notes, durMs, state.chordChannel);
    if (state.bass.enabled && state.info && state.info.root != null) {
      MIDI.sendNotes([36 + state.info.root + (state.bass.octave || 0) * 12], durMs, state.bassChannel);
    }
  }

  function midiBassBar() {
    if (!state.bass.enabled || !isPro() || !MIDI.enabled) return;
    if (!state.info || state.info.root == null) return;
    const beat = 60 / A.Settings.bpm;
    const interval = Math.max(0.05, state.bass.figure * beat);
    const dur = Math.max(0.04, state.bass.length * beat);
    const n = Math.max(1, Math.round((4 * beat) / interval));
    const note = Math.max(0, Math.min(127, 36 + state.info.root + (state.bass.octave || 0) * 12));
    MIDI.sendPattern([note], n, interval * 1000, dur * 1000, state.bassChannel);
  }

  function startChordMidiLoop() {
    clearChordMidiLoop();
    if (!isPro() || !MIDI.enabled) return;
    const notes = notesSorted();
    if (!notes.length) return;
    const step = (60000 / A.Settings.bpm) * 2;
    midiChord(notes, step * 0.95);
    if (state.chordLoop) {
      chordMidiTimer = setInterval(() => {
        if (!state.chordPlaying) { clearChordMidiLoop(); return; }
        midiChord(notesSorted(), step * 0.95);
        midiBassBar();
      }, step);
    }
  }

  function clearChordMidiLoop() {
    if (chordMidiTimer) { clearInterval(chordMidiTimer); chordMidiTimer = null; }
  }

  function midiBusy() {
    return state.chordPlaying || state.seqPlaying || state.scalePlaying;
  }

  function stopAllSound() {
    if (state.seqPlaying) stopSequence();
    if (state.chordPlaying) stopPlay();
    if (state.scalePlaying) stopScale();
    if (state.drumAudition) {
      A.stopDrum();
      state.drumAudition = false;
      updateDrumControls();
    }
    state.drumClock = null;
    A.stop();
    if (isPro() && MIDI.enabled) MIDI.allNotesOff();
  }

  function stopPlay() {
    A.stopLayer('chord');
    stopBass();
    clearChordMidiLoop();
    state.chordPlaying = false;
    updatePlayBtn();
    if (isPro() && MIDI.enabled) {
      MIDI.stopChannel(state.chordChannel);
      if (state.bass.enabled) MIDI.stopChannel(state.bassChannel);
    }
  }

  function togglePlay() {
    if (state.chordPlaying) stopPlay(); else playCurrent();
  }

  A.onEnd = function (layer) {
    if (layer === 'chord') {
      state.chordPlaying = false;
      A.stopLayer('bass');
      updatePlayBtn();
    } else if (layer === 'scale') {
      state.scalePlaying = false;
      updateScaleBtn();
    } else if (layer === 'arp') {
      state.arpPlaying = false;
      updateArpBtn();
    }
  };

  /* ---------------------------------------------------------------- */
  function addCurrent() {
    const info = currentInfo();
    if (!info || !info.notes.length) {
      flash(t('msg.buildChord'));
      return;
    }
    const editing = state.editingIndex != null && !!state.sequence[state.editingIndex];
    const prev = editing ? state.sequence[state.editingIndex] : null;
    const sc = selectedScale();
    const entry = {
      notes: info.notes.slice(),
      symbol: info.symbol || info.pcs.map(localNote).join(' '),
      name: info.name,
      root: info.root,
      typeId: state.explicitType,
      bars: prev ? (prev.bars || 1) : 1,
      beats: prev ? (prev.beats || 4) : 4,
      scaleId: sc ? sc.id : null,
      scaleRoot: sc ? state.scaleRoot : null,
      scaleName: sc ? scaleLabel(sc) : null,
      drums: cloneDrums(state.drums),
      section: prev ? (prev.section || null) : null,
      bass: Object.assign({}, state.bass),
      scaleAuto: state.scaleAutoplay,
      arpAuto: state.arpAuto,
      arpKey: state.arp ? state.arp.key : null,
      triadAuto: state.triadAuto,
      seqarp: cloneSeqArp(state.seqArp)
    };

    if (editing) {
      state.sequence[state.editingIndex] = Object.assign({}, prev, entry);
      state.editingIndex = null;
    } else {
      state.sequence.push(entry);
    }

    renderSteps();
    updateEditUI();
    flash(editing ? t('msg.updated') : t('msg.added', { sym: info.symbol || '' }));
    playCurrent();
  }

  function editStep(i) {
    const step = state.sequence[i];
    if (!step) return;
    const info = currentInfo();
    if (!info || !info.notes.length) {
      flash(t('msg.buildChord'));
      return;
    }
    const sc = selectedScale();
    state.sequence[i] = Object.assign({}, step, {
      notes: info.notes.slice(),
      symbol: info.symbol || info.pcs.map(localNote).join(' '),
      name: info.name,
      root: info.root,
      typeId: state.explicitType,
      scaleId: sc ? sc.id : null,
      scaleRoot: sc ? state.scaleRoot : null,
      scaleName: sc ? scaleLabel(sc) : null,
      drums: cloneDrums(state.drums),
      bass: Object.assign({}, state.bass),
      scaleAuto: state.scaleAutoplay,
      arpAuto: state.arpAuto,
      arpKey: state.arp ? state.arp.key : null,
      triadAuto: state.triadAuto,
      seqarp: cloneSeqArp(state.seqArp)
    });
    state.activeStep = i;
    state.editingIndex = null;
    renderSteps();
    updateEditUI();
    flash(t('msg.savedStep'));
  }

  function cancelEdit() {
    if (state.editingIndex == null) return;
    state.editingIndex = null;
    renderSteps();
    updateEditUI();
  }

  function updateEditUI() {
    const add = $('addBtn');
    const cancel = $('cancelEdit');
    const editing = state.editingIndex != null;
    if (add) add.textContent = editing ? t('chord.saveEdit') : t('chord.add');
    if (cancel) cancel.hidden = !editing;
  }

  function cycleBars(i) {
    const step = state.sequence[i];
    if (!step) return;
    const cur = step.bars || 1;
    const idx = BARS_CYCLE.indexOf(cur);
    step.bars = BARS_CYCLE[(idx === -1 ? 0 : idx + 1) % BARS_CYCLE.length];
    renderSteps();
  }

  function cycleBeats(i) {
    const step = state.sequence[i];
    if (!step) return;
    const cur = step.beats || 4;
    const idx = BEATS_CYCLE.indexOf(cur);
    step.beats = BEATS_CYCLE[(idx + 1) % BEATS_CYCLE.length];
    renderSteps();
  }

  function moveStep(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.sequence.length) return;
    const tmp = state.sequence[i];
    state.sequence[i] = state.sequence[j];
    state.sequence[j] = tmp;
    if (state.activeStep === i) state.activeStep = j;
    else if (state.activeStep === j) state.activeStep = i;
    renderSteps();
  }

  function copyStep(i) {
    const step = state.sequence[i];
    if (!step) return;
    state.sequence.splice(i + 1, 0, {
      notes: step.notes.slice(),
      symbol: step.symbol,
      name: step.name,
      root: step.root,
      typeId: step.typeId,
      bars: step.bars || 1,
      beats: step.beats || 4,
      scaleId: step.scaleId,
      scaleRoot: step.scaleRoot,
      scaleName: step.scaleName,
      drums: cloneDrums(step.drums),
      section: step.section || null,
      bass: Object.assign({}, step.bass || state.bass),
      scaleAuto: !!step.scaleAuto,
      arpAuto: !!step.arpAuto,
      arpKey: step.arpKey || null,
      seqarp: cloneSeqArp(step.seqarp)
    });
    renderSteps();
    flash(t('msg.copied', { sym: step.symbol }));
  }

  function removeStep(i) {
    state.sequence.splice(i, 1);
    if (state.activeStep >= state.sequence.length) state.activeStep = -1;
    renderSteps();
  }

  function genChord(rootPc, typeId) {
    const chord = T.CHORDS[typeId];
    if (!chord) return null;
    const r = T.mod12(rootPc);
    return {
      root: r,
      typeId: typeId,
      notes: T.voicingOf(chord).map((iv) => PICKER_BASE + r + iv),
      symbol: T.chordSymbol(r, chord),
      name: T.esName(r) + ' ' + chord.es
    };
  }

  function genDiatonic(rootPc, minor, degree) {
    const majorTypes = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
    const minorTypes = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    const minorScale = [0, 2, 3, 5, 7, 8, 10];
    const scale = minor ? minorScale : majorScale;
    const types = minor ? minorTypes : majorTypes;
    return genChord(rootPc + scale[degree], types[degree]);
  }

  function generateSong(skipConfirm) {
    if (!skipConfirm && !window.confirm(t('gen.confirm'))) return;
    stopSequence();

    const minor = Math.random() < 0.45;
    const root = Math.floor(Math.random() * 12);
    const majorProgs = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 0, 4], [1, 4, 0, 5]];
    const minorProgs = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 3, 5, 6]];
    const progs = minor ? minorProgs : majorProgs;
    const pick = () => progs[Math.floor(Math.random() * progs.length)];

    const verse = pick();
    const chorus = pick();
    const bridge = pick();

    const plan = [
      { name: 'intro', prog: [verse[0], verse[1]] },
      { name: 'verse', prog: verse },
      { name: 'chorus', prog: chorus },
      { name: 'bridge', prog: bridge },
      { name: 'interlude', prog: [chorus[0], chorus[1]] },
      { name: 'verse', prog: verse },
      { name: 'chorus', prog: chorus },
      { name: 'outro', prog: [chorus[0], chorus[1]] }
    ];

    const steps = [];
    const sections = [];

    const seen = {};
    plan.forEach((part) => {
      seen[part.name] = (seen[part.name] || 0) + 1;
      const secName = seen[part.name] === 1 ? part.name : part.name + '-' + seen[part.name];
      sections.push(secName);
      part.prog.forEach((deg) => {
        const ch = genDiatonic(root, minor, deg);
        if (!ch) return;
        steps.push({
          notes: ch.notes,
          symbol: ch.symbol,
          name: ch.name,
          root: ch.root,
          typeId: ch.typeId,
          bars: 1,
          beats: 4,
          scaleId: null,
          scaleRoot: null,
          scaleName: null,
          drums: emptyDrums(),
          section: secName,
          bass: { enabled: false, waveform: 'triangle', volume: 0.8, figure: 2, length: 1, octave: 0 },
          scaleAuto: false,
          arpAuto: false,
          arpKey: null,
          seqarp: cloneSeqArp(null)
        });
      });
    });

    state.sequence = steps;
    state.sections = sections;
    state.activeStep = -1;
    state.editingIndex = null;
    renderSteps();
    updateEditUI();
    flash(t('gen.done') + ' · ' + localNote(root) + (minor ? ' menor' : ' mayor'));
  }

  function updateSeqFile() {
    const el = $('seqFileName');
    if (el) el.textContent = state.seqName || t('seq.untitled');
  }

  function clearSequence() {
    stopSequence();
    state.sequence = [];
    state.sections = [];
    state.seqName = t('seq.untitled');
    updateSeqFile();
    state.activeStep = -1;
    state.editingIndex = null;
    renderSteps();
    updateEditUI();
  }

  function loadStep(i, play) {
    const step = state.sequence[i];
    if (!step) return;
    if (state.scalePlaying) stopScale();
    state.notes = new Set(step.notes);
    state.root = step.root;
    state.explicitType = step.typeId || null;
    if (step.scaleId) {
      state.scaleId = step.scaleId;
      state.scaleRoot = step.scaleRoot != null ? step.scaleRoot : step.root;
      state.scaleManual = true;
    } else {
      state.scaleManual = false;
    }
    state.activeStep = i;
    state.scaleProbe = new Set();
    state.drums = cloneDrums(step.drums);
    state.scaleAutoplay = !!step.scaleAuto;
    state.arpAuto = !!step.arpAuto;
    state.triadAuto = !!step.triadAuto;
    if (step.seqarp) {
      state.seqArp = cloneSeqArp(step.seqarp);
      seqArpSig = '';
    }
    state.arpKeyPending = step.arpKey || null;
    updateScaleControls();
    updateArpBtn();
    updateTriadBtn();
    updateSeqArpBtn();
    if (step.bass) {
      state.bass = Object.assign({
        enabled: false,
        waveform: 'triangle',
        volume: 0.8,
        figure: 2,
        length: 1,
        octave: 0
      }, step.bass);
      syncBassUI();
    }
    if (state.chordPlaying) A.setNotes(notesSorted());
    render();
    syncDrums();
    if (play) playCurrent();
  }

  function playSequence() {
    if (!state.sequence.length) return;
    if (state.seqPlaying) { stopSequence(); return; }
    A.ensure();
    state.seqPlaying = true;
    state.seqIndex = (state.activeStep >= 0 && state.activeStep < state.sequence.length)
      ? state.activeStep
      : 0;
    if (state.editingIndex != null) cancelEdit();
    seqOrigin = A.now() + 0.15;
    seqStepStart = seqOrigin;
    updateSeqPlay();
    if (state.metronome !== 'off') startMetro(seqOrigin);
    scheduleStep();
  }

  function scheduleStep() {
    if (!state.seqPlaying) return;
    if (state.seqIndex >= state.sequence.length) {
      if (state.seqLoop) state.seqIndex = 0;
      else { stopSequence(); return; }
    }

    const i = state.seqIndex;
    const step = state.sequence[i];
    loadStep(i, false);

    const beat = 60 / A.Settings.bpm;
    const bars = Math.max(0.25, step.bars || 1);
    const figure = step.beats || 4;
    const stepDur = bars * 4 * beat;
    const interval = Math.max(0.06, figure * beat);
    const strikes = Math.max(1, Math.round(stepDur / interval));
    const notes = notesSorted();

    A.pattern(notes, {
      startTime: seqStepStart,
      strikes: strikes,
      intervalMs: interval * 1000,
      durMs: interval * 920,
      keepTail: true
    });
    if (isPro() && MIDI.enabled) {
      MIDI.sendPattern(notes, strikes, interval * 1000, interval * 900, state.chordChannel);
      if (state.bassOut && state.info && state.info.root != null) {
        MIDI.sendNotes([36 + state.info.root], stepDur * 0.9, state.bassChannel);
      }
    }

    if (!state.drumMuted && hasDrumHits(step.drums)) {
      const colDur = (beat / 4) / (step.drums.speed || 1);
      A.drumStart(
        { rows: step.drums.rows, length: step.drums.length, colDur: colDur },
        { startTime: seqStepStart, totalDur: stepDur }
      );
      state.drumClock = { start: seqStepStart, colDur: colDur, length: step.drums.length };
      startCursorLoop();
    } else {
      state.drumClock = null;
    }

    if (state.scaleAutoplay && selectedScale()) {
      startScaleAt(seqStepStart, stepDur);
      state.scalePlaying = true;
      updateScaleBtn();
    }

    if (state.arpAuto && state.arp) {
      startArpAt(seqStepStart, stepDur);
    }

    if (state.seqArp.auto) startSeqArpAt(seqStepStart, stepDur);
    if (state.triadAuto && state.triad) startTriadAt(seqStepStart, stepDur);

    if (state.bass.enabled) startBass(seqStepStart, stepDur);

    seqStepStart += stepDur;
    state.seqIndex++;
    const waitMs = Math.max(60, (seqStepStart - A.now()) * 1000 - 40);
    seqTimer = setTimeout(scheduleStep, waitMs);
  }

  function stopSequence() {
    state.seqPlaying = false;
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    state.activeStep = -1;
    if (state.metronome === 'auto') stopMetro();
    A.stopLayer('seq');
    A.stopLayer('bass');
    A.stopDrum();
    state.drumClock = null;
    if (isPro() && MIDI.enabled) {
      MIDI.stopChannel(state.chordChannel);
      if (state.bassOut) MIDI.stopChannel(state.bassChannel);
    }
    updateSeqPlay();
    renderSteps();
  }

  /* ---------------------------------------------------------------- */
  function scaleById(id) {
    if (!id) return null;
    for (let i = 0; i < T.SCALES.length; i++) if (T.SCALES[i].id === id) return T.SCALES[i];
    return null;
  }

  function buildScaleSuggestions() {
    if (state.searchMode === 'scales') {
      const pcs = scaleSearchPcs();
      if (pcs.length < 3) return [];
      return T.scalesForNotes(pcs).slice(0, 16);
    }
    if (!state.info || !state.info.chord) return [];
    return T.scalesForChord(state.info.pcs, state.info.root)
      .map((sc) => ({ root: state.info.root, scale: sc }));
  }

  function updateScales() {
    state.scaleSuggestions = buildScaleSuggestions();

    if (state.scaleManual && scaleById(state.scaleId)) {
      /* se respeta la elección manual */
    } else if (state.scaleSuggestions.length) {
      state.scaleId = state.scaleSuggestions[0].scale.id;
      state.scaleRoot = state.scaleSuggestions[0].root;
    } else {
      state.scaleId = null;
    }

    state.scalePcs = new Set();
    const sc = selectedScale();
    if (sc) T.scaleNotes(state.scaleRoot, sc).forEach((pc) => state.scalePcs.add(pc));
  }

  function selectedScale() {
    return scaleById(state.scaleId);
  }

  function selectScale(root, id) {
    if (state.scalePlaying) stopScale();
    state.scaleRoot = mod12(root);
    state.scaleId = id;
    state.scaleManual = true;
    render();
  }

  function renderScales() {
    const sub = $('scaleSub');
    const chips = $('scaleChips');
    const notesEl = $('scaleNotes');
    const playBtn = $('scalePlay');
    if (!chips) return;

    chips.textContent = '';
    notesEl.textContent = '';

    const hasNotes = state.notes.size > 0;
    const searching = state.searchMode === 'scales';

    if (searching) sub.textContent = hasNotes ? t('scale.withNotes') : '';
    else sub.textContent = state.info && state.info.chord
      ? t('scale.over', { root: localNote(state.info.root) })
      : '';

    if (!state.scaleSuggestions.length) {
      const p = document.createElement('span');
      p.className = 'scale-empty';
      if (searching) {
        p.textContent = !hasNotes
          ? t('scale.emptyNoNotes')
          : (pcsOf().length < 3 ? t('scale.emptyFewNotes') : t('scale.emptyNone'));
      } else {
        p.textContent = hasNotes ? t('scale.emptyNoScale') : t('scale.emptyNoChord');
      }
      chips.appendChild(p);
    } else {
      state.scaleSuggestions.forEach((item) => {
        const active = item.scale.id === state.scaleId && item.root === state.scaleRoot;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'scale-chip' + (active ? ' is-active' : '');
        b.textContent = searching
          ? nameOf(item.root) + ' ' + scaleLabel(item.scale)
          : scaleLabel(item.scale);
        b.title = scaleLabel(item.scale) + ' · ' +
          item.scale.intervals.map((i) => T.intervalLabel(i)).join(' ');
        b.addEventListener('click', () => selectScale(item.root, item.scale.id));
        chips.appendChild(b);
      });
    }

    syncScaleBrowser();

    const sc = selectedScale();
    if (sc) {
      const label = document.createElement('span');
      label.className = 'scale-notes-label';
      label.textContent = nameOf(state.scaleRoot) + ' ' + scaleLabel(sc) + ':';
      notesEl.appendChild(label);

      T.scaleNotes(state.scaleRoot, sc).forEach((pc) => {
        const inChord = state.info ? state.info.pcs.indexOf(pc) !== -1 : false;
        const span = document.createElement('span');
        span.className = 'scale-note' + (inChord ? ' is-chord' : '');
        span.textContent = localNote(pc);
        notesEl.appendChild(span);
      });
    }

    if (playBtn) playBtn.disabled = !sc;
  }

  function syncScaleBrowser() {
    const rootSel = $('scaleRootSel');
    const scSel = $('scaleSel');
    if (!rootSel || !scSel) return;
    rootSel.value = String(state.scaleRoot == null ? 0 : state.scaleRoot);
    scSel.value = state.scaleId || 'ionian';
  }

  function applyScaleFromBrowser() {
    const rootSel = $('scaleRootSel');
    const scSel = $('scaleSel');
    if (!rootSel || !scSel) return;
    const root = parseInt(rootSel.value, 10);
    const id = scSel.value;
    if (!scaleById(id) || Number.isNaN(root)) return;
    selectScale(root, id);
  }

  function setScaleOctave(dir) {
    state.scaleOctave = Math.max(-1, Math.min(1, (state.scaleOctave || 0) + dir));
    updateScaleControls();
    if (state.scalePlaying) { stopScale(); playScale(); }
  }

  function updateScaleControls() {
    const sp = $('scaleSpeed');
    const lp = $('scaleLoop');
    const dn = $('scaleOctDown');
    const up = $('scaleOctUp');
    if (sp) sp.textContent = '×' + (state.scaleSpeed || 1);
    if (lp) {
      lp.classList.toggle('is-active', state.scaleLoop);
      lp.setAttribute('aria-pressed', state.scaleLoop ? 'true' : 'false');
    }
    if (dn) dn.classList.toggle('is-active', state.scaleOctave < 0);
    if (up) up.classList.toggle('is-active', state.scaleOctave > 0);
    const auto = $('scaleAuto');
    if (auto) {
      auto.classList.toggle('is-active', state.scaleAutoplay);
      auto.setAttribute('aria-pressed', state.scaleAutoplay ? 'true' : 'false');
    }
  }

  function updateScaleBtn() {
    const b = $('scalePlay');
    if (!b) return;
    b.textContent = state.scalePlaying ? t('scale.stop') : t('scale.play');
    b.classList.toggle('is-active', state.scalePlaying);
    b.disabled = !selectedScale();
  }

  function lcg(seed) {
    let st = (seed >>> 0) || 1;
    return function () {
      st = (st * 1664525 + 1013904223) >>> 0;
      return st / 4294967296;
    };
  }

  function applyScalePattern(up, pattern, seed) {
    const n = up.length;
    const out = [];
    if (pattern === 'up') return up.slice();
    if (pattern === 'down') return up.slice().reverse();
    if (pattern === 'thirds') {
      for (let i = 0; i + 2 < n; i++) out.push(up[i], up[i + 2]);
      out.push(up[n - 1]);
      return out;
    }
    if (pattern === 'fourths') {
      for (let i = 0; i + 3 < n; i++) out.push(up[i], up[i + 3]);
      out.push(up[n - 1]);
      return out;
    }
    if (pattern === 'up2down1') {
      for (let i = 0; i + 2 < n; i++) out.push(up[i], up[i + 1], up[i + 2], up[i + 1]);
      out.push(up[n - 1]);
      return out;
    }
    if (pattern === 'random') {
      const rnd = lcg(seed || 1);
      let idx = 1 + Math.floor(rnd() * Math.max(1, n - 2));
      out.push(up[idx]);
      for (let k = 1; k < 14; k++) {
        const jump = 1 + Math.floor(rnd() * 3);
        idx += (rnd() < 0.5 ? -1 : 1) * jump;
        if (idx < 0) idx = -idx;
        if (idx > n - 1) idx = 2 * (n - 1) - idx;
        if (idx < 0) idx = 0;
        if (idx > n - 1) idx = n - 1;
        out.push(up[idx]);
      }
      return out;
    }
    return up.concat(up.slice(0, -1).reverse());
  }

  function scaleSequence() {
    const sc = selectedScale();
    if (!sc) return null;
    const oct = state.scaleOctave || 0;
    const rootMidi = PICKER_BASE + state.scaleRoot + oct * 12;
    const up = sc.intervals.map((iv) => rootMidi + iv);
    up.push(rootMidi + 12);
    return applyScalePattern(up, state.scalePattern, state.scaleSeed);
  }

  function scaleStepMs() {
    return ((60000 / A.Settings.bpm) / 2) / (state.scaleSpeed || 1);
  }

  function startScaleAt(startTime, totalDur) {
    const seq = scaleSequence();
    if (!seq) return false;
    const stepMs = scaleStepMs();
    A.melody(seq, {
      stepMs: stepMs,
      repeat: totalDur ? true : state.scaleLoop,
      startTime: startTime,
      totalDur: totalDur || null
    });
    if (isPro() && MIDI.enabled) {
      let midiSeq = seq;
      if (totalDur) {
        const reps = Math.max(1, Math.ceil(totalDur / ((seq.length * stepMs) / 1000)));
        if (reps > 1) {
          midiSeq = [];
          for (let r = 0; r < reps; r++) midiSeq = midiSeq.concat(seq);
        }
      }
      MIDI.sendSequence(midiSeq, stepMs, stepMs * 0.9, state.scaleChannel);
    }
    return true;
  }

  function playScale() {
    if (state.scalePlaying) { stopScale(); return; }
    A.ensure();
    if (!startScaleAt(A.now() + 0.06)) return;
    state.scalePlaying = true;
    updateScaleBtn();
    updateScaleControls();
  }

  function stopScale() {
    A.stopLayer('scale');
    state.scalePlaying = false;
    updateScaleBtn();
    updateScaleControls();
    if (isPro() && MIDI.enabled) MIDI.stopChannel(state.scaleChannel);
  }

  /* ---------------------------------------------------------------- */
  function render() {
    state.info = currentInfo();
    updateScales();
    maybeRenderArp();
    maybeRenderSeqArp();
    renderPiano();
    renderGuitar();
    renderChord();
    renderOpenChord();
    renderScales();
    renderSteps();
    maybeRenderSuggestions();
    syncSearchButtons();
    syncPickerFromChord();
    updatePlayBtn();
    updateScaleBtn();
  }

  /* ---------- Piano ---------- */
  function renderPiano() {
    const svg = $('piano');
    svg.textContent = '';

    const W = 900;
    const H = 134;
    const PADX = 6;
    const octaves = PIANO_OCTAVES;
    const total = octaves * 12;
    const whites = octaves * 7;
    const ww = (W - PADX * 2) / whites;
    const keyH = 108;
    const blackW = ww * 0.62;
    const blackH = keyH * 0.62;

    const active = state.notes;
    const rootPc = state.info && state.info.chord ? state.info.root : null;

    let wi = 0;
    for (let m = PIANO_START; m < PIANO_START + total; m++) {
      const pc = mod12(m);
      if (WHITE_PCS.indexOf(pc) === -1) continue;
      const x = PADX + wi * ww;
      const on = active.has(m);
      const probe = state.searchMode === 'scales' && state.scaleProbe.has(m);
      const isRoot = on && rootPc != null && pc === rootPc;

      const rect = svgEl('rect', {
        x: round(x), y: 4, width: round(ww - 1), height: keyH,
        rx: 3,
        class: 'pk-white' + (on ? ' is-on' : '') + (probe ? ' is-probe' : ''),
        'data-midi': m,
        'aria-label': nameOf(pc) + octaveOf(m)
      });
      rect.addEventListener('click', () => toggleNote(m));
      svg.appendChild(rect);

      if (!on && state.scalePcs.has(pc)) {
        svg.appendChild(svgEl('circle', { cx: round(x + ww / 2), cy: 16, r: 2.8, class: 'pk-scale' + (state.searchMode === 'scales' ? ' is-blue' : '') }));
      }

      if (on) {
        const label = svgEl('text', {
          x: round(x + ww / 2), y: 4 + keyH - 12,
          class: 'pk-label', 'text-anchor': 'middle'
        });
        label.textContent = nameOf(pc) + octaveOf(m);
        svg.appendChild(label);
      } else if (pc === 0) {
        const cmark = svgEl('text', {
          x: round(x + ww / 2), y: 4 + keyH - 12,
          class: 'pk-cmark', 'text-anchor': 'middle'
        });
        cmark.textContent = nameOf(0) + octaveOf(m);
        svg.appendChild(cmark);
      }

      if (isRoot && on) {
        svg.appendChild(svgEl('circle', { cx: round(x + ww / 2), cy: 16, r: 3, class: 'pk-root' }));
      }
      wi++;
    }

    for (let m = PIANO_START; m < PIANO_START + total; m++) {
      const pc = mod12(m);
      if (WHITE_PCS.indexOf(pc) !== -1) continue;
      let before = 0;
      for (let x = PIANO_START; x < m; x++) if (WHITE_PCS.indexOf(mod12(x)) !== -1) before++;
      const x = PADX + before * ww - blackW / 2;
      const on = active.has(m);

      const rect = svgEl('rect', {
        x: round(x), y: 4, width: round(blackW), height: round(blackH),
        rx: 2,
        class: 'pk-black' + (on ? ' is-on' : ''),
        'data-midi': m,
        'aria-label': nameOf(pc) + octaveOf(m)
      });
      rect.addEventListener('click', () => toggleNote(m));
      svg.appendChild(rect);

      if (!on && state.scalePcs.has(pc)) {
        svg.appendChild(svgEl('circle', {
          cx: round(x + blackW / 2), cy: round(4 + blackH - 9), r: 2.2, class: 'pk-scale pk-scale--dark'
        }));
      }
    }

    const range = $('pianoRange');
    if (range) {
      range.textContent = nameOf(0) + octaveOf(PIANO_START) + ' – ' + nameOf(11) + octaveOf(PIANO_START + total - 1);
    }
  }

  /* ---------- Guitarra ---------- */
  function renderGuitar() {
    const svg = $('guitar');
    svg.textContent = '';

    const tuning = state.guitarTuning;
    const n = tuning.length;
    const frets = 12;
    const left = 88;
    const right = 816;
    const top = 34;
    const gap = 26;
    const fw = (right - left) / frets;
    const bottom = top + (n - 1) * gap;
    const H = bottom + 48;
    svg.setAttribute('viewBox', '0 0 900 ' + H);

    const root = state.info && state.info.chord ? state.info.root : null;
    const bass = state.info && state.info.chord ? state.info.bass : null;
    const hasChord = state.notes.size > 0 && root != null;
    const chordObj = state.info ? state.info.chord : null;
    const pcsSet = new Set(pcsOf());
    const ghostDegrees = pcsSet.size <= 4;
    const showNames = state.searchMode === 'scales';
    const scaleRootPc = state.scaleId ? state.scaleRoot : null;
    const arpMode = state.searchMode === 'arpeggios';
    const arpSet = new Set(arpMode ? arpeggioPositions() : []);
    const triadSet = new Set(arpMode && state.triad ? triadPcs(state.triad.root, state.triad.type) : []);

    for (let f = 0; f <= frets; f++) {
      const x = left + f * fw;
      svg.appendChild(svgEl('line', {
        x1: round(x), y1: top - 14, x2: round(x), y2: bottom + 14,
        class: f === 0 ? 'gt-nut' : 'gt-fret'
      }));
    }

    for (let f = 1; f <= frets; f++) {
      const num = svgEl('text', {
        x: round(left + fw * (f - 0.5)), y: H - 10, class: 'gt-fretnum', 'text-anchor': 'middle'
      });
      num.textContent = f;
      svg.appendChild(num);
    }

    tuning.forEach((open, i) => {
      const y = top + i * gap;

      svg.appendChild(svgEl('line', { x1: 62, y1: y, x2: right, y2: y, class: 'gt-string' }));

      svg.appendChild(tuneButton(i, -1, 6, y));
      const lbl = svgEl('text', { x: 47, y: round(y + 3.5), class: 'gt-string-note', 'text-anchor': 'middle' });
      lbl.textContent = nameOf(mod12(open)) + octaveOf(open);
      svg.appendChild(lbl);
      svg.appendChild(tuneButton(i, 1, 824, y));

      for (let f = 0; f <= frets; f++) {
        const midi = open + f;
        const pc = mod12(midi);
        const on = state.notes.has(midi) || (showNames && state.scaleProbe.has(midi));
        const probeNote = showNames && state.scaleProbe.has(midi);
        const x = f === 0 ? 74 : left + fw * (f - 0.5);

        if (arpMode) {
          if (triadSet.has(pc)) {
            svg.appendChild(svgEl('circle', {
              cx: round(x), cy: y, r: 5.5,
              class: i < 3 ? 'gt-triad' : 'gt-triad is-dim'
            }));
          } else if (arpSet.has(midi)) {
            const isArpRoot = state.arp && pc === state.arp.root;
            svg.appendChild(svgEl('circle', {
              cx: round(x),
              cy: y,
              r: 5.5,
              class: isArpRoot ? 'gt-arp-root' : 'gt-arp'
            }));
          }
          continue;
        }

        if (!on && !(hasChord && pcsSet.has(pc))) {
          if (state.scalePcs.has(pc)) {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 4, class: 'gt-scale' + (showNames ? ' is-blue' : '') }));
          } else {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 2.4, class: 'gt-spot' }));
          }
        } else if (!on) {
          if (ghostDegrees) {
            const g = svgEl('g', { class: 'gt-dot is-ghost' + (showNames ? ' is-soft' : '') });
            g.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 8.5, class: 'gt-dot-bg' }));
            const deg = svgEl('text', { x: round(x), y: round(y + 3), class: 'gt-degree', 'text-anchor': 'middle' });
            deg.textContent = showNames ? nameOf(pc) : T.degreeOf(chordObj, mod12(pc - root));
            g.appendChild(deg);
            if (showNames && scaleRootPc != null && pc === scaleRootPc) {
              g.appendChild(svgEl('circle', { cx: round(x + 6), cy: round(y - 6), r: 2.6, class: 'gt-scaleroot' }));
            }
            svg.appendChild(g);
          } else {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 4.5, class: 'gt-ghostdot' }));
          }
        } else {
          const isRoot = hasChord && pc === root;
          const isBass = bass != null && pc === bass && pc !== root;
          let cls = 'gt-dot';
          if (probeNote) cls += ' is-probe';
          else if (isBass) cls += ' is-bass';
          else if (isRoot) cls += ' is-root';

          const g = svgEl('g', { class: cls });
          g.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 10, class: 'gt-dot-bg' }));
          const deg = svgEl('text', { x: round(x), y: round(y + 3.2), class: 'gt-degree', 'text-anchor': 'middle' });
          deg.textContent = showNames ? nameOf(pc) : (hasChord ? T.degreeOf(chordObj, mod12(pc - root)) : '');
          g.appendChild(deg);
          if (showNames && scaleRootPc != null && pc === scaleRootPc) {
            g.appendChild(svgEl('circle', { cx: round(x + 6), cy: round(y - 6), r: 2.6, class: 'gt-scaleroot' }));
          }
          svg.appendChild(g);
        }

        const hit = svgEl('circle', {
          cx: round(x), cy: y, r: 12, class: 'gt-hit', 'pointer-events': 'all',
          'aria-label': nameOf(pc) + octaveOf(midi)
        });
        hit.addEventListener('click', () => toggleNote(midi));
        svg.appendChild(hit);
      }
    });

    const clearProbe = $('scaleClearProbe');
    if (clearProbe) clearProbe.hidden = !showNames;

    updateGuitarInfo();
  }

  function tuneButton(i, dir, x, y) {
    const g = svgEl('g', { class: 'gt-tbtn' });
    g.appendChild(svgEl('rect', { x, y: round(y - 10), width: 26, height: 20, rx: 5, class: 'gt-tbtn-bg' }));
    const txt = svgEl('text', { x: x + 13, y: round(y + 4), class: 'gt-tbtn-txt', 'text-anchor': 'middle' });
    txt.textContent = dir < 0 ? '\u2212' : '+';
    g.appendChild(txt);
    g.addEventListener('click', () => tuneString(i, dir));
    return g;
  }

  /* ---------------- Afinación ---------------- */
  function updateGuitarInfo() {
    const el = $('guitarInfo');
    if (!el) return;
    const n = state.guitarTuning.length;
    const std = state.guitarTuning.join(',') === STANDARD_TUNING.join(',');
    el.textContent = t('guitar.info', { n }) + (std ? '' : t('guitar.custom'));
    const add = $('strAdd');
    const rem = $('strRemove');
    if (add) add.disabled = n >= MAX_STRINGS;
    if (rem) rem.disabled = n <= MIN_STRINGS;
  }

  function applyTuning(next) {
    state.guitarTuning = next;
    saveTuning();
    renderGuitar();
  }

  function tuneString(i, delta) {
    const next = state.guitarTuning.slice();
    const v = Math.max(24, Math.min(96, next[i] + delta));
    if (v === next[i]) return;
    next[i] = v;
    applyTuning(next);
  }

  function tuneAll(delta) {
    applyTuning(state.guitarTuning.map((v) => Math.max(24, Math.min(96, v + delta))));
  }

  function addString() {
    if (state.guitarTuning.length >= MAX_STRINGS) return;
    const next = state.guitarTuning.slice();
    const lowest = Math.min.apply(null, next);
    next.push(Math.max(24, lowest - 5));
    applyTuning(next);
  }

  function removeString() {
    if (state.guitarTuning.length <= MIN_STRINGS) return;
    const next = state.guitarTuning.slice();
    next.pop();
    applyTuning(next);
  }

  function resetTuning() {
    applyTuning(STANDARD_TUNING.slice());
  }

  function saveTuning() {
    try { localStorage.setItem(TUNING_KEY, JSON.stringify(state.guitarTuning)); } catch (e) { /* noop */ }
  }

  function loadTuning() {
    try {
      const raw = localStorage.getItem(TUNING_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length >= MIN_STRINGS && arr.length <= MAX_STRINGS &&
          arr.every((v) => Number.isInteger(v) && v >= 24 && v <= 96)) {
        state.guitarTuning = arr.slice();
      }
    } catch (e) { /* noop */ }
  }

  /* ---------- Acorde actual ---------- */
  function renderChord() {
    const info = state.info;
    const symEl = $('chordSymbol');
    const nameEl = $('chordName');
    const notesEl = $('chordNotes');
    const degEl = $('chordDegrees');
    const addBtn = $('addBtn');

    notesEl.textContent = '';
    degEl.textContent = '';

    if (!info) {
      symEl.textContent = '—';
      symEl.classList.add('is-empty');
      nameEl.textContent = t('chord.emptyPick');
      addBtn.disabled = true;
      return;
    }

    symEl.classList.remove('is-empty');
    symEl.textContent = info.symbol || '—';
    nameEl.textContent = info.name;
    addBtn.disabled = false;

    const seen = new Set();
    info.notes.forEach((m) => {
      const pc = mod12(m);
      if (seen.has(pc)) return;
      seen.add(pc);
      const pill = document.createElement('span');
      pill.className = 'pill'
        + (pc === info.root ? ' is-root' : '')
        + (pc === info.bass && info.bass !== info.root ? ' is-bass' : '')
        + (pc === state.lastAdded ? ' is-new' : '');
      pill.textContent = localNote(pc);
      notesEl.appendChild(pill);
    });

    if (info.chord) {
      info.pcs
        .slice()
        .sort((a, b) => mod12(a - info.root) - mod12(b - info.root))
        .forEach((pc) => {
          const d = document.createElement('span');
          d.className = 'degree';
          d.textContent = T.degreeOf(info.chord, mod12(pc - info.root));
          degEl.appendChild(d);
        });
    }
  }

  /* ---------- Secuencia (UI) ---------- */
  function renderSteps() {
    const list = $('steps');
    list.textContent = '';

    const playBtn = $('seqPlay');
    const clearBtn = $('seqClear');

    if (!state.sequence.length) {
      const p = document.createElement('p');
      p.className = 'steps-empty';
      p.textContent = t('seq.empty');
      list.appendChild(p);
      if (playBtn) playBtn.disabled = true;
      if (clearBtn) clearBtn.disabled = true;
      updateSeqPlay();
      renderStructure();
      return;
    }

    if (playBtn) playBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    state.sequence.forEach((step, i) => {
      const row = document.createElement('div');
      row.className = 'step' + (i === state.activeStep ? ' is-active' : '') +
        (i === state.editingIndex ? ' is-editing' : '');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', t('seq.step', { n: i + 1, sym: step.symbol }));

      const num = document.createElement('span');
      num.className = 'step-num';
      num.textContent = i + 1;

      const main = document.createElement('span');
      main.className = 'step-main';

      const sym = document.createElement('span');
      sym.className = 'step-sym';
      sym.textContent = step.symbol;
      main.appendChild(sym);

      const meta = document.createElement('span');
      meta.className = 'step-meta';

      if (step.scaleName) {
        const scn = document.createElement('span');
        scn.className = 'step-scale';
        scn.textContent = step.scaleName;
        meta.appendChild(scn);
      }

      const bars = document.createElement('button');
      bars.type = 'button';
      bars.className = 'step-reps' + ((step.bars || 1) !== 1 ? ' is-on' : '');
      bars.textContent = '×' + (step.bars || 1);
      bars.title = t('seq.bars');
      bars.setAttribute('aria-label', t('seq.bars'));
      bars.addEventListener('click', (e) => { e.stopPropagation(); cycleBars(i); });
      meta.appendChild(bars);

      const dur = document.createElement('button');
      dur.type = 'button';
      dur.className = 'step-dur' + ((step.beats || 4) < 4 ? ' is-on' : '');
      dur.textContent = BEATS_LABEL[step.beats || 4];
      dur.title = t('seq.note');
      dur.setAttribute('aria-label', t('seq.note'));
      dur.addEventListener('click', (e) => { e.stopPropagation(); cycleBeats(i); });
      meta.appendChild(dur);

      main.appendChild(meta);

      const tools = document.createElement('span');
      tools.className = 'step-tools';

      const mk = (label, title, fn, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'step-tool' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };

      const editingThis = i === state.editingIndex;
      tools.appendChild(mk(
        editingThis ? '💾' : '✎',
        editingThis ? t('seq.saveEdit') : t('seq.edit'),
        () => { if (editingThis) addCurrent(); else editStep(i); },
        editingThis ? 'is-save' : ''
      ));
      tools.appendChild(mk('↑', t('seq.moveBack'), () => moveStep(i, -1)));
      tools.appendChild(mk('↓', t('seq.moveFwd'), () => moveStep(i, 1)));
      tools.appendChild(mk('⧉', t('seq.copy'), () => copyStep(i)));
      tools.appendChild(mk('×', t('seq.delete'), () => removeStep(i), 'danger'));

      row.appendChild(num);
      row.appendChild(main);
      row.appendChild(tools);

      row.addEventListener('click', () => {
        if (state.seqPlaying) stopSequence();
        if (state.editingIndex != null) cancelEdit();
        loadStep(i, true);
      });
      row.addEventListener('keydown', (e) => {
        if (e.target !== row) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); row.click(); }
      });

      list.appendChild(row);
    });

    updateSeqPlay();
    renderStructure();
  }

  /* ---------------------------------------------------------------- */
  /* Botones y estado                                                 */
  /* ---------------------------------------------------------------- */
  /* ---------------------------------------------------------------- */
  /* Batería (UI)                                                      */
  /* ---------------------------------------------------------------- */
  const DRUM_ROWS = ['custom', 'custom', 'custom', 'custom', 'crash', 'hihat', 'snare', 'kick'];

  function drumRowLabel(i) {
    return i < 4 ? t('drum.midiRow', { n: i + 1 }) : t('drum.' + DRUM_ROWS[i]);
  }

  function drumCellClass(r, c) {
    return 'drum-cell row-' + r
      + (c < state.drums.length ? '' : ' is-muted')
      + (state.drums.rows[r][c] ? ' is-on' : '')
      + (c % 4 === 0 ? ' is-beat' : '');
  }

  function renderDrums() {
    const grid = $('drumGrid');
    if (!grid) return;
    grid.textContent = '';

    for (let r = 0; r < 8; r++) {
      const row = document.createElement('div');
      row.className = 'drum-row';

      const lab = document.createElement('span');
      lab.className = 'drum-label row-' + r;
      lab.textContent = drumRowLabel(r);

      const note = document.createElement('input');
      note.type = 'number';
      note.min = '0';
      note.max = '127';
      note.className = 'drum-note';
      note.value = state.drums.notes[r];
      note.setAttribute('aria-label', drumRowLabel(r) + ' MIDI');
      note.addEventListener('change', (e) => {
        const v = Math.max(0, Math.min(127, parseInt(e.target.value, 10) || 0));
        state.drums.notes[r] = v;
        e.target.value = v;
      });

      const cells = document.createElement('div');
      cells.className = 'drum-cells';
      for (let c = 0; c < 16; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = drumCellClass(r, c);
        b.dataset.row = r;
        b.dataset.col = c;
        b.addEventListener('click', () => toggleDrumCell(r, c));
        cells.appendChild(b);
      }

      row.appendChild(lab);
      row.appendChild(note);
      row.appendChild(cells);
      grid.appendChild(row);
    }

    const cursor = document.createElement('div');
    cursor.className = 'drum-row drum-cursor';
    cursor.appendChild(document.createElement('span'));
    cursor.appendChild(document.createElement('span'));
    const dots = document.createElement('div');
    dots.className = 'drum-cells drum-dots';
    for (let c = 0; c < 16; c++) {
      const dot = document.createElement('span');
      dot.className = 'drum-dot';
      dots.appendChild(dot);
    }
    cursor.appendChild(dots);
    grid.appendChild(cursor);

    syncDrums();
  }

  function syncDrums() {
    const grid = $('drumGrid');
    if (!grid) return;
    grid.querySelectorAll('.drum-cell').forEach((b) => {
      b.className = drumCellClass(Number(b.dataset.row), Number(b.dataset.col));
    });
    grid.querySelectorAll('.drum-note').forEach((inp, i) => {
      inp.value = state.drums.notes[i];
    });
    const len = $('drumLen');
    if (len) len.value = String(state.drums.length);
    updateDrumControls();
  }

  function toggleDrumCell(r, c) {
    if (c >= state.drums.length) return;
    state.drums.rows[r][c] = state.drums.rows[r][c] ? 0 : 1;
    const btn = document.querySelector('.drum-cell[data-row="' + r + '"][data-col="' + c + '"]');
    if (btn) btn.classList.toggle('is-on', !!state.drums.rows[r][c]);
  }

  function updateDrumControls() {
    const sp = $('drumSpeed');
    if (sp) sp.textContent = '×' + (state.drums.speed || 1);
    const pl = $('drumPlay');
    if (pl) pl.classList.toggle('is-active', state.drumAudition);
  }

  function toggleDrumAudition() {
    if (!state.drumAudition && state.drumMuted) return;
    if (state.drumAudition) {
      A.stopDrum();
      state.drumClock = null;
      state.drumAudition = false;
    } else {
      A.ensure();
      const colDur = (60 / A.Settings.bpm) / 4 / (state.drums.speed || 1);
      A.drumStart(
        { rows: state.drums.rows, length: state.drums.length, colDur: colDur },
        { startTime: A.now() + 0.1 }
      );
      state.drumAudition = true;
      state.drumClock = { start: A.now() + 0.1, colDur: colDur, length: state.drums.length };
      startCursorLoop();
    }
    updateDrumControls();
  }

  function populateChannels() {
    const map = [
      ['chChord', 'chordChannel', 1],
      ['chScale', 'scaleChannel', 2],
      ['chBass', 'bassChannel', 3],
      ['chDrum', 'drumChannel', 10]
    ];
    map.forEach((item) => {
      const sel = $(item[0]);
      if (!sel) return;
      sel.textContent = '';
      for (let ch = 1; ch <= 16; ch++) {
        const o = document.createElement('option');
        o.value = String(ch);
        o.textContent = String(ch);
        sel.appendChild(o);
      }
      sel.value = String(state[item[1]] || item[2]);
      sel.addEventListener('change', (e) => {
        state[item[1]] = parseInt(e.target.value, 10) || item[2];
      });
    });
  }

  A.onStepsTick = function (notes, when, dur) {
    if (!isPro() || !MIDI.enabled) return;
    const delay = Math.max(0, (when - A.now()) * 1000);
    const durMs = Math.max(60, dur * 900);
    setTimeout(() => MIDI.sendNotes(notes, durMs, state.scaleChannel), delay);
  };

  A.onDrumHit = function (row, when) {
    if (!isPro() || !MIDI.enabled) return;
    const note = state.drums.notes[row];
    const delay = Math.max(0, (when - A.now()) * 1000);
    setTimeout(() => MIDI.sendDrum(note, state.drumChannel), delay);
  };

  let cursorRaf = null;

  function updateDrumCursor() {
    const dots = document.querySelectorAll('.drum-dot');
    if (!dots.length) return;
    const clock = state.drumClock;
    if (!clock) {
      dots.forEach((d) => d.classList.remove('is-on'));
      return;
    }
    const col = Math.floor((A.now() - clock.start) / clock.colDur) % clock.length;
    dots.forEach((d, i) => d.classList.toggle('is-on', i === col && i < clock.length));
  }

  function tickCursor() {
    updateDrumCursor();
    cursorRaf = state.drumClock ? requestAnimationFrame(tickCursor) : null;
  }

  function startCursorLoop() {
    if (cursorRaf) return;
    cursorRaf = requestAnimationFrame(tickCursor);
  }

  /* ---------------------------------------------------------------- */
  /* Sugerencias de acordes                                            */
  /* ---------------------------------------------------------------- */
  function srcChords() {
    const list = state.sequence.length
      ? state.sequence.map((st) => ({ root: st.root, pcs: T.sortPcs((st.notes || []).map((m) => m % 12)) }))
      : (state.info ? [{ root: state.info.root, pcs: state.info.pcs }] : []);
    return list.filter((c) => c.pcs.length > 1);
  }

  function inferKey(chords) {
    if (!chords.length) return null;
    let best = null;
    for (let root = 0; root < 12; root++) {
      for (let i = 0; i < T.SCALES.length; i++) {
        const sc = T.SCALES[i];
        const set = new Set(T.scaleNotes(root, sc));
        let score = sc.rank / 500;
        chords.forEach((c, idx) => {
          let hits = 0;
          c.pcs.forEach((p) => { if (set.has(p)) hits++; });
          score += (hits / c.pcs.length) * 2;
          if (c.root === T.mod12(root) && hits === c.pcs.length) {
            score += idx === 0 ? 2.4 : 0.6;
          }
        });
        if (!best || score > best.score) best = { root, scale: sc, score };
      }
    }
    return best;
  }

  function makeChord(root, intervals) {
    const ivs = Array.from(new Set(intervals.map((i) => T.mod12(i)))).sort((a, b) => a - b);
    const pcs = ivs.map((i) => T.mod12(root + i));
    let chord = null;
    for (let i = 0; i < T.CHORD_TYPES.length; i++) {
      if (T.sameIntervals(T.CHORD_TYPES[i].intervals, ivs)) { chord = T.CHORD_TYPES[i]; break; }
    }
    if (!chord) {
      const cand = T.identify(pcs).filter((c) => c.root === T.mod12(root))[0];
      if (cand) chord = cand.chord;
    }
    return {
      root: T.mod12(root),
      intervals: ivs,
      pcs: pcs,
      typeId: chord ? chord.id : null,
      symbol: chord
        ? T.chordSymbol(T.mod12(root), chord)
        : T.enName(T.mod12(root)) + '(' + ivs.map((i) => T.intervalLabel(i)).join('') + ')',
      quality: chord ? (lang() === 'en' ? chord.label : chord.es) : ''
    };
  }

  function scaleDegreeChord(keyRoot, scale, d, seventh) {
    const ivs = scale.intervals;
    const n = ivs.length;
    const at = (k) => {
      const idx = d + k;
      const oct = Math.floor(idx / n);
      return ivs[((idx % n) + n) % n] + oct * 12;
    };
    const rel = [at(0), at(2), at(4)];
    if (seventh && n >= 6) rel.push(at(6));
    const base = rel[0];
    return makeChord(T.mod12(keyRoot + base), rel.map((x) => x - base));
  }

  function suggestionKey() {
    if (!state.suggAuto) {
      return { root: state.suggRoot, scale: scaleById(state.suggScaleId) || T.SCALES[0] };
    }
    return inferKey(srcChords());
  }

  function parallelScale(key) {
    const minorIds = ['aeolian', 'dorian', 'phrygian'];
    const isMinor = minorIds.indexOf(key.scale.id) !== -1;
    return scaleById(isMinor ? 'ionian' : 'aeolian');
  }

  function modulationTargets(key) {
    const minorIds = ['aeolian', 'dorian', 'phrygian'];
    const isMinor = minorIds.indexOf(key.scale.id) !== -1;
    return [
      { root: T.mod12(key.root + 7), scale: key.scale },
      { root: T.mod12(key.root + 5), scale: key.scale },
      { root: T.mod12(key.root + 9), scale: scaleById(isMinor ? 'ionian' : 'aeolian') },
      { root: T.mod12(key.root + 2), scale: key.scale }
    ];
  }

  function keyLabel(k) {
    return localNote(k.root) + ' ' + scaleLabel(k.scale);
  }

  function buildSuggestions() {
    const chords = srcChords();
    const key = suggestionKey();
    if (!key || !chords.length) return { empty: true, rows: [] };

    const keyPcs = new Set(T.scaleNotes(key.root, key.scale));
    const seqRoots = Array.from(new Set(chords.map((c) => c.root)));
    const usedPcs = new Set();
    chords.forEach((c) => c.pcs.forEach((p) => usedPcs.add(p)));

    const rows = [];

    /* 1. diatónicos que todavía no usaste */
    const diatonic = [];
    const n = key.scale.intervals.length;
    for (let d = 0; d < n; d++) {
      const ch = scaleDegreeChord(key.root, key.scale, d, false);
      if (!ch) continue;
      if (ch.pcs.every((p) => usedPcs.has(p))) continue;
      diatonic.push({ chord: ch, degree: d });
    }
    const order7 = [4, 3, 5, 1, 2, 6, 0];
    diatonic.sort((a, b) => {
      const ia = order7.indexOf(a.degree); const ib = order7.indexOf(b.degree);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    rows.push({ id: 'scale', items: diatonic.slice(0, 6).map((x) => ({ chord: x.chord })) });

    /* 2. dominantes secundarias */
    rows.push({
      id: 'dom',
      items: seqRoots.slice(0, 4).map((r) => ({
        chord: makeChord(T.mod12(r + 7), [0, 4, 7, 10]),
        hint: t('sugg.of', { chord: T.enName(r) })
      }))
    });

    /* 3. intercambio modal */
    const par = parallelScale(key);
    const modal = [];
    if (par) {
      for (let d = 0; d < par.intervals.length; d++) {
        const ch = scaleDegreeChord(key.root, par, d, false);
        if (!ch) continue;
        if (ch.pcs.every((p) => keyPcs.has(p))) continue;
        modal.push({ chord: ch });
      }
    }
    rows.push({ id: 'modal', items: modal.slice(0, 5) });

    /* 4. modulación */
    const mod = [];
    modulationTargets(key).forEach((tg) => {
      const tgPcs = new Set(T.scaleNotes(tg.root, tg.scale));
      let pivot = null;
      for (let d = 0; d < n; d++) {
        const ch = scaleDegreeChord(key.root, key.scale, d, false);
        if (ch && ch.pcs.every((p) => tgPcs.has(p))) { pivot = ch; break; }
      }
      if (pivot) mod.push({ chord: pivot, hint: t('sugg.pivot', { key: keyLabel(tg) }) });
      mod.push({ chord: makeChord(T.mod12(tg.root + 7), [0, 4, 7, 10]), hint: keyLabel(tg) });
    });
    rows.push({ id: 'modulation', items: mod.slice(0, 5) });

    /* 5. de paso (disminuidos) */
    rows.push({
      id: 'passing',
      items: seqRoots.slice(0, 4).map((r) => ({
        chord: makeChord(T.mod12(r - 1), [0, 3, 6]),
        hint: t('sugg.of', { chord: T.enName(r) })
      }))
    });

    return { empty: false, rows: rows.filter((r) => r.items.length) };
  }

  function applySuggestion(chord) {
    if (state.seqPlaying) stopSequence();
    if (state.scalePlaying) stopScale();
    const base = PICKER_BASE + chord.root;
    state.notes = new Set(chord.intervals.map((iv) => base + iv));
    state.root = chord.root;
    state.explicitType = chord.typeId || null;
    state.scaleManual = false;
    render();
    playCurrent();
  }

  let suggSig = '';

  function renderSuggestions() {
    const wrap = $('suggRows');
    if (!wrap) return;
    syncSuggControls();
    const data = buildSuggestions();
    wrap.textContent = '';

    if (data.empty) {
      const p = document.createElement('p');
      p.className = 'sugg-empty';
      p.textContent = t('sugg.empty');
      wrap.appendChild(p);
      return;
    }

    data.rows.forEach((row) => {
      const line = document.createElement('div');
      line.className = 'sugg-row';
      const lab = document.createElement('span');
      lab.className = 'sugg-label';
      lab.textContent = t('sugg.row.' + row.id);
      line.appendChild(lab);

      const chips = document.createElement('span');
      chips.className = 'sugg-chips';
      row.items.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sugg-chip';
        const sym = document.createElement('span');
        sym.className = 'sugg-sym';
        sym.textContent = item.chord.symbol;
        b.appendChild(sym);
        if (item.hint) {
          const h = document.createElement('span');
          h.className = 'sugg-hint';
          h.textContent = item.hint;
          b.appendChild(h);
        }
        b.title = item.chord.symbol + (item.chord.quality ? ' · ' + item.chord.quality : '');
        b.addEventListener('click', () => applySuggestion(item.chord));
        chips.appendChild(b);
      });
      line.appendChild(chips);
      wrap.appendChild(line);
    });
  }

  function syncSuggControls() {
    const rootSel = $('suggRoot');
    const scSel = $('suggScale');
    const auto = $('suggAuto');
    if (!rootSel || !scSel) return;
    rootSel.disabled = state.suggAuto;
    scSel.disabled = state.suggAuto;
    if (auto) {
      auto.classList.toggle('is-active', state.suggAuto);
      auto.setAttribute('aria-pressed', state.suggAuto ? 'true' : 'false');
    }
    const key = suggestionKey();
    if (key) {
      rootSel.value = String(key.root);
      scSel.value = key.scale.id;
    }
  }

  function maybeRenderSuggestions() {
    const sig = [
      state.suggAuto ? '1' : '0',
      state.suggRoot,
      state.suggScaleId,
      lang(),
      state.sequence.map((st) => (st.notes || []).join('.')).join('|'),
      state.sequence.length ? '' : notesSorted().join('.')
    ].join('~');
    if (sig === suggSig) return;
    suggSig = sig;
    renderSuggestions();
  }

  function populateSuggSelects() {
    const rootSel = $('suggRoot');
    const scSel = $('suggScale');
    if (!rootSel || !scSel) return;
    rootSel.textContent = '';
    for (let pc = 0; pc < 12; pc++) {
      const o = document.createElement('option');
      o.value = String(pc);
      o.textContent = T.enName(pc);
      rootSel.appendChild(o);
    }
    scSel.textContent = '';
    const families = [];
    T.SCALES.forEach((sc) => {
      let f = families.filter((x) => x.name === sc.family)[0];
      if (!f) { f = { name: sc.family, items: [] }; families.push(f); }
      f.items.push(sc);
    });
    families.forEach((fam) => {
      const og = document.createElement('optgroup');
      og.label = fam.name;
      fam.items.forEach((sc) => {
        const o = document.createElement('option');
        o.value = sc.id;
        o.textContent = scaleLabel(sc);
        og.appendChild(o);
      });
      scSel.appendChild(og);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Layout: colapsar y mover cajas                                    */
  /* ---------------------------------------------------------------- */
  const LAYOUT_KEY = 'chord-assist.layout';

  const CARD_TITLES = {
    picker: 'card.picker',
    piano: 'card.piano',
    guitar: 'card.guitar',
    open: 'card.open',
    chord: 'card.chord',
    struct: 'card.struct',
    scale: 'card.scale',
    bass: 'card.bass',
    drum: 'card.drum',
    seqarp: 'card.seqarp',
    sugg: 'card.sugg'
  };

  function cardTitle(id) {
    return t(CARD_TITLES[id] || 'card.picker');
  }

  function refreshCardTitles() {
    document.querySelectorAll('.workspace > .card').forEach((card) => {
      const mini = card.querySelector('.card-mini-title');
      if (mini) mini.textContent = cardTitle(card.dataset.card);
    });
  }

  function saveLayout() {
    const cards = Array.from(document.querySelectorAll('.workspace > .card'));
    const data = {
      ids: cards.map((c) => c.dataset.card).filter(Boolean),
      collapsed: cards.filter((c) => c.classList.contains('is-collapsed')).map((c) => c.dataset.card)
    };
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(data)); } catch (e) { /* noop */ }
  }

  function moveCardUp(card) {
    const parent = card.parentNode;
    const prev = card.previousElementSibling;
    if (prev) parent.insertBefore(card, prev);
    else parent.appendChild(card);
    saveLayout();
  }

  function moveCardDown(card) {
    const parent = card.parentNode;
    const next = card.nextElementSibling;
    if (next) parent.insertBefore(next, card);
    else parent.insertBefore(card, parent.firstElementChild);
    saveLayout();
  }

  function toggleCardCollapse(card) {
    const collapsed = card.classList.toggle('is-collapsed');
    const btn = card.querySelector('.card-tool.col');
    if (btn) btn.textContent = collapsed ? '+' : '–';
    saveLayout();
  }

  function initCardLayout() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    const cards = Array.from(workspace.querySelectorAll(':scope > .card'));
    cards.forEach((card) => {
      if (!card.dataset.card) return;
      card.classList.add('has-tools');
      const tools = document.createElement('div');
      tools.className = 'card-tools';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'card-tool up';
      up.title = t('card.up');
      up.textContent = '▲';
      up.addEventListener('click', () => moveCardUp(card));
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'card-tool down';
      down.title = t('card.down');
      down.textContent = '▼';
      down.addEventListener('click', () => moveCardDown(card));
      const col = document.createElement('button');
      col.type = 'button';
      col.className = 'card-tool col';
      col.title = t('card.collapse');
      col.textContent = '–';
      col.addEventListener('click', () => toggleCardCollapse(card));
      tools.appendChild(up);
      tools.appendChild(down);
      tools.appendChild(col);
      card.appendChild(tools);

      const mini = document.createElement('span');
      mini.className = 'card-mini-title';
      mini.textContent = cardTitle(card.dataset.card);
      card.appendChild(mini);
    });

    let data = null;
    try { data = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (e) { data = null; }
    if (data && Array.isArray(data.ids)) {
      const idx = (c) => {
        const i = data.ids.indexOf(c.dataset.card);
        return i === -1 ? 999 : i;
      };
      Array.from(workspace.querySelectorAll(':scope > .card'))
        .sort((a, b) => idx(a) - idx(b))
        .forEach((c) => workspace.appendChild(c));
      (data.collapsed || []).forEach((id) => {
        const c = Array.from(workspace.querySelectorAll(':scope > .card')).filter((x) => x.dataset.card === id)[0];
        if (c) {
          c.classList.add('is-collapsed');
          const b = c.querySelector('.card-tool.col');
          if (b) b.textContent = '+';
        }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Estructura de la canción                                         */
  /* ---------------------------------------------------------------- */
  const SECTION_NAMES = ['intro', 'verse', 'chorus', 'bridge', 'interlude', 'solo', 'outro', 'section'];
  const SECTION_COLORS = {
    intro: '#6aa9ff',
    verse: '#5eead4',
    chorus: '#ffb454',
    bridge: '#b98cff',
    interlude: '#7dd3fc',
    solo: '#ff7ab6',
    outro: '#9aa4b2',
    section: '#8a94a6'
  };

  let structSig = '';

  function sectionParts(sec) {
    const m = /^([a-z]+)(?:-(\d+))?$/.exec(sec || '');
    if (!m || SECTION_NAMES.indexOf(m[1]) === -1) return { base: 'section', num: null };
    return { base: m[1], num: m[2] ? parseInt(m[2], 10) : null };
  }

  function sectionName(sec) {
    const p = sectionParts(sec);
    const base = t('section.' + p.base);
    return p.num ? t('section.copy', { name: base, n: p.num }) : base;
  }

  function sectionColor(sec) {
    return SECTION_COLORS[sectionParts(sec).base] || SECTION_COLORS.section;
  }

  function hexA(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const bl = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
  }

  function syncSections() {
    const seen = [];
    state.sequence.forEach((st) => {
      if (st.section && seen.indexOf(st.section) === -1) seen.push(st.section);
    });
    state.sections = (state.sections || []).filter((n) => typeof n === 'string' && n);
    seen.forEach((n) => {
      if (state.sections.indexOf(n) === -1) state.sections.push(n);
    });
  }

  function normalizeSequence() {
    const by = {};
    const loose = [];
    state.sequence.forEach((st) => {
      if (st.section) (by[st.section] = by[st.section] || []).push(st);
      else loose.push(st);
    });
    const out = [];
    state.sections.forEach((n) => {
      (by[n] || []).forEach((st) => out.push(st));
    });
    Object.keys(by).forEach((n) => {
      if (state.sections.indexOf(n) === -1) by[n].forEach((st) => out.push(st));
    });
    loose.forEach((st) => out.push(st));
    state.sequence = out;
  }

  function nextSectionName(base) {
    const b = SECTION_NAMES.indexOf(base) !== -1 ? base : 'section';
    const names = state.sections.slice();
    state.sequence.forEach((st) => { if (st.section) names.push(st.section); });
    let max = 0;
    names.forEach((n) => {
      const p = sectionParts(n);
      if (p.base !== b) return;
      max = Math.max(max, p.num || 1);
    });
    return max === 0 ? b : b + '-' + (max + 1);
  }

  function renderStructure() {
    const body = $('structBody');
    if (!body) return;
    syncSections();

    const pb = $('structPlay');
    if (pb) {
      pb.classList.toggle('is-active', state.seqPlaying);
      pb.textContent = state.seqPlaying ? '■' : '▶';
    }

    const sig = state.sections.join(',') + '|' +
      state.sequence.map((st) => (st.symbol || '') + ':' + (st.section || '')).join('|');
    if (sig === structSig) {
      updateStructActive();
      return;
    }
    structSig = sig;
    body.textContent = '';

    const loose = state.sequence.filter((st) => !st.section || state.sections.indexOf(st.section) === -1);

    if (!state.sections.length && !loose.length) {
      const p = document.createElement('p');
      p.className = 'struct-empty';
      p.textContent = t('struct.empty');
      body.appendChild(p);
      return;
    }

    state.sections.forEach((name) => body.appendChild(sectionGroup(name)));

    if (loose.length) {
      const group = document.createElement('div');
      group.className = 'struct-group';
      group.style.setProperty('--sec', 'rgba(255,255,255,0.12)');
      group.style.setProperty('--sec-bg', 'rgba(255,255,255,0.025)');
      const chips = document.createElement('div');
      chips.className = 'struct-chips';
      loose.forEach((st) => chips.appendChild(structChip(state.sequence.indexOf(st), null)));
      group.appendChild(chips);
      body.appendChild(group);
    }

    updateStructActive();
  }

  function updateStructActive() {
    document.querySelectorAll('.struct-chip').forEach((c) => {
      c.classList.toggle('is-active', Number(c.dataset.i) === state.activeStep);
    });
  }

  function structChip(k, sec) {
    const step = state.sequence[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'struct-chip' + (k === state.activeStep ? ' is-active' : '');
    b.dataset.i = String(k);

    if (sec) {
      const c = sectionColor(sec);
      b.style.setProperty('--chip-bg', hexA(c, 0.28));
      b.style.setProperty('--chip-line', hexA(c, 0.62));
      b.style.setProperty('--chip-glow', hexA(c, 0.30));
    }

    const num = document.createElement('span');
    num.className = 'struct-num';
    num.textContent = String(k + 1);

    const sym = document.createElement('span');
    sym.className = 'struct-sym';
    sym.textContent = step.symbol || '—';

    b.appendChild(num);
    b.appendChild(sym);
    b.addEventListener('click', () => {
      if (state.seqPlaying) stopSequence();
      if (state.editingIndex != null) cancelEdit();
      loadStep(k, true);
    });
    return b;
  }

  function sectionGroup(name) {
    const color = sectionColor(name);
    const group = document.createElement('div');
    group.className = 'struct-group';
    group.style.setProperty('--sec', color);
    group.style.setProperty('--sec-bg', hexA(color, 0.12));

    group.appendChild(sectionHeader(name));

    const chips = document.createElement('div');
    chips.className = 'struct-chips';
    const idxs = [];
    state.sequence.forEach((st, i) => { if (st.section === name) idxs.push(i); });

    if (!idxs.length) {
      const p = document.createElement('span');
      p.className = 'struct-empty-chips';
      p.textContent = t('struct.noChords');
      chips.appendChild(p);
    } else {
      idxs.forEach((i) => chips.appendChild(structChip(i, name)));
    }
    group.appendChild(chips);
    return group;
  }

  function sectionHeader(name) {
    const head = document.createElement('div');
    head.className = 'struct-section';

    const dot = document.createElement('span');
    dot.className = 'struct-dot';

    const sel = document.createElement('select');
    sel.className = 'struct-name';
    SECTION_NAMES.forEach((n) => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = sectionName(n);
      sel.appendChild(o);
    });
    const parts = sectionParts(name);
    sel.value = parts.base;
    if (name !== parts.base) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = sectionName(name);
      sel.appendChild(o);
      sel.value = name;
    }
    sel.addEventListener('change', () => renameSection(name, sel.value));

    head.appendChild(dot);
    head.appendChild(sel);
    head.appendChild(structBtn('⧉', t('struct.dup'), () => duplicateSection(name)));
    head.appendChild(structBtn('←', t('struct.stepLeft'), () => moveChordStep(-1)));
    head.appendChild(structBtn('→', t('struct.stepRight'), () => moveChordStep(1)));
    head.appendChild(structBtn('↑', t('struct.sectionUp'), () => moveSection(name, -1)));
    head.appendChild(structBtn('↓', t('struct.sectionDown'), () => moveSection(name, 1)));
    head.appendChild(structBtn('＋', t('struct.addChord'), () => addChordToSection(name)));
    head.appendChild(structBtn('−', t('struct.removeChord'), () => removeChordFromSection(name)));
    head.appendChild(structBtn('×', t('struct.remove'), () => dissolveSection(name)));
    return head;
  }

  function structBtn(text, title, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'struct-tool';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', fn);
    return b;
  }

  function renameSection(oldName, nextName) {
    if (!nextName || nextName === oldName) return;
    state.sections = state.sections.map((n) => (n === oldName ? nextName : n));
    state.sequence.forEach((st) => { if (st.section === oldName) st.section = nextName; });
    normalizeSequence();
    renderSteps();
    renderStructure();
  }

  function duplicateSection(name) {
    const copyName = nextSectionName(sectionParts(name).base);
    const idx = state.sections.indexOf(name);
    if (idx === -1) state.sections.push(copyName);
    else state.sections.splice(idx + 1, 0, copyName);

    state.sequence.forEach((st) => {
      if (st.section !== name) return;
      state.sequence.push(Object.assign({}, st, {
        notes: (st.notes || []).slice(),
        drums: cloneDrums(st.drums),
        seqarp: cloneSeqArp(st.seqarp),
        arpKey: st.arpKey || null,
        section: copyName
      }));
    });

    normalizeSequence();
    renderSteps();
    renderStructure();
  }

  function moveChordStep(dir) {
    const i = state.activeStep;
    if (i < 0 || !state.sequence[i]) {
      flash(t('struct.selectChord'));
      return;
    }
    const j = i + dir;
    if (j < 0 || j >= state.sequence.length) return;
    if ((state.sequence[i].section || null) !== (state.sequence[j].section || null)) return;
    const tmp = state.sequence[i];
    state.sequence[i] = state.sequence[j];
    state.sequence[j] = tmp;
    state.activeStep = j;
    renderSteps();
    renderStructure();
  }

  function moveSection(name, dir) {
    const idx = state.sections.indexOf(name);
    if (idx === -1) return;
    const j = idx + dir;
    if (j < 0 || j >= state.sections.length) return;
    const arr = state.sections.slice();
    const tmp = arr[idx];
    arr[idx] = arr[j];
    arr[j] = tmp;
    state.sections = arr;
    normalizeSequence();
    renderSteps();
    renderStructure();
  }

  function addChordToSection(name) {
    const info = currentInfo();
    if (!info || !info.notes.length) {
      flash(t('msg.buildChord'));
      return;
    }
    const sc = selectedScale();
    const nuevo = {
      notes: info.notes.slice(),
      symbol: info.symbol || info.pcs.map(localNote).join(' '),
      name: info.name,
      root: info.root,
      typeId: state.explicitType,
      bars: 1,
      beats: 4,
      scaleId: sc ? sc.id : null,
      scaleRoot: sc ? state.scaleRoot : null,
      scaleName: sc ? scaleLabel(sc) : null,
      drums: cloneDrums(state.drums),
      section: name,
      bass: Object.assign({}, state.bass),
      scaleAuto: state.scaleAutoplay,
      arpAuto: state.arpAuto,
      arpKey: state.arp ? state.arp.key : null,
      seqarp: cloneSeqArp(state.seqArp)
    };
    state.sequence.push(nuevo);
    if (state.sections.indexOf(name) === -1) state.sections.push(name);
    normalizeSequence();
    state.activeStep = state.sequence.indexOf(nuevo);
    renderSteps();
    renderStructure();
    flash(t('struct.added', { sym: info.symbol || '' }));
  }

  function removeChordFromSection(name) {
    let idx = -1;
    if (state.activeStep >= 0 &&
        state.sequence[state.activeStep] &&
        state.sequence[state.activeStep].section === name) {
      idx = state.activeStep;
    }
    if (idx === -1) {
      for (let i = state.sequence.length - 1; i >= 0; i--) {
        if (state.sequence[i].section === name) { idx = i; break; }
      }
    }
    if (idx === -1) {
      flash(t('struct.noChords'));
      return;
    }
    state.sequence.splice(idx, 1);
    if (state.activeStep === idx) state.activeStep = -1;
    else if (state.activeStep > idx) state.activeStep -= 1;
    renderSteps();
    renderStructure();
    flash(t('struct.removedChord'));
  }

  function dissolveSection(name) {
    state.sections = state.sections.filter((n) => n !== name);
    state.sequence.forEach((st) => { if (st.section === name) st.section = null; });
    renderSteps();
    renderStructure();
  }

  function addSection() {
    const base = $('structNewName') ? $('structNewName').value : 'section';
    const name = nextSectionName(base);
    if (state.sections.indexOf(name) === -1) state.sections.push(name);
    renderSteps();
    renderStructure();
    flash(t('struct.addedSection', { name: sectionName(name) }));
  }

  /* ---------------------------------------------------------------- */
  /* Arpegios                                                          */
  /* ---------------------------------------------------------------- */
  function arpSymbol(pcs, rootPc) {
    const cands = T.identify(pcs);
    const pick = cands.filter((c) => c.root === T.mod12(rootPc))[0] || cands[0];
    if (!pick) return pcs.map((p) => nameOf(p)).join(' ');
    return T.chordSymbol(pick.root, pick.chord);
  }

  function makeArp(label, root, pcs) {
    const set = Array.from(new Set(pcs.map((p) => T.mod12(p)))).sort((a, b) => a - b);
    return {
      key: T.mod12(root) + '|' + set.join(','),
      label: label,
      root: T.mod12(root),
      pcs: set,
      symbol: arpSymbol(set, root)
    };
  }

  function arpProposals() {
    const info = state.info;
    const out = [];
    if (!info || !info.chord || !info.pcs.length) return out;
    const root = info.root;
    const ivs = info.chord.intervals;

    out.push(Object.assign(
      makeArp(t('arp.chordTriad'), root, ivs.slice(0, 3).map((iv) => root + iv)),
      { group: 'chord' }
    ));
    if (ivs.length > 3) {
      out.push(Object.assign(
        makeArp(t('arp.chordSeventh'), root, ivs.map((iv) => root + iv)),
        { group: 'chord' }
      ));
    }

    const scales = T.scalesForNotes(info.pcs)
      .filter((x) => x.scale.intervals.length >= 7 && T.mod12(x.root) !== T.mod12(root))
      .map((x) => {
        const n = x.scale.intervals.length;
        const r = T.mod12(x.root);
        const triad = [0, 2, 4].map((k) => r + x.scale.intervals[k % n]);
        const overlap = triad
          .map((pc) => T.mod12(pc))
          .filter((pc) => info.pcs.indexOf(pc) !== -1).length;
        return { item: x, root: r, triad: triad, overlap: overlap };
      })
      .sort((a, b) => b.overlap - a.overlap ||
        a.item.extra - b.item.extra ||
        b.item.scale.rank - a.item.scale.rank)
      .slice(0, 2);

    scales.forEach((entry) => {
      out.push(Object.assign(makeArp(
        t('arp.fromScale', { name: localNote(entry.root) + ' ' + scaleLabel(entry.item.scale) }),
        entry.root,
        entry.triad
      ), { group: 'scale' }));
    });

    return out;
  }

  let arpSig = '';

  function maybeRenderArp() {
    const sig = [
      pcsOf().join('.'),
      state.info ? state.info.root : '',
      state.arp ? state.arp.key : '',
      state.arpKeyPending || '',
      lang()
    ].join('~');
    if (sig === arpSig) return;
    arpSig = sig;
    renderArp();
  }

  function renderArp() {
    const body = $('arpBody');
    if (!body) return;
    const props = arpProposals();

    if (state.arpKeyPending) {
      const found = props.filter((x) => x.key === state.arpKeyPending)[0];
      if (found) state.arp = found;
      state.arpKeyPending = null;
    }
    if (state.arp && !props.some((x) => x.key === state.arp.key)) state.arp = null;
    if (!state.arp && props.length) state.arp = props[0];

    body.textContent = '';

    if (!props.length) {
      const p = document.createElement('p');
      p.className = 'arp-empty';
      p.textContent = t('arp.empty');
      body.appendChild(p);
      updateArpBtn();
      return;
    }

    const rows = [
      { label: t('arp.row.chord'), items: props.filter((x) => x.group === 'chord') },
      { label: t('arp.row.scale'), items: props.filter((x) => x.group === 'scale') }
    ];

    rows.forEach((row) => {
      if (!row.items.length) return;
      const line = document.createElement('div');
      line.className = 'arp-row';

      const lab = document.createElement('span');
      lab.className = 'arp-label';
      lab.textContent = row.label;
      line.appendChild(lab);

      const chips = document.createElement('span');
      chips.className = 'arp-chips';
      row.items.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'arp-chip' + (state.arp && state.arp.key === item.key ? ' is-active' : '');
        const sym = document.createElement('span');
        sym.className = 'arp-sym';
        sym.textContent = item.symbol;
        const hint = document.createElement('span');
        hint.className = 'arp-hint';
        hint.textContent = item.label;
        b.appendChild(sym);
        b.appendChild(hint);
        b.addEventListener('click', () => {
          if (state.arp && state.arp.key === item.key) {
            state.arp = null;
          } else {
            state.arp = item;
            state.searchMode = 'arpeggios';
            syncSearchButtons();
          }
          renderGuitar();
          renderArp();
        });
        chips.appendChild(b);
      });
      line.appendChild(chips);
      body.appendChild(line);
    });

    renderTriads();
    updateArpBtn();
  }

  const TRIADS = [
    { id: 'maj', i18n: 'triad.maj' },
    { id: 'min', i18n: 'triad.min' },
    { id: 'aug', i18n: 'triad.aug' },
    { id: 'dim', i18n: 'triad.dim' }
  ];

  function triadPcs(root, type) {
    const ivs = type === 'maj' ? [0, 4, 7]
      : type === 'min' ? [0, 3, 7]
        : type === 'aug' ? [0, 4, 8] : [0, 3, 6];
    return ivs.map((iv) => T.mod12(root + iv));
  }

  function renderTriads() {
    const wrap = $('arpTriads');
    if (!wrap) return;
    wrap.textContent = '';
    const info = state.info;
    if (!info || !info.chord) return;

    TRIADS.forEach((tri) => {
      const active = state.triad && state.triad.type === tri.id && state.triad.root === T.mod12(info.root);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arp-chip triad-chip' + (active ? ' is-active' : '');

      const sym = document.createElement('span');
      sym.className = 'arp-sym triad-sym';
      sym.textContent = T.chordSymbol(T.mod12(info.root), T.CHORDS[tri.id]);

      const hint = document.createElement('span');
      hint.className = 'arp-hint';
      hint.textContent = t(tri.i18n);

      b.appendChild(sym);
      b.appendChild(hint);
      b.addEventListener('click', () => {
        if (active) {
          state.triad = null;
        } else {
          state.triad = { root: T.mod12(info.root), type: tri.id };
          state.searchMode = 'arpeggios';
          syncSearchButtons();
        }
        renderGuitar();
        renderArp();
        updateTriadBtn();
      });
      wrap.appendChild(b);
    });
  }

  function triadSequence() {
    if (!state.triad) return null;
    const rootMidi = 48 + state.triad.root + (state.triadOctave || 0) * 12;
    const ivs = triadPcs(state.triad.root, state.triad.type)
      .map((pc) => T.mod12(pc - state.triad.root)).sort((a, b) => a - b);
    const up = [];
    for (let o = 0; o <= 12; o += 12) ivs.forEach((iv) => up.push(rootMidi + iv + o));
    up.push(rootMidi + 24);
    return up.concat(up.slice(0, -1).reverse());
  }

  function updateTriadBtn() {
    const pb = $('triadPlay');
    if (pb) {
      pb.classList.toggle('is-active', state.triadPlaying);
      pb.textContent = state.triadPlaying ? '■' : '▶';
    }
    const sp = $('triadSpeed');
    if (sp) sp.textContent = '×' + (state.triadSpeed || 1);
    const au = $('triadAuto');
    if (au) {
      au.classList.toggle('is-active', state.triadAuto);
      au.setAttribute('aria-pressed', state.triadAuto ? 'true' : 'false');
    }
    const lp = $('triadLoop');
    if (lp) {
      lp.classList.toggle('is-active', state.triadLoop);
      lp.setAttribute('aria-pressed', state.triadLoop ? 'true' : 'false');
    }
    const dn = $('triadOctDown');
    const upBtn = $('triadOctUp');
    if (dn) dn.classList.toggle('is-active', (state.triadOctave || 0) < 0);
    if (upBtn) upBtn.classList.toggle('is-active', (state.triadOctave || 0) > 0);
  }

  function stopTriad() {
    A.stopLayer('triad');
    state.triadPlaying = false;
    updateTriadBtn();
  }

  function startTriadAt(startTime, totalDur) {
    const seq = triadSequence();
    if (!seq) return false;
    const stepMs = (60000 / A.Settings.bpm) / 2 / (state.triadSpeed || 1);
    const wave = $('scaleWave') ? $('scaleWave').value : 'sine';
    const gain = $('scaleVol') ? parseFloat($('scaleVol').value) : 0.65;

    A.setLayerOptions('triad', { waveform: wave, gain: gain });
    A.ensure();
    A.melody(seq, {
      stepMs: stepMs,
      repeat: totalDur ? true : state.triadLoop,
      startTime: startTime,
      totalDur: totalDur || null,
      layer: 'triad'
    });
    state.triadPlaying = true;
    updateTriadBtn();

    if (isPro() && MIDI.enabled) {
      let midiSeq = seq;
      if (totalDur) {
        const reps = Math.max(1, Math.ceil(totalDur / ((seq.length * stepMs) / 1000)));
        if (reps > 1) {
          midiSeq = [];
          for (let r = 0; r < reps; r++) midiSeq = midiSeq.concat(seq);
        }
      }
      MIDI.sendSequence(midiSeq, stepMs, stepMs * 0.9, state.scaleChannel);
    }
    return true;
  }

  function playTriad() {
    if (state.triadPlaying) { stopTriad(); return; }
    if (!state.triad) { flash(t('triad.pick')); return; }
    startTriadAt(A.now() + 0.05);
  }

  function arpeggioPositions() {
    const pcs = new Set(state.arp ? state.arp.pcs : []);
    if (!pcs.size) return [];
    const out = [];
    state.guitarTuning.forEach((open) => {
      for (let f = 0; f <= 12; f++) {
        if (pcs.has(T.mod12(open + f))) out.push(open + f);
      }
    });
    return out;
  }

  function updateArpBtn() {
    const pb = $('arpPlay');
    if (pb) {
      pb.classList.toggle('is-active', state.arpPlaying);
      pb.textContent = state.arpPlaying ? '■' : '▶';
    }
    const sp = $('arpSpeed');
    if (sp) sp.textContent = '×' + (state.arpSpeed || 1);
    const lp = $('arpLoop');
    if (lp) {
      lp.classList.toggle('is-active', state.arpLoop);
      lp.setAttribute('aria-pressed', state.arpLoop ? 'true' : 'false');
    }
    const au = $('arpAuto');
    if (au) {
      au.classList.toggle('is-active', state.arpAuto);
      au.setAttribute('aria-pressed', state.arpAuto ? 'true' : 'false');
    }
    const dn = $('arpOctDown');
    const up = $('arpOctUp');
    if (dn) dn.classList.toggle('is-active', (state.arpOctave || 0) < 0);
    if (up) up.classList.toggle('is-active', (state.arpOctave || 0) > 0);
  }

  function stopArp() {
    A.stopLayer('arp');
    state.arpPlaying = false;
    updateArpBtn();
    if (isPro() && MIDI.enabled && !state.scalePlaying) MIDI.stopChannel(state.scaleChannel);
  }

  function arpSequence() {
    if (!state.arp) return null;
    const rootMidi = 48 + state.arp.root + (state.arpOctave || 0) * 12;
    const ivs = state.arp.pcs.map((pc) => T.mod12(pc - state.arp.root)).sort((a, b) => a - b);
    const up = [];
    for (let o = 0; o <= 12; o += 12) {
      ivs.forEach((iv) => up.push(rootMidi + iv + o));
    }
    up.push(rootMidi + 24);
    return up.concat(up.slice(0, -1).reverse());
  }

  function startArpAt(startTime, totalDur) {
    const seq = arpSequence();
    if (!seq) return false;
    const stepMs = (60000 / A.Settings.bpm) / 2 / (state.arpSpeed || 1);
    const wave = $('scaleWave') ? $('scaleWave').value : 'sine';
    const gain = $('scaleVol') ? parseFloat($('scaleVol').value) : 0.65;

    A.setLayerOptions('arp', { waveform: wave, gain: gain });
    A.ensure();
    A.melody(seq, {
      stepMs: stepMs,
      repeat: totalDur ? true : state.arpLoop,
      startTime: startTime,
      totalDur: totalDur || null,
      layer: 'arp'
    });
    state.arpPlaying = true;
    updateArpBtn();

    if (isPro() && MIDI.enabled) {
      let midiSeq = seq;
      if (totalDur) {
        const reps = Math.max(1, Math.ceil(totalDur / ((seq.length * stepMs) / 1000)));
        if (reps > 1) {
          midiSeq = [];
          for (let r = 0; r < reps; r++) midiSeq = midiSeq.concat(seq);
        }
      }
      MIDI.sendSequence(midiSeq, stepMs, stepMs * 0.9, state.scaleChannel);
    }
    return true;
  }

  function playArp() {
    if (state.arpPlaying) { stopArp(); return; }
    if (!state.arp) return;
    startArpAt(A.now() + 0.05);
  }

  /* ---------------------------------------------------------------- */
  /* Arpegiador (piano roll)                                           */
  /* ---------------------------------------------------------------- */
  const SEQARP_BASE = 36;

  function seqArpKey(sem, col) { return sem + ':' + col; }

  function cloneSeqArp(d) {
    const src = d || {};
    return {
      cols: src.cols === 32 ? 32 : 16,
      speed: [1, 2, 4].indexOf(src.speed) !== -1 ? src.speed : 1,
      volume: typeof src.volume === 'number' ? src.volume : 0.8,
      auto: !!src.auto,
      cells: Object.assign({}, src.cells || {})
    };
  }

  function renderSeqArp() {
    const piano = $('seqarpPiano');
    const grid = $('seqarpGrid');
    if (!piano || !grid) return;

    const cols = state.seqArp.cols;
    const pcs = state.scalePcs || new Set();
    const blackPcs = [1, 3, 6, 8, 10];

    Object.keys(state.seqArp.cells).forEach((k) => {
      const sem = parseInt(k.split(':')[0], 10);
      if (!pcs.has(T.mod12(SEQARP_BASE + sem))) delete state.seqArp.cells[k];
    });

    piano.textContent = '';
    grid.textContent = '';
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';

    for (let d = 0; d < 12; d++) {
      const sem = 11 - d;
      const pc = T.mod12(SEQARP_BASE + sem);
      const off = !pcs.has(pc);

      const key = document.createElement('div');
      key.className = 'seqarp-key' + (blackPcs.indexOf(pc) !== -1 ? ' is-black' : '');
      key.textContent = T.enName(pc);
      piano.appendChild(key);

      for (let c = 0; c < cols; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        const oct = state.seqArp.cells[seqArpKey(sem, c)] || 0;
        b.className = 'seqarp-cell' + (off ? ' is-off' : '') + (oct ? ' oct-' + oct : '');
        b.dataset.sem = String(sem);
        b.dataset.col = String(c);
        b.textContent = oct ? String(oct) : '';
        b.addEventListener('click', () => cycleSeqArpCell(sem, c, b));
        grid.appendChild(b);
      }
    }
    updateSeqArpBtn();
  }

  function cycleSeqArpCell(sem, col, btn) {
    const pc = T.mod12(SEQARP_BASE + sem);
    if (!(state.scalePcs && state.scalePcs.has(pc))) return;
    const k = seqArpKey(sem, col);
    const cur = state.seqArp.cells[k] || 0;
    const next = cur === 0 ? 1 : (cur >= 4 ? 0 : cur + 1);
    if (next) state.seqArp.cells[k] = next;
    else delete state.seqArp.cells[k];
    btn.className = 'seqarp-cell' + (next ? ' oct-' + next : '');
    btn.textContent = next ? String(next) : '';
  }

  let seqArpSig = '';

  function maybeRenderSeqArp() {
    const sig = [
      state.seqArp.cols,
      state.seqArp.speed,
      Array.from(state.scalePcs || []).sort((a, b) => a - b).join('.'),
      Object.keys(state.seqArp.cells).sort().map((k) => k + '=' + state.seqArp.cells[k]).join(',')
    ].join('~');
    if (sig === seqArpSig) return;
    seqArpSig = sig;
    renderSeqArp();
  }

  function seqArpSteps() {
    const cols = state.seqArp.cols;
    const out = [];
    for (let c = 0; c < cols; c++) {
      const notes = [];
      for (let sem = 0; sem < 12; sem++) {
        const oct = state.seqArp.cells[seqArpKey(sem, c)] || 0;
        if (oct) notes.push(SEQARP_BASE + sem + (oct - 1) * 12);
      }
      out.push(notes);
    }
    return out;
  }

  function updateSeqArpBtn() {
    const pb = $('seqarpPlay');
    if (pb) {
      pb.classList.toggle('is-active', state.seqArpPlaying);
      pb.textContent = state.seqArpPlaying ? '■' : '▶';
    }
    const sp = $('seqarpSpeed');
    if (sp) sp.textContent = '×' + (state.seqArp.speed || 1);
    const au = $('seqarpAuto');
    if (au) {
      au.classList.toggle('is-active', !!state.seqArp.auto);
      au.setAttribute('aria-pressed', state.seqArp.auto ? 'true' : 'false');
    }
    const vol = $('seqarpVol');
    if (vol && parseFloat(vol.value) !== state.seqArp.volume) {
      vol.value = String(state.seqArp.volume);
    }
    const cols = $('seqarpCols');
    if (cols && parseInt(cols.value, 10) !== state.seqArp.cols) {
      cols.value = String(state.seqArp.cols);
    }
  }

  function stopSeqArp() {
    A.stopSteps();
    state.seqArpPlaying = false;
    updateSeqArpBtn();
  }

  function startSeqArpAt(startTime, totalDur) {
    const steps = seqArpSteps();
    if (!steps.some((x) => x.length)) return false;
    const stepMs = ((60000 / A.Settings.bpm) / 4) / (state.seqArp.speed || 1);
    const wave = $('scaleWave') ? $('scaleWave').value : 'sine';
    A.setLayerOptions('seqarp', { waveform: wave, gain: state.seqArp.volume });
    A.ensure();
    A.playSteps(steps, {
      stepMs: stepMs,
      layer: 'seqarp',
      startTime: startTime,
      totalDur: totalDur || null
    });
    state.seqArpPlaying = true;
    updateSeqArpBtn();
    return true;
  }

  function playSeqArp() {
    if (state.seqArpPlaying) { stopSeqArp(); return; }
    if (!startSeqArpAt(A.now() + 0.05)) flash(t('seqarp.empty'));
  }

  /* ---------------------------------------------------------------- */
  /* Acorde abierto (primeros 4 trastes)                               */
  /* ---------------------------------------------------------------- */
  const OPEN_SHAPES = {
    C: [-1, 3, 2, 0, 1, 0],
    C7: [-1, 3, 2, 3, 1, 0],
    Cmaj7: [-1, 3, 2, 0, 0, 0],
    Cadd9: [-1, 3, 2, 0, 3, 0],
    D: [-1, -1, 0, 2, 3, 2],
    Dm: [-1, -1, 0, 2, 3, 1],
    D7: [-1, -1, 0, 2, 1, 2],
    Dm7: [-1, -1, 0, 2, 1, 1],
    E: [0, 2, 2, 1, 0, 0],
    Em: [0, 2, 2, 0, 0, 0],
    E7: [0, 2, 0, 1, 0, 0],
    Em7: [0, 2, 0, 0, 0, 0],
    G: [3, 2, 0, 0, 0, 3],
    G7: [3, 2, 0, 0, 0, 1],
    A: [-1, 0, 2, 2, 2, 0],
    Am: [-1, 0, 2, 2, 1, 0],
    A7: [-1, 0, 2, 0, 2, 0],
    Am7: [-1, 0, 2, 0, 1, 0],
    B7: [-1, 2, 1, 2, 0, 2],
    Fmaj7: [-1, -1, 3, 2, 1, 0]
  };

  function openChordShape(pcs, root, symbol) {
    if (symbol && OPEN_SHAPES[symbol]) return OPEN_SHAPES[symbol].slice();

    const tuning = [40, 45, 50, 55, 59, 64];
    const cand = tuning.map((open) => {
      const list = [{ f: -1, midi: null }];
      for (let f = 0; f <= 4; f++) {
        if (pcs.has(T.mod12(open + f))) list.push({ f: f, midi: open + f });
      }
      return list;
    });

    let best = null;
    const pick = [];

    const rec = (i) => {
      if (i === tuning.length) {
        const sounding = pick.filter((x) => x.f >= 0);
        if (sounding.length < 4) return;
        if (!pick.some((x) => x.f === 0)) return;

        const bassPc = T.mod12(sounding[0].midi);
        const frets = sounding.filter((x) => x.f > 0).map((x) => x.f);
        const maxF = frets.length ? Math.max.apply(null, frets) : 0;
        const minF = frets.length ? Math.min.apply(null, frets) : 0;
        if (maxF - minF > 3) return;

        let score = sounding.length * 10;
        score += bassPc === T.mod12(root) ? 10 : (pcs.has(bassPc) ? 2 : -8);
        score += pick.filter((x) => x.f === 0).length * 2;
        score -= maxF * 1.5;
        score -= pick.filter((x) => x.f === -1).length * 1.5;
        if (!best || score > best.score) best = { score: score, shape: pick.slice() };
        return;
      }
      cand[i].forEach((c) => {
        pick.push(c);
        rec(i + 1);
        pick.pop();
      });
    };

    rec(0);
    if (!best) return null;
    return best.shape.map((x) => x.f);
  }

  function renderOpenChord() {
    const svg = $('openChord');
    if (!svg) return;
    svg.textContent = '';
    const nameEl = $('openName');

    const info = currentInfo();
    if (nameEl) {
      nameEl.textContent = !info ? '' : (lang() === 'en' ? info.symbol : info.name);
    }

    if (!info) {
      const msg = svgEl('text', { x: 80, y: 100, class: 'oc-empty', 'text-anchor': 'middle' });
      msg.textContent = t('open.empty');
      svg.appendChild(msg);
      return;
    }

    const shape = openChordShape(new Set(info.pcs), info.root, info.symbol);
    if (!shape) {
      const msg = svgEl('text', { x: 80, y: 100, class: 'oc-empty', 'text-anchor': 'middle' });
      msg.textContent = t('open.none');
      svg.appendChild(msg);
      return;
    }

    const left = 24;
    const gap = 22;
    const top = 44;
    const fh = 30;

    for (let f = 0; f <= 4; f++) {
      const y = top + f * fh;
      svg.appendChild(svgEl('line', {
        x1: left - 8, y1: y, x2: left + gap * 5 + 8, y2: y,
        class: f === 0 ? 'oc-nut' : 'oc-fret'
      }));
    }

    for (let i = 0; i < 6; i++) {
      const x = left + i * gap;
      svg.appendChild(svgEl('line', {
        x1: x, y1: top, x2: x, y2: top + 4 * fh, class: 'oc-string'
      }));

      const f = shape[i];
      const tx = svgEl('text', { x: x, y: 30, class: 'oc-mark', 'text-anchor': 'middle' });
      if (f === -1) {
        tx.textContent = '×';
        tx.setAttribute('class', 'oc-mark is-mute');
      } else if (f === 0) {
        tx.textContent = '○';
        tx.setAttribute('class', 'oc-mark is-open');
      }
      if (f === -1 || f === 0) svg.appendChild(tx);

      if (f > 0) {
        const cy = top + (f - 0.5) * fh;
        svg.appendChild(svgEl('circle', { cx: x, cy: round(cy), r: 8.5, class: 'oc-dot' }));
        const num = svgEl('text', { x: x, y: round(cy + 3.5), class: 'oc-num', 'text-anchor': 'middle' });
        num.textContent = String(f);
        svg.appendChild(num);
      }
    }
  }

  function updatePlayBtn() {
    const icon = $('playIcon');
    const label = $('playLabel');
    const btn = $('playBtn');
    if (!btn) return;
    btn.classList.toggle('is-playing', state.chordPlaying);
    icon.textContent = state.chordPlaying ? '■' : '▶';
    label.textContent = state.chordPlaying ? t('chord.stop') : t('chord.play');
  }

  function updateSeqPlay() {
    const btn = $('seqPlay');
    if (!btn) return;
    btn.textContent = state.seqPlaying ? t('seq.stop') : t('seq.play');
    btn.classList.toggle('is-playing', state.seqPlaying);
  }

  function flash(text) {
    const el = $('chordName');
    if (!el) return;
    if (hintTimer) clearTimeout(hintTimer);
    el.textContent = text;
    el.classList.add('is-flash');
    hintTimer = setTimeout(() => {
      el.classList.remove('is-flash');
      renderChord();
    }, 1800);
  }

  /* ---------------------------------------------------------------- */
  /* Desbloqueo / donaciones                                          */
  /* ---------------------------------------------------------------- */
  function isPro() {
    try {
      const v = localStorage.getItem(PRO_KEY);
      return !!v && v !== '0';
    } catch (e) { return false; }
  }

  function setPro(code) {
    try {
      const v = code ? 'code:' + String(code).trim() : '1';
      localStorage.setItem(PRO_KEY, v);
    } catch (e) { /* noop */ }
    updateLockUI();
  }

  function updateLockUI() {
    const pro = isPro();
    const lock = $('midiLock');
    const hint = $('midiLockedHint');
    if (lock) lock.hidden = pro;
    if (hint) hint.hidden = pro;
    const midiBtn = $('midiEnable');
    if (midiBtn) midiBtn.classList.toggle('is-locked', !pro);
  }

  function openModal() {
    const modal = $('modal');
    if (!modal) return;
    modal.hidden = false;
    const input = $('unlockInput');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    const msg = $('unlockMsg');
    if (msg) msg.textContent = '';
  }

  function closeModal() {
    const modal = $('modal');
    if (modal) modal.hidden = true;
  }

  function unlockMsg(text, ok) {
    const msg = $('unlockMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'unlock-msg ' + (ok ? 'is-ok' : 'is-bad');
  }

  async function tryUnlock(code) {
    const clean = String(code || '').trim();
    if (!clean) return false;

    /* Llave maestra histórica (soporte) */
    if (PRO_CODE && clean.toLowerCase() === PRO_CODE.toLowerCase()) {
      setPro();
      unlockMsg(t('modal.unlockOk'), true);
      setTimeout(closeModal, 1200);
      return true;
    }

    /* Validación online contra el bot */
    if (!LICENSE_API) {
      unlockMsg(t('modal.unlockBad'), false);
      return false;
    }

    const btn = document.querySelector('#unlockForm button[type="submit"]');
    if (btn) btn.disabled = true;
    unlockMsg(t('modal.unlockChecking'), true);

    try {
      const res = await fetch(LICENSE_API.replace(/\/$/, '') + '/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.valid) {
        setPro(clean);
        unlockMsg(t('modal.unlockOk'), true);
        setTimeout(closeModal, 1200);
        return true;
      }
      unlockMsg(t('modal.unlockBad'), false);
      return false;
    } catch (e) {
      unlockMsg(t('modal.unlockOffline'), false);
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* Si el código guardado fue anulado (reembolso), se vuelve a bloquear.
     Sin conexión NO se bloquea: sólo si el servidor dice explícitamente que no vale. */
  async function revalidateLicense() {
    if (!LICENSE_API) return;
    let stored = '';
    try { stored = localStorage.getItem(PRO_KEY) || ''; } catch (e) { return; }
    if (!stored.startsWith('code:')) return;

    const code = stored.slice(5);
    try {
      const res = await fetch(LICENSE_API.replace(/\/$/, '') + '/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.valid === false) {
        try { localStorage.removeItem(PRO_KEY); } catch (e) { /* noop */ }
        updateLockUI();
      }
    } catch (e) {
      /* sin red o servidor caído: se mantiene la licencia */
    }
  }

  function startDonateTimer() {
    if (modalTimer) clearInterval(modalTimer);
    modalTimer = setInterval(() => {
      if (isPro()) return;
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      openModal();
    }, DONATE_EVERY_MS);
  }

  /* ---------------------------------------------------------------- */
  /* Metrónomo                                                        */
  /* ---------------------------------------------------------------- */
  function updateMetroBtn() {
    const btn = $('metroBtn');
    const half = $('metroHalf');
    if (btn) {
      btn.textContent = t('metro.' + state.metronome);
      btn.classList.toggle('is-active', state.metronome !== 'off');
    }
    if (half) {
      half.classList.toggle('is-active', state.metroHalf);
      half.setAttribute('aria-pressed', state.metroHalf ? 'true' : 'false');
    }
  }

  function tickMetro() {
    if (!metroTimer) return;
    const bpm = state.metroHalf ? A.Settings.bpm / 2 : A.Settings.bpm;
    const period = 60 / Math.max(20, bpm);
    const t = A.now();
    if (metroOrigin + metroIndex * period < t - 0.05) {
      metroIndex = Math.ceil((t - metroOrigin) / period);
    }
    const horizon = t + 0.2;
    let guard = 0;
    while (metroOrigin + metroIndex * period < horizon && guard++ < 64) {
      A.clickAt(metroOrigin + metroIndex * period);
      metroIndex++;
    }
  }

  function startMetro(origin) {
    stopMetro();
    if (state.metronome === 'off') return;
    A.ensure();
    metroOrigin = origin != null ? origin : A.now() + 0.1;
    metroIndex = 0;
    metroTimer = setInterval(tickMetro, 25);
    tickMetro();
  }

  function stopMetro() {
    if (metroTimer) { clearInterval(metroTimer); metroTimer = null; }
  }

  function cycleMetronome() {
    state.metronome = state.metronome === 'off' ? 'auto' : (state.metronome === 'auto' ? 'on' : 'off');
    updateMetroBtn();
    if (state.metronome === 'off') stopMetro();
    else if (state.metronome === 'on') startMetro();
    else if (state.seqPlaying) startMetro();
    else stopMetro();
  }

  function toggleMetroHalf() {
    state.metroHalf = !state.metroHalf;
    updateMetroBtn();
  }

  /* ---------------------------------------------------------------- */
  /* Exportar / importar secuencia                                    */
  /* ---------------------------------------------------------------- */
  function exportSequence() {
    if (!isPro()) { openModal(); return; }
    if (!state.sequence.length) { flash(t('seq.empty')); return; }

    const data = {
      app: 'Chord Assist',
      version: 1,
      exportedAt: new Date().toISOString(),
      bpm: A.Settings.bpm,
      tuning: state.guitarTuning.slice(),
      steps: state.sequence.map((s) => ({
        symbol: s.symbol,
        root: s.root,
        typeId: s.typeId,
        notes: s.notes.slice(),
        bars: s.bars || 1,
        beats: s.beats || 4,
        scaleId: s.scaleId || null,
        scaleRoot: s.scaleRoot != null ? s.scaleRoot : null,
        drums: s.drums ? {
          rows: s.drums.rows,
          length: s.drums.length,
          speed: s.drums.speed,
          notes: s.drums.notes
        } : null,
        section: s.section || null,
        bass: s.bass || null,
        scaleAuto: !!s.scaleAuto,
        arpAuto: !!s.arpAuto,
        arpKey: typeof s.arpKey === 'string' ? s.arpKey : null,
        triadAuto: !!s.triadAuto,
        seqarp: s.seqarp || null
      })),
      sections: state.sections.slice()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.seqName || 'Untitled') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(t('msg.exported'));
  }

  function importSequence(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.steps)) throw new Error('bad file');

        if (typeof data.bpm === 'number') setBpm(data.bpm);
        if (Array.isArray(data.tuning) && data.tuning.length >= MIN_STRINGS && data.tuning.length <= MAX_STRINGS) {
          applyTuning(data.tuning.slice());
        }

        state.sequence = data.steps.map((s) => {
          const chord = T.CHORDS[s.typeId] || null;
          const root = typeof s.root === 'number' ? mod12(s.root) : 0;
          const sc = scaleById(s.scaleId);
          return {
            notes: Array.isArray(s.notes) ? s.notes.slice() : [],
            symbol: s.symbol || (chord ? T.chordSymbol(root, chord) : '—'),
            name: chord ? T.esName(root) + ' ' + chord.es : '',
            root,
            typeId: chord ? chord.id : null,
            bars: BARS_CYCLE.indexOf(parseFloat(s.bars || s.reps)) !== -1 ? parseFloat(s.bars || s.reps) : 1,
            beats: BEATS_CYCLE.indexOf(s.beats) !== -1 ? s.beats : 4,
            scaleId: sc ? sc.id : null,
            scaleRoot: sc && typeof s.scaleRoot === 'number' ? mod12(s.scaleRoot) : (sc ? root : null),
            scaleName: sc ? scaleLabel(sc) : null,
            drums: s.drums ? cloneDrums(s.drums) : emptyDrums(),
            section: typeof s.section === 'string' ? s.section : null,
            bass: s.bass && typeof s.bass === 'object' ? Object.assign({}, s.bass) : null,
            scaleAuto: !!s.scaleAuto,
            arpAuto: !!s.arpAuto,
            arpKey: typeof s.arpKey === 'string' ? s.arpKey : null,
            triadAuto: !!s.triadAuto,
            seqarp: s.seqarp ? cloneSeqArp(s.seqarp) : null
          };
        });
        state.sections = Array.isArray(data.sections)
          ? data.sections.filter((n) => typeof n === 'string' && n)
          : [];
        state.seqName = (file.name || 'Untitled').replace(/\.json$/i, '');
        updateSeqFile();
        renderSteps();
        flash(t('msg.imported'));
      } catch (err) {
        flash(t('msg.importError'));
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------- */
  /* Selectores                                                       */
  /* ---------------------------------------------------------------- */
  function buildPickers() {
    const rootSel = $('rootSel');
    rootSel.textContent = '';
    for (let pc = 0; pc < 12; pc++) {
      const opt = document.createElement('option');
      opt.value = String(pc);
      opt.textContent = T.enName(pc);
      rootSel.appendChild(opt);
    }

    const typeSel = $('typeSel');
    typeSel.textContent = '';
    T.GROUPS.forEach((group) => {
      const og = document.createElement('optgroup');
      og.label = group.title;
      group.items.forEach((id) => {
        const c = T.CHORDS[id];
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = (lang() === 'en' ? c.label : c.es) + '  ·  ' + (c.symbol || 'maj');
        og.appendChild(opt);
      });
      typeSel.appendChild(og);
    });

    rootSel.value = '0';
    typeSel.value = 'maj';
  }

  function buildScaleSelects() {
    const rootSel = $('scaleRootSel');
    rootSel.textContent = '';
    for (let pc = 0; pc < 12; pc++) {
      const opt = document.createElement('option');
      opt.value = String(pc);
      opt.textContent = T.enName(pc);
      rootSel.appendChild(opt);
    }

    const scSel = $('scaleSel');
    scSel.textContent = '';
    const families = [];
    T.SCALES.forEach((sc) => {
      let f = families.filter((x) => x.name === sc.family)[0];
      if (!f) { f = { name: sc.family, items: [] }; families.push(f); }
      f.items.push(sc);
    });
    families.forEach((fam) => {
      const og = document.createElement('optgroup');
      og.label = fam.name;
      fam.items.forEach((sc) => {
        const opt = document.createElement('option');
        opt.value = sc.id;
        opt.textContent = scaleLabel(sc);
        og.appendChild(opt);
      });
      scSel.appendChild(og);
    });

    rootSel.value = '0';
    scSel.value = 'ionian';
  }

  /* ---------------------------------------------------------------- */
  /* Tempo                                                            */
  /* ---------------------------------------------------------------- */
  function setBpm(value) {
    const bpm = Math.max(40, Math.min(300, Math.round(Number(value)) || 96));
    A.configure({ bpm });
    const range = $('bpm');
    const num = $('bpmNum');
    if (range) range.value = String(bpm);
    if (num) num.value = String(bpm);
  }

  /* ---------------------------------------------------------------- */
  /* Idioma                                                           */
  /* ---------------------------------------------------------------- */
  function setLang(next) {
    I.setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* noop */ }
    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.lang === next);
    });
    I.apply();
    buildPickers();
    buildScaleSelects();
    render();
    updateLockUI();
    updateMidiPill();
    updateGuitarInfo();
    updateMetroBtn();
    updateEditUI();
    suggSig = '';
    renderSuggestions();
    const upBtn = document.querySelector('.card-tool.up');
    if (upBtn) upBtn.title = t('card.up');
    document.querySelectorAll('.card-tool.col').forEach((b) => {
      b.title = t('card.collapse');
    });
    refreshCardTitles();
    structSig = '';
    renderStructure();
    document.title = 'Chord Assist';
  }

  /* ---------------------------------------------------------------- */
  /* MIDI                                                             */
  /* ---------------------------------------------------------------- */
  function fillMidiOutputs(list) {
    const sel = $('midiOut');
    sel.innerHTML = '';
    if (!list || !list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '—';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    list.forEach((out) => {
      const opt = document.createElement('option');
      opt.value = out.id;
      opt.textContent = out.name || 'MIDI';
      sel.appendChild(opt);
    });
    sel.disabled = false;
    sel.value = list[0].id;
    MIDI.select(list[0].id);
  }

  function updateMidiPill() {
    const pill = $('midiPill');
    if (!pill) return;
    const on = MIDI.enabled && isPro();
    pill.dataset.on = on ? 'true' : 'false';
    pill.textContent = on ? 'MIDI · ' + (MIDI.outputName || 'on') : (isPro() ? t('midi.off') : t('midi.locked'));
  }

  /* ---------------------------------------------------------------- */
  /* Controles                                                        */
  /* ---------------------------------------------------------------- */
  function bindControls() {
    $('playBtn').addEventListener('click', togglePlay);
    $('addBtn').addEventListener('click', addCurrent);
    $('genSong').addEventListener('click', generateSong);
    $('clearBtn').addEventListener('click', clearNotes);

    $('flatBtn').addEventListener('click', () => {
      state.flat = !state.flat;
      $('flatBtn').classList.toggle('is-active', state.flat);
      render();
    });

    $('rootSel').addEventListener('change', applyPicker);
    $('typeSel').addEventListener('change', applyPicker);

    $('scaleRootSel').addEventListener('change', applyScaleFromBrowser);
    $('scaleSel').addEventListener('change', applyScaleFromBrowser);

    document.querySelectorAll('.mini-btn[data-search]').forEach((b) => {
      b.addEventListener('click', () => {
        state.searchMode = b.dataset.search;
        syncSearchButtons();
        render();
      });
    });

    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.addEventListener('click', () => setLang(b.dataset.lang));
    });

    $('chordLoop').addEventListener('click', () => {
      state.chordLoop = !state.chordLoop;
      $('chordLoop').classList.toggle('is-active', state.chordLoop);
      $('chordLoop').setAttribute('aria-pressed', state.chordLoop ? 'true' : 'false');
      if (state.chordPlaying) { stopPlay(); playCurrent(); }
    });

    $('strAdd').addEventListener('click', addString);
    $('strRemove').addEventListener('click', removeString);
    $('tuneDownAll').addEventListener('click', () => tuneAll(-1));
    $('tuneUpAll').addEventListener('click', () => tuneAll(1));
    $('tuneReset').addEventListener('click', resetTuning);

    $('scalePlay').addEventListener('click', playScale);

    $('scaleLoop').addEventListener('click', () => {
      state.scaleLoop = !state.scaleLoop;
      updateScaleControls();
      if (state.scalePlaying) { stopScale(); playScale(); }
    });

    $('scaleSpeed').addEventListener('click', () => {
      state.scaleSpeed = state.scaleSpeed === 1 ? 2 : 1;
      updateScaleControls();
      if (state.scalePlaying) { stopScale(); playScale(); }
    });

    $('scaleOctDown').addEventListener('click', () => setScaleOctave(-1));
    $('scaleOctUp').addEventListener('click', () => setScaleOctave(1));

    $('scaleWave').addEventListener('change', (e) => A.setLayerOptions('scale', { waveform: e.target.value }));
    $('scaleVol').addEventListener('input', (e) => A.setLayerOptions('scale', { gain: parseFloat(e.target.value) }));
    $('seqPlay').addEventListener('click', playSequence);

    $('seqAdd').addEventListener('click', addCurrent);
    $('structPlay').addEventListener('click', playSequence);
    $('structAdd').addEventListener('click', addSection);
    $('seqClear').addEventListener('click', clearSequence);
    $('seqLoop').addEventListener('click', () => {
      state.seqLoop = !state.seqLoop;
      $('seqLoop').classList.toggle('is-active', state.seqLoop);
      $('seqLoop').setAttribute('aria-pressed', state.seqLoop ? 'true' : 'false');
    });

    $('drumLen').addEventListener('change', (e) => {
      state.drums.length = parseInt(e.target.value, 10) || 16;
      syncDrums();
    });
    $('drumSpeed').addEventListener('click', () => {
      state.drums.speed = state.drums.speed === 1 ? 2 : 1;
      updateDrumControls();
      if (state.drumAudition) { toggleDrumAudition(); toggleDrumAudition(); }
    });
    $('drumPlay').addEventListener('click', toggleDrumAudition);
    $('drumClear').addEventListener('click', () => {
      state.drums.rows.forEach((row) => row.fill(0));
      syncDrums();
    });

    $('drumVol').addEventListener('input', (e) => {
      state.drumVolume = parseFloat(e.target.value);
      A.setDrumVolume(state.drumVolume);
    });

    $('drumMute').addEventListener('click', () => {
      state.drumMuted = !state.drumMuted;
      $('drumMute').classList.toggle('is-active', state.drumMuted);
      $('drumMute').setAttribute('aria-pressed', state.drumMuted ? 'true' : 'false');
      if (state.drumMuted && state.drumAudition) toggleDrumAudition();
    });

    $('metroVol').addEventListener('input', (e) => {
      A.configure({ clickVolume: parseFloat(e.target.value) * 0.35 });
    });

    $('bassOn').addEventListener('change', (e) => {
      state.bass.enabled = e.target.checked;
      if (!state.bass.enabled) stopBass();
    });
    $('bassWave').addEventListener('change', (e) => {
      state.bass.waveform = e.target.value;
      syncBassOptions();
    });
    $('bassVol').addEventListener('input', (e) => {
      state.bass.volume = parseFloat(e.target.value);
      syncBassOptions();
    });
    $('bassFigure').addEventListener('change', (e) => {
      state.bass.figure = parseFloat(e.target.value) || 1;
    });
    $('bassLength').addEventListener('change', (e) => {
      state.bass.length = parseFloat(e.target.value) || 1;
    });

    $('cancelEdit').addEventListener('click', cancelEdit);

    $('scaleClearProbe').addEventListener('click', () => {
      state.scaleProbe = new Set();
      render();
    });

    $('chordVol').addEventListener('input', (e) => {
      state.chordVolume = parseFloat(e.target.value);
      A.setLayerOptions('chord', { gain: state.chordVolume });
    });

    $('scalePattern').addEventListener('change', (e) => {
      state.scalePattern = e.target.value;
      if (state.scalePlaying) { stopScale(); playScale(); }
    });

    $('arpPlay').addEventListener('click', playArp);
    $('seqarpPlay').addEventListener('click', playSeqArp);
    $('seqarpClear').addEventListener('click', () => {
      state.seqArp.cells = {};
      seqArpSig = '';
      maybeRenderSeqArp();
      if (state.seqArpPlaying) stopSeqArp();
    });
    $('seqarpVol').addEventListener('input', (e) => {
      state.seqArp.volume = parseFloat(e.target.value);
      A.setLayerOptions('seqarp', { gain: state.seqArp.volume });
    });

    $('seqarpAuto').addEventListener('click', () => {
      state.seqArp.auto = !state.seqArp.auto;
      updateSeqArpBtn();
    });

    $('seqarpSpeed').addEventListener('click', () => {
      const idx = [1, 2, 4].indexOf(state.seqArp.speed);
      state.seqArp.speed = [1, 2, 4][(idx + 1) % 3];
      updateSeqArpBtn();
      if (state.seqArpPlaying) { stopSeqArp(); playSeqArp(); }
    });
    $('seqarpCols').addEventListener('change', (e) => {
      state.seqArp.cols = parseInt(e.target.value, 10) || 16;
      seqArpSig = '';
      maybeRenderSeqArp();
      if (state.seqArpPlaying) { stopSeqArp(); playSeqArp(); }
    });
    $('selClear').addEventListener('click', () => {
      state.arp = null;
      state.triad = null;
      state.scaleManual = false;
      render();
      updateTriadBtn();
    });

    $('triadPlay').addEventListener('click', playTriad);
    $('triadSpeed').addEventListener('click', () => {
      const idx = [1, 2, 4].indexOf(state.triadSpeed);
      state.triadSpeed = [1, 2, 4][(idx + 1) % 3];
      updateTriadBtn();
      if (state.triadPlaying) { stopTriad(); playTriad(); }
    });
    $('triadLoop').addEventListener('click', () => {
      state.triadLoop = !state.triadLoop;
      updateTriadBtn();
    });
    $('triadAuto').addEventListener('click', () => {
      state.triadAuto = !state.triadAuto;
      updateTriadBtn();
    });
    $('triadOctDown').addEventListener('click', () => {
      state.triadOctave = Math.max(-1, Math.min(1, (state.triadOctave || 0) - 1));
      updateTriadBtn();
      if (state.triadPlaying) { stopTriad(); playTriad(); }
    });
    $('triadOctUp').addEventListener('click', () => {
      state.triadOctave = Math.max(-1, Math.min(1, (state.triadOctave || 0) + 1));
      updateTriadBtn();
      if (state.triadPlaying) { stopTriad(); playTriad(); }
    });

    $('arpLoop').addEventListener('click', () => {
      state.arpLoop = !state.arpLoop;
      updateArpBtn();
    });

    $('arpAuto').addEventListener('click', () => {
      state.arpAuto = !state.arpAuto;
      updateArpBtn();
    });

    $('arpOctDown').addEventListener('click', () => {
      state.arpOctave = Math.max(-1, Math.min(1, (state.arpOctave || 0) - 1));
      updateArpBtn();
      if (state.arpPlaying) { stopArp(); playArp(); }
    });

    $('arpOctUp').addEventListener('click', () => {
      state.arpOctave = Math.max(-1, Math.min(1, (state.arpOctave || 0) + 1));
      updateArpBtn();
      if (state.arpPlaying) { stopArp(); playArp(); }
    });

    $('arpSpeed').addEventListener('click', () => {
      const idx = [1, 2, 4].indexOf(state.arpSpeed);
      state.arpSpeed = [1, 2, 4][(idx + 1) % 3];
      updateArpBtn();
      if (state.arpPlaying) { stopArp(); playArp(); }
    });

    $('scaleSeed').addEventListener('click', () => {
      state.scaleSeed = Math.floor(Math.random() * 1000000);
      if (state.scalePlaying) { stopScale(); playScale(); }
    });

    $('bassOctDown').addEventListener('click', () => {
      state.bass.octave = Math.max(-1, Math.min(1, (state.bass.octave || 0) - 1));
      $('bassOctDown').classList.toggle('is-active', state.bass.octave < 0);
      $('bassOctUp').classList.toggle('is-active', state.bass.octave > 0);
    });
    $('bassOctUp').addEventListener('click', () => {
      state.bass.octave = Math.max(-1, Math.min(1, (state.bass.octave || 0) + 1));
      $('bassOctDown').classList.toggle('is-active', state.bass.octave < 0);
      $('bassOctUp').classList.toggle('is-active', state.bass.octave > 0);
    });

    $('suggAuto').addEventListener('click', () => {
      if (state.suggAuto) {
        const key = suggestionKey();
        if (key) { state.suggRoot = key.root; state.suggScaleId = key.scale.id; }
        state.suggAuto = false;
      } else {
        state.suggAuto = true;
      }
      suggSig = '';
      render();
    });
    $('suggRoot').addEventListener('change', (e) => {
      state.suggAuto = false;
      state.suggRoot = parseInt(e.target.value, 10) || 0;
      suggSig = '';
      render();
    });
    $('suggScale').addEventListener('change', (e) => {
      state.suggAuto = false;
      state.suggScaleId = e.target.value;
      suggSig = '';
      render();
    });

    $('scaleAuto').addEventListener('click', () => {
      state.scaleAutoplay = !state.scaleAutoplay;
      updateScaleControls();
    });

    $('metroBtn').addEventListener('click', cycleMetronome);
    $('metroHalf').addEventListener('click', toggleMetroHalf);

    $('exportBtn').addEventListener('click', exportSequence);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importSequence(file);
      e.target.value = '';
    });

    $('bpm').addEventListener('input', (e) => setBpm(e.target.value));
    $('bpmNum').addEventListener('change', (e) => setBpm(e.target.value));

    $('waveform').addEventListener('change', (e) => A.configure({ waveform: e.target.value }));
    $('volume').addEventListener('input', (e) => A.configure({ volume: parseFloat(e.target.value) }));

    $('attack').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      A.configure({ attack: v });
      $('attackOut').textContent = Math.round(v * 1000) + ' ms';
    });
    $('decay').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      A.configure({ decay: v });
      $('decayOut').textContent = Math.round(v * 1000) + ' ms';
    });
    $('sustain').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      A.configure({ sustain: v });
      $('sustainOut').textContent = Math.round(v * 100) + '%';
    });
    $('release').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      A.configure({ release: v });
      $('releaseOut').textContent = Math.round(v * 1000) + ' ms';
    });
    $('strum').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      A.configure({ strum: v });
      $('strumOut').textContent = Math.round(v * 1000) + ' ms';
    });

    /* ---------- Modal / desbloqueo ---------- */
    $('donateBtn').addEventListener('click', openModal);
    $('modalClose').addEventListener('click', closeModal);
    $('modalLater').addEventListener('click', closeModal);
    document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
    $('unlockForm').addEventListener('submit', (e) => {
      e.preventDefault();
      tryUnlock($('unlockInput').value);
    });

    const buy = $('buyLink');
    if (buy) {
      if (PAYPAL_LINK) {
        buy.href = PAYPAL_LINK;
        buy.hidden = false;
      } else {
        buy.hidden = true;
      }
    }

    /* ---------- MIDI ---------- */
    $('midiEnable').addEventListener('click', async () => {
      if (!isPro()) { openModal(); return; }
      const status = $('midiStatus');
      try {
        const list = await MIDI.enable();
        fillMidiOutputs(list);
        status.textContent = list.length ? t('midi.statusActive', { n: list.length }) : t('midi.statusNoDevices');
        updateMidiPill();
      } catch (err) {
        status.textContent = t('midi.statusError', { err: err && err.message ? err.message : err });
      }
    });

    $('midiOut').addEventListener('change', (e) => {
      MIDI.select(e.target.value);
      updateMidiPill();
    });

    MIDI.onStateChange = (list) => {
      fillMidiOutputs(list);
      updateMidiPill();
    };

    /* ---------- Teclado ---------- */
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;

      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); playSequence(); }
      else if (e.key === 'Enter') { e.preventDefault(); addCurrent(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); transpose(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); transpose(-1); }
      else if (e.key === 'Escape') {
        if (state.editingIndex != null) cancelEdit();
        stopAllSound();
        closeModal();
      }
    });
  }

  function syncSearchButtons() {
    document.querySelectorAll('.mini-btn[data-search]').forEach((x) => {
      x.classList.toggle('is-active', x.dataset.search === state.searchMode);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Arranque                                                         */
  /* ---------------------------------------------------------------- */
  function loadFromHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);

    if (params.has('lang')) {
      const l = params.get('lang');
      if (l === 'en' || l === 'es') I.setLang(l);
    }

    if (params.has('tune')) {
      const arr = params.get('tune').split(',').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
      if (arr.length >= MIN_STRINGS && arr.length <= MAX_STRINGS) state.guitarTuning = arr.slice();
    }

    if (params.has('modal')) setTimeout(openModal, 400);

    if (params.has('search') && params.get('search') === 'arpeggios') {
      state.searchMode = 'arpeggios';
      syncSearchButtons();
    } else if (params.has('search') && params.get('search') === 'scales') {
      state.searchMode = 'scales';
      syncSearchButtons();
    }

    if (params.has('sections')) {
      state.sections = params.get('sections').split(',').filter((n) => n);
    }

    if (params.has('seq')) {
      params.get('seq').split('|').forEach((part) => {
        const bits = part.split(':');
        const root = parseInt(bits[0], 10);
        const chord = T.CHORDS[bits[1]];
        if (!chord || Number.isNaN(root)) return;
        const rawBars = parseFloat(bits[2]);
        const bars = BARS_CYCLE.indexOf(rawBars) !== -1 ? rawBars : 1;
        const sc = scaleById(bits[3]);
        const fig = parseFloat(bits[4]);
        const beats = BEATS_CYCLE.indexOf(fig) !== -1 ? fig : 4;
        state.sequence.push({
          notes: T.voicingOf(chord).map((iv) => PICKER_BASE + mod12(root) + iv),
          symbol: T.chordSymbol(mod12(root), chord),
          name: T.esName(mod12(root)) + ' ' + chord.es,
          root: mod12(root),
          typeId: chord.id,
          bars: bars,
          beats: beats,
          scaleId: sc ? sc.id : null,
          scaleRoot: sc ? mod12(root) : null,
          scaleName: sc ? scaleLabel(sc) : null,
          section: bits[5] || null
        });
      });
      renderSteps();
    }

    if (params.has('gen')) generateSong(true);


    if (params.has('type') && T.CHORDS[params.get('type')]) {
      const root = parseInt(params.get('root'), 10);
      $('rootSel').value = String(Number.isNaN(root) ? 0 : mod12(root));
      $('typeSel').value = params.get('type');
      applyPicker();
      return true;
    }

    if (params.has('notes')) {
      const notes = params.get('notes').split(',')
        .map((n) => parseInt(n, 10))
        .filter((n) => !Number.isNaN(n) && n > 0 && n < 128);
      if (notes.length) {
        state.notes = new Set(notes);
        state.explicitType = null;
        render();
        return true;
      }
    }
    return false;
  }

  function init() {
    /* idioma guardado (o el de la URL) */
    let savedLang = 'es';
    try { savedLang = localStorage.getItem(LANG_KEY) || 'es'; } catch (e) { /* noop */ }
    const hashLang = (location.hash.match(/lang=(en|es)/) || [])[1];
    if (hashLang) savedLang = hashLang;
    I.setLang(savedLang);

    buildPickers();
    buildScaleSelects();
    populateSuggSelects();
    populateChannels();
    bindControls();
    loadTuning();
    updateLockUI();
    updateMidiPill();

    setBpm(A.Settings.bpm);

    loadFromHash();

    if (!state.notes.size) {
      state.notes = new Set([48, 52, 55]);
      state.root = 0;
      state.explicitType = 'maj';
    }

    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.lang === I.getLang());
    });
    I.apply();
    syncSearchButtons();
    updateMetroBtn();
    updateScaleControls();
    renderDrums();
    A.setDrumVolume(state.drumVolume);
    A.configure({ clickVolume: 0.45 * 0.35 });
    A.setLayerOptions('chord', { gain: state.chordVolume });
    updateArpBtn();
    updateTriadBtn();
    syncBassOptions();
    render();
    updateEditUI();
    updateSeqFile();
    setTimeout(() => { revalidateLicense(); }, 1500);
    initCardLayout();
    updateGuitarInfo();
    startDonateTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
