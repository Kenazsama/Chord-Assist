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
  const PRO_CODE = 'ChordA';
  /* Cada 5 minutos se recuerda la donación con un modal dentro de la app.
     Si prefieres una ventana aparte, cambia openModal() por:
       window.open('donate.html', 'chordAssistDonate', 'width=560,height=760')
     Ojo: los navegadores bloquean las ventanas que no nacen de un clic. */
  const DONATE_EVERY_MS = 5 * 60 * 1000;

  const PIANO_START = 36;   // C2
  const PIANO_OCTAVES = 3;  // hasta B4
  const PICKER_BASE = 48;   // C3

  const BEATS_CYCLE = [4, 2, 1, 0.5];
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

  const state = {
    notes: new Set(),
    root: 0,
    explicitType: null,
    flat: false,
    playing: false,
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
    guitarTuning: STANDARD_TUNING.slice()
  };

  let seqTimer = null;
  let chordMidiTimer = null;
  let metroTimer = null;
  let metroNext = 0;
  let hintTimer = null;
  let modalTimer = null;

  /* ---------------------------------------------------------------- */
  /* Derivados                                                         */
  /* ---------------------------------------------------------------- */
  const notesSorted = () => Array.from(state.notes).sort((a, b) => a - b);
  const pcsOf = () => T.sortPcs(notesSorted().map((m) => m % 12));
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
    if (state.seqPlaying) stopSequence();
    if (state.scalePlaying) stopScale();
    state.scaleManual = false;

    if (state.notes.has(midi)) {
      state.notes.delete(midi);
    } else {
      state.notes.add(midi);
      A.preview(midi);
      if (isPro() && MIDI.enabled) MIDI.sendNote(midi, 350);
    }
    state.explicitType = null;
    render();
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
    if (state.playing && !state.seqPlaying) A.setNotes(notesSorted());
  }

  function clearNotes() {
    if (state.seqPlaying) stopSequence();
    if (state.scalePlaying) stopScale();
    state.scaleManual = false;
    state.notes.clear();
    state.explicitType = null;
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
  function playCurrent() {
    const notes = notesSorted();
    if (!notes.length) {
      flash(t('msg.firstNote'));
      return;
    }
    if (state.seqPlaying) stopSequence();
    state.playing = true;
    A.start(notes, { mode: 'block', repeat: state.chordLoop, bpm: A.Settings.bpm });
    updatePlayBtn();
    startChordMidiLoop();
  }

  function startChordMidiLoop() {
    clearChordMidiLoop();
    if (!isPro() || !MIDI.enabled) return;
    const notes = notesSorted();
    if (!notes.length) return;
    const step = (60000 / A.Settings.bpm) * 2;
    MIDI.sendNotes(notes, step * 0.95);
    if (state.chordLoop) {
      chordMidiTimer = setInterval(() => {
        if (!state.playing) { clearChordMidiLoop(); return; }
        MIDI.sendNotes(notesSorted(), step * 0.95);
      }, step);
    }
  }

  function clearChordMidiLoop() {
    if (chordMidiTimer) { clearInterval(chordMidiTimer); chordMidiTimer = null; }
  }

  function stopPlay() {
    A.stop();
    clearChordMidiLoop();
    state.playing = false;
    updatePlayBtn();
    if (isPro()) MIDI.allNotesOff();
  }

  function togglePlay() {
    if (state.seqPlaying) { stopSequence(); return; }
    if (state.scalePlaying) { stopScale(); return; }
    if (state.playing) stopPlay(); else playCurrent();
  }

  A.onEnd = function () {
    if (state.seqPlaying) return;
    state.playing = false;
    state.scalePlaying = false;
    updatePlayBtn();
    updateScaleBtn();
  };

  /* ---------------------------------------------------------------- */
  /* Secuencia                                                        */
  /* ---------------------------------------------------------------- */
  function addCurrent() {
    const info = currentInfo();
    if (!info || !info.notes.length) {
      flash(t('msg.buildChord'));
      return;
    }
    const sc = selectedScale();
    state.sequence.push({
      notes: info.notes.slice(),
      symbol: info.symbol || info.pcs.map(localNote).join(' '),
      name: info.name,
      root: info.root,
      typeId: state.explicitType,
      bars: 1,
      beats: 4,
      scaleId: sc ? sc.id : null,
      scaleRoot: sc ? state.scaleRoot : null,
      scaleName: sc ? scaleLabel(sc) : null
    });
    renderSteps();
    flash(t('msg.added', { sym: info.symbol || '' }));
    playCurrent();
  }

  function cycleBars(i) {
    const step = state.sequence[i];
    if (!step) return;
    const cur = step.bars || 1;
    step.bars = cur === 1 ? 2 : (cur === 2 ? 4 : 1);
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
      scaleName: step.scaleName
    });
    renderSteps();
    flash(t('msg.copied', { sym: step.symbol }));
  }

  function removeStep(i) {
    state.sequence.splice(i, 1);
    if (state.activeStep >= state.sequence.length) state.activeStep = -1;
    renderSteps();
  }

  function clearSequence() {
    stopSequence();
    state.sequence = [];
    state.activeStep = -1;
    renderSteps();
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
    render();
    if (play) playCurrent();
  }

  function playSequence() {
    if (!state.sequence.length) return;
    if (state.seqPlaying) { stopSequence(); return; }
    state.seqPlaying = true;
    state.seqIndex = 0;
    updateSeqPlay();
    if (state.metronome === 'auto') startMetro();
    stepSequence();
  }

  function stepSequence() {
    if (!state.seqPlaying) return;
    if (state.seqIndex >= state.sequence.length) {
      if (state.seqLoop) state.seqIndex = 0;
      else { stopSequence(); return; }
    }

    const i = state.seqIndex;
    const step = state.sequence[i];
    loadStep(i, false);
    state.playing = true;
    updatePlayBtn();

    const beatMs = 60000 / A.Settings.bpm;
    const bars = Math.max(1, step.bars || 1);
    const figure = step.beats || 4;          // 4 = redonda, 2 = blanca, 1 = negra, 0.5 = corchea
    const stepMs = bars * 4 * beatMs;        // el paso ocupa "bars" compases
    const intervalMs = Math.max(60, figure * beatMs);
    const strikes = Math.max(1, Math.round(stepMs / intervalMs));
    const notes = notesSorted();

    A.pattern(notes, { strikes: strikes, intervalMs: intervalMs, durMs: intervalMs * 0.92 });
    if (isPro() && MIDI.enabled) MIDI.sendPattern(notes, strikes, intervalMs, intervalMs * 0.9);

    state.seqIndex++;
    seqTimer = setTimeout(stepSequence, stepMs);
  }

  function stopSequence() {
    state.seqPlaying = false;
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    state.activeStep = -1;
    state.playing = false;
    if (state.metronome === 'auto') stopMetro();
    A.stop();
    clearChordMidiLoop();
    if (isPro()) MIDI.allNotesOff();
    updatePlayBtn();
    updateSeqPlay();
    renderSteps();
  }

  /* ---------------------------------------------------------------- */
  /* Escalas                                                           */
  /* ---------------------------------------------------------------- */
  function scaleById(id) {
    if (!id) return null;
    for (let i = 0; i < T.SCALES.length; i++) if (T.SCALES[i].id === id) return T.SCALES[i];
    return null;
  }

  function buildScaleSuggestions() {
    if (state.searchMode === 'scales') {
      const pcs = pcsOf();
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

  function updateScaleBtn() {
    const b = $('scalePlay');
    if (!b) return;
    b.textContent = state.scalePlaying ? t('scale.stop') : t('scale.play');
    b.classList.toggle('is-active', state.scalePlaying);
    b.disabled = !selectedScale();
  }

  function playScale() {
    if (state.scalePlaying) { stopScale(); return; }
    const sc = selectedScale();
    if (!sc) return;
    if (state.seqPlaying) stopSequence();
    if (state.playing) stopPlay();

    const rootMidi = PICKER_BASE + state.scaleRoot;
    const up = sc.intervals.map((iv) => rootMidi + iv);
    up.push(rootMidi + 12);
    const seq = up.concat(up.slice(0, -1).reverse());
    const stepMs = (60000 / A.Settings.bpm) / 2;

    state.scalePlaying = true;
    state.playing = true;
    A.sequence(seq, { bpm: A.Settings.bpm });
    updatePlayBtn();
    if (isPro() && MIDI.enabled) MIDI.sendSequence(seq, stepMs, stepMs * 0.9);
    updateScaleBtn();
  }

  function stopScale() {
    A.stop();
    clearChordMidiLoop();
    if (isPro()) MIDI.allNotesOff();
    state.scalePlaying = false;
    state.playing = false;
    updatePlayBtn();
    updateScaleBtn();
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */
  function render() {
    state.info = currentInfo();
    updateScales();
    renderPiano();
    renderGuitar();
    renderChord();
    renderScales();
    renderSteps();
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
      const isRoot = on && rootPc != null && pc === rootPc;

      const rect = svgEl('rect', {
        x: round(x), y: 4, width: round(ww - 1), height: keyH,
        rx: 3,
        class: 'pk-white' + (on ? ' is-on' : ''),
        'data-midi': m,
        'aria-label': nameOf(pc) + octaveOf(m)
      });
      rect.addEventListener('click', () => toggleNote(m));
      svg.appendChild(rect);

      if (!on && state.scalePcs.has(pc)) {
        svg.appendChild(svgEl('circle', { cx: round(x + ww / 2), cy: 16, r: 2.8, class: 'pk-scale' }));
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
        const on = state.notes.has(midi);
        const x = f === 0 ? 74 : left + fw * (f - 0.5);

        if (!on && !(hasChord && pcsSet.has(pc))) {
          if (state.scalePcs.has(pc)) {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 4, class: 'gt-scale' }));
          } else {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 2.4, class: 'gt-spot' }));
          }
        } else if (!on) {
          if (ghostDegrees) {
            const g = svgEl('g', { class: 'gt-dot is-ghost' });
            g.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 8.5, class: 'gt-dot-bg' }));
            const deg = svgEl('text', { x: round(x), y: round(y + 3), class: 'gt-degree', 'text-anchor': 'middle' });
            deg.textContent = T.degreeOf(chordObj, mod12(pc - root));
            g.appendChild(deg);
            svg.appendChild(g);
          } else {
            svg.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 4.5, class: 'gt-ghostdot' }));
          }
        } else {
          const isRoot = hasChord && pc === root;
          const isBass = bass != null && pc === bass && pc !== root;
          let cls = 'gt-dot';
          if (isBass) cls += ' is-bass';
          else if (isRoot) cls += ' is-root';

          const g = svgEl('g', { class: cls });
          g.appendChild(svgEl('circle', { cx: round(x), cy: y, r: 10, class: 'gt-dot-bg' }));
          const deg = svgEl('text', { x: round(x), y: round(y + 3.2), class: 'gt-degree', 'text-anchor': 'middle' });
          deg.textContent = hasChord ? T.degreeOf(chordObj, mod12(pc - root)) : '';
          g.appendChild(deg);
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
        + (pc === info.bass && info.bass !== info.root ? ' is-bass' : '');
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
      return;
    }

    if (playBtn) playBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    state.sequence.forEach((step, i) => {
      const row = document.createElement('div');
      row.className = 'step' + (i === state.activeStep ? ' is-active' : '');
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
      bars.className = 'step-reps' + ((step.bars || 1) > 1 ? ' is-on' : '');
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

      tools.appendChild(mk('↑', t('seq.moveBack'), () => moveStep(i, -1)));
      tools.appendChild(mk('↓', t('seq.moveFwd'), () => moveStep(i, 1)));
      tools.appendChild(mk('⧉', t('seq.copy'), () => copyStep(i)));
      tools.appendChild(mk('×', t('seq.delete'), () => removeStep(i), 'danger'));

      row.appendChild(num);
      row.appendChild(main);
      row.appendChild(tools);

      row.addEventListener('click', () => {
        if (state.seqPlaying) stopSequence();
        loadStep(i, true);
      });
      row.addEventListener('keydown', (e) => {
        if (e.target !== row) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); row.click(); }
      });

      list.appendChild(row);
    });

    updateSeqPlay();
  }

  /* ---------------------------------------------------------------- */
  /* Botones y estado                                                 */
  /* ---------------------------------------------------------------- */
  function updatePlayBtn() {
    const icon = $('playIcon');
    const label = $('playLabel');
    const btn = $('playBtn');
    if (!btn) return;
    btn.classList.toggle('is-playing', state.playing);
    icon.textContent = state.playing ? '■' : '▶';
    label.textContent = state.playing ? t('chord.stop') : t('chord.play');
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
    try { return localStorage.getItem(PRO_KEY) === '1'; } catch (e) { return false; }
  }

  function setPro() {
    try { localStorage.setItem(PRO_KEY, '1'); } catch (e) { /* noop */ }
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

  function tryUnlock(code) {
    const msg = $('unlockMsg');
    if (String(code).trim().toLowerCase() === PRO_CODE.toLowerCase()) {
      setPro();
      if (msg) {
        msg.textContent = t('modal.unlockOk');
        msg.className = 'unlock-msg is-ok';
      }
      setTimeout(closeModal, 1200);
      return true;
    }
    if (msg) {
      msg.textContent = t('modal.unlockBad');
      msg.className = 'unlock-msg is-bad';
    }
    return false;
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
    if (metroNext < A.now()) metroNext = A.now() + 0.05;
    const bpm = state.metroHalf ? A.Settings.bpm / 2 : A.Settings.bpm;
    const period = 60 / Math.max(20, bpm);
    const horizon = A.now() + 0.2;
    let guard = 0;
    while (metroNext < horizon && guard++ < 64) {
      A.clickAt(metroNext);
      metroNext += period;
    }
  }

  function startMetro() {
    stopMetro();
    if (state.metronome === 'off') return;
    A.ensure();
    metroNext = A.now() + 0.12;
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
        scaleRoot: s.scaleRoot != null ? s.scaleRoot : null
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chord-assist-secuencia.json';
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
            bars: Math.max(1, Math.min(4, s.bars || s.reps || 1)),
            beats: BEATS_CYCLE.indexOf(s.beats) !== -1 ? s.beats : 4,
            scaleId: sc ? sc.id : null,
            scaleRoot: sc && typeof s.scaleRoot === 'number' ? mod12(s.scaleRoot) : (sc ? root : null),
            scaleName: sc ? scaleLabel(sc) : null
          };
        });
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
      if (state.playing && !state.seqPlaying) { stopPlay(); playCurrent(); }
    });

    $('strAdd').addEventListener('click', addString);
    $('strRemove').addEventListener('click', removeString);
    $('tuneDownAll').addEventListener('click', () => tuneAll(-1));
    $('tuneUpAll').addEventListener('click', () => tuneAll(1));
    $('tuneReset').addEventListener('click', resetTuning);

    $('scalePlay').addEventListener('click', playScale);
    $('seqPlay').addEventListener('click', playSequence);
    $('seqClear').addEventListener('click', clearSequence);
    $('seqLoop').addEventListener('click', () => {
      state.seqLoop = !state.seqLoop;
      $('seqLoop').classList.toggle('is-active', state.seqLoop);
      $('seqLoop').setAttribute('aria-pressed', state.seqLoop ? 'true' : 'false');
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

    $('midiChannel').addEventListener('change', (e) => {
      MIDI.setChannel(parseInt(e.target.value, 10) || 1);
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
      else if (e.key === 'Enter') { e.preventDefault(); addCurrent(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); transpose(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); transpose(-1); }
      else if (e.key === 'Escape') { clearNotes(); closeModal(); }
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

    if (params.has('search') && params.get('search') === 'scales') {
      state.searchMode = 'scales';
    }

    if (params.has('seq')) {
      params.get('seq').split('|').forEach((part) => {
        const bits = part.split(':');
        const root = parseInt(bits[0], 10);
        const chord = T.CHORDS[bits[1]];
        if (!chord || Number.isNaN(root)) return;
        const bars = Math.max(1, Math.min(4, parseInt(bits[2], 10) || 1));
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
          scaleName: sc ? scaleLabel(sc) : null
        });
      });
      renderSteps();
    }

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
    render();
    updateGuitarInfo();
    startDonateTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
