/* =====================================================================
   audio.js — Motor de audio con Web Audio API.

   Tres capas independientes que pueden sonar al mismo tiempo:
     chord  → el acorde actual (con loop)
     seq    → la secuencia (patrón de golpes)
     scale  → la escala (melodía con loop)

   Cada capa tiene sus propias voces, su propio temporizador y, si se
   quiere, su propio timbre y volumen.
   ===================================================================== */
(function (global) {
  'use strict';

  const Settings = {
    waveform: 'triangle', // sine | triangle | sawtooth | square
    volume: 0.75,
    attack: 0.012,
    decay: 0.22,
    sustain: 0.65,
    release: 0.42,
    mode: 'block',
    bpm: 96,
    strum: 0.025,
    repeat: false,
    clickVolume: 0.16
  };

  let ctx = null;
  let master = null;
  let comp = null;
  let drumBus = null;

  const layerCfg = {
    chord: { waveform: null, gain: 1 },
    seq: { waveform: null, gain: 1 },
    scale: { waveform: 'sine', gain: 0.65 },
    arp: { waveform: 'sine', gain: 0.65 },
    seqarp: { waveform: 'sine', gain: 0.8 },
    triad: { waveform: 'sine', gain: 0.65 },
    bass: { waveform: 'triangle', gain: 0.9 }
  };

  const L = {
    chord: { voices: new Set(), end: null, loop: null, loopState: null, active: false },
    seq: { voices: new Set(), end: null, pat: null, active: false },
    scale: { voices: new Set(), end: null, mel: null, active: false },
    arp: { voices: new Set(), end: null, mel: null, active: false },
    seqarp: { voices: new Set(), end: null, pat: null, active: false },
    triad: { voices: new Set(), end: null, mel: null, active: false },
    bass: { voices: new Set(), end: null, pat: null, active: false }
  };

  let currentNotes = [];
  let drum = null;
  let stepsSeq = null;
  let onStepsTick = null;
  let noiseBuf = null;
  let onDrumHit = null;
  let activeMode = 'block';
  let activeBpm = 96;
  let activeRepeat = false;
  let onEnd = null;

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const sortedNotes = (notes) => notes.slice().sort((a, b) => a - b);

  /* ---------- Contexto ---------- */
  function ensure() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });

      master = ctx.createGain();
      master.gain.value = Math.pow(Settings.volume, 1.4) * 0.9;

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(1.7, 2.6);

      const dryGain = ctx.createGain();
      dryGain.gain.value = 1;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.16;

      drumBus = ctx.createGain();
      drumBus.gain.value = 0.9;
      drumBus.connect(master);

      master.connect(dryGain);
      dryGain.connect(comp);
      master.connect(conv);
      conv.connect(wetGain);
      wetGain.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* ---------- Una voz ---------- */
  function spawn(midi, when, duration, velocity, layer) {
    const name = layer || 'chord';
    const cfg = layerCfg[name] || {};
    const t0 = Math.max(when, ctx.currentTime + 0.001);
    const freq = midiToFreq(midi);
    const vel = velocity == null ? 1 : velocity;
    const layerGain = cfg.gain == null ? 1 : cfg.gain;

    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(11000, 1400 + freq * 2.4), t0);
    lp.Q.value = 0.7;

    const osc = ctx.createOscillator();
    osc.type = cfg.waveform || Settings.waveform;
    osc.frequency.setValueAtTime(freq, t0);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 6, t0);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(freq * 2.002, t0);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.10;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq / 2, t0);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.14;

    osc.connect(out);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(out);
    sub.connect(subGain);
    subGain.connect(out);
    out.connect(lp);
    lp.connect(master);

    const a = Math.max(0.003, Settings.attack);
    const d = Math.max(0.01, Settings.decay);
    const s = Math.max(0.0001, Math.min(1, Settings.sustain));
    const r = Math.max(0.03, Settings.release);
    const peak = 0.19 * vel * layerGain;

    const holdUntil = t0 + Math.max(duration, a + d + 0.02);
    const releaseAt = Math.max(holdUntil, t0 + a + d + 0.01);
    const stopAt = releaseAt + r + 0.06;

    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    out.gain.exponentialRampToValueAtTime(Math.max(peak * s, 0.0002), t0 + a + d);
    out.gain.setValueAtTime(Math.max(peak * s, 0.0002), releaseAt);
    out.gain.exponentialRampToValueAtTime(0.0001, releaseAt + r);

    osc.start(t0);
    shimmer.start(t0);
    sub.start(t0);
    osc.stop(stopAt);
    shimmer.stop(stopAt);
    sub.stop(stopAt);

    const bucket = L[name] ? L[name].voices : L.chord.voices;
    const voice = {
      layer: name,
      cancel() {
        const now = ctx.currentTime;
        try {
          if (out.gain.cancelAndHoldAtTime) out.gain.cancelAndHoldAtTime(now);
          else out.gain.cancelScheduledValues(now);
        } catch (e) { /* noop */ }
        try {
          out.gain.setTargetAtTime(0.0001, now, 0.02);
        } catch (e) { /* noop */ }
        [osc, shimmer, sub].forEach((o) => {
          try { o.stop(now + 0.12); } catch (e) { /* noop */ }
        });
        bucket.delete(voice);
      }
    };
    bucket.add(voice);
    osc.onended = () => bucket.delete(voice);
    return voice;
  }

  /* ---------- Bloques y patrones ---------- */
  function playBlock(notes, when, duration, layer) {
    const list = sortedNotes(notes);
    const stride = Settings.strum;
    list.forEach((m, i) => {
      spawn(m, when + i * stride, Math.max(0.12, duration - i * stride), 0.95 - i * 0.03, layer);
    });
  }

  function stepDuration() {
    const beat = 60 / Math.max(30, activeBpm);
    return activeMode === 'arpeggio' ? beat / 2 : beat * 2;
  }

  function stopLayer(layer) {
    const l = L[layer];
    if (!l) return;
    if (l.loop) { clearInterval(l.loop); l.loop = null; }
    if (l.end) { clearTimeout(l.end); l.end = null; }
    if (l.pat && l.pat.timer) { clearInterval(l.pat.timer); }
    l.pat = null;
    if (l.mel && l.mel.timer) { clearInterval(l.mel.timer); }
    l.mel = null;
    l.loopState = null;
    l.voices.forEach((v) => {
      try { v.cancel(); } catch (e) { /* noop */ }
    });
    l.voices.clear();
    l.active = false;
  }

  function stop() {
    stopLayer('chord');
    stopLayer('seq');
    stopLayer('scale');
    stopLayer('arp');
    stopLayer('seqarp');
    stopLayer('triad');
    stopLayer('bass');
    stopDrum();
    stopSteps();
  }

  /* ---------- Acorde (capa chord) ---------- */
  function tickChord() {
    const ls = L.chord.loopState;
    if (!ls || !L.chord.active) return;
    if (ls.nextTime < ctx.currentTime) ls.nextTime = ctx.currentTime + 0.05;
    const horizon = ctx.currentTime + 0.22;
    const dur = stepDuration();
    let guard = 0;
    while (ls.nextTime < horizon && guard++ < 96) {
      if (currentNotes.length) playBlock(currentNotes, ls.nextTime, dur * 0.92, 'chord');
      ls.nextTime += dur;
    }
  }

  function start(notes, opts) {
    ensure();
    stopLayer('chord');
    const o = opts || {};
    activeMode = o.mode || Settings.mode;
    activeBpm = o.bpm || Settings.bpm;
    activeRepeat = o.repeat != null ? o.repeat : Settings.repeat;

    const list = sortedNotes(notes || []);
    if (!list.length) return;
    currentNotes = list;
    L.chord.active = true;

    if (activeRepeat) {
      L.chord.loopState = { nextTime: ctx.currentTime + 0.08 };
      tickChord();
      L.chord.loop = setInterval(tickChord, 25);
    } else {
      const t0 = ctx.currentTime + 0.03;
      const dur = stepDuration();
      const chordDur = Math.max(0.9, dur * 0.94);
      playBlock(currentNotes, t0, chordDur, 'chord');
      const endAt = t0 + chordDur + Settings.release + 0.1;
      L.chord.end = setTimeout(() => {
        stopLayer('chord');
        if (onEnd) onEnd('chord');
      }, Math.max(180, (endAt - ctx.currentTime) * 1000));
    }
  }

  function setNotes(notes) {
    currentNotes = sortedNotes(notes || []);
  }

  /* ---------- Escala (capa scale) ---------- */
  function melTick(name) {
    const l = L[name];
    if (!l || !l.mel) return;
    const m = l.mel;
    const horizon = ctx.currentTime + 0.22;
    let guard = 0;
    while (m.nextTime < horizon && guard++ < 32) {
      const note = m.notes[m.index % m.notes.length];
      spawn(note, m.nextTime, m.step * 0.95, 0.9, name);
      m.index++;
      m.nextTime += m.step;
      if (!m.repeat && m.index >= m.notes.length) {
        if (m.timer) { clearInterval(m.timer); m.timer = null; }
        break;
      }
    }
  }

  /* notes en orden; opts: { stepMs, startTime, repeat, totalDur, layer } */
  function melody(notes, opts) {
    ensure();
    const o = opts || {};
    const name = o.layer || 'scale';
    const l = L[name] || L.scale;
    stopLayer(name);
    const list = (notes || []).slice();
    if (!list.length) return;

    const step = Math.max(0.05, (o.stepMs || 250) / 1000);
    l.mel = {
      notes: list,
      index: 0,
      step: step,
      repeat: !!o.repeat,
      nextTime: o.startTime || (ctx.currentTime + 0.06),
      timer: null
    };
    l.active = true;
    l.mel.timer = setInterval(() => melTick(name), 25);
    melTick(name);

    if (o.totalDur) {
      const from = (o.startTime || ctx.currentTime) - ctx.currentTime;
      const ms = Math.max(150, (from + o.totalDur) * 1000);
      l.end = setTimeout(() => {
        stopLayer(name);
        if (onEnd) onEnd(name);
      }, ms);
    } else if (!o.repeat) {
      const total = ((list.length - 1) * step + step + Settings.release + 0.1) * 1000;
      l.end = setTimeout(() => {
        stopLayer(name);
        if (onEnd) onEnd(name);
      }, Math.max(200, total));
    }
  }

  /* ---------- Secuencia (capa seq) ---------- */
  function pattern(notes, opts) {
    ensure();
    const o = opts || {};
    const name = o.layer || 'seq';
    const l = L[name] || L.seq;
    const keepTail = !!o.keepTail;
    const repeat = !!o.repeat;

    if (keepTail) {
      if (l.pat && l.pat.timer) clearInterval(l.pat.timer);
      if (l.end) { clearTimeout(l.end); l.end = null; }
      l.pat = null;
    } else {
      stopLayer(name);
    }

    const interval = Math.max(0.06, (o.intervalMs || 500) / 1000);
    const dur = Math.max(0.05, (o.durMs || interval * 900) / 1000);
    const strikes = Math.max(1, o.strikes || 1);
    const list = (notes || []).slice();
    if (!list.length) return;

    l.active = true;
    l.pat = {
      notes: list,
      strikes: strikes,
      interval: interval,
      dur: dur,
      repeat: repeat,
      index: 0,
      nextTime: o.startTime || (ctx.currentTime + 0.06),
      timer: null
    };
    l.pat.timer = setInterval(() => patternTick(name), 25);
    patternTick(name);

    if (!keepTail && !repeat) {
      const totalMs = ((strikes - 1) * interval + dur + Settings.release + 0.1) * 1000;
      l.end = setTimeout(() => {
        stopLayer(name);
        if (onEnd) onEnd(name);
      }, Math.max(200, totalMs));
    }
  }

  function patternTick(name) {
    const l = L[name];
    if (!l || !l.pat) return;
    const p = l.pat;
    const horizon = ctx.currentTime + 0.22;
    let guard = 0;
    while (p.nextTime < horizon && guard++ < 32) {
      if (p.index >= p.strikes) {
        if (!p.repeat) break;
        p.index = 0;
      }
      playBlock(p.notes, p.nextTime, p.dur, name);
      p.nextTime += p.interval;
      p.index++;
    }
    if (!p.repeat && p.index >= p.strikes && p.timer) {
      clearInterval(p.timer);
      p.timer = null;
    }
  }

  /* ---------- Batería ---------- */
  function noiseBuffer() {
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function kick(t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    g.connect(drumBus);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  function snare(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(hp);
    hp.connect(g);
    g.connect(drumBus);
    src.start(t);
    src.stop(t + 0.2);

    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    bg.gain.setValueAtTime(0.25, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    body.connect(bg);
    bg.connect(drumBus);
    body.start(t);
    body.stop(t + 0.14);
  }

  function hihat(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(drumBus);
    src.start(t);
    src.stop(t + 0.07);
  }

  function crash(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    src.connect(hp);
    hp.connect(g);
    g.connect(drumBus);
    src.start(t);
    src.stop(t + 0.8);
  }

  /* 8 filas: 0-3 personalizadas (solo MIDI), 4-7 plato, hi-hat, redoblante, bombo */
  const DRUM_TYPES = [null, null, null, null, 'crash', 'hihat', 'snare', 'kick'];

  function drumHit(row, when) {
    if (!ctx) return;
    const t = Math.max(when, ctx.currentTime);
    const type = DRUM_TYPES[row];
    if (type === 'kick') kick(t);
    else if (type === 'snare') snare(t);
    else if (type === 'hihat') hihat(t);
    else if (type === 'crash') crash(t);
    if (onDrumHit) onDrumHit(row, t);
  }

  function drumTick() {
    if (!drum) return;
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (drum.nextTime < horizon &&
           (drum.endTime == null || drum.nextTime < drum.endTime) &&
           guard++ < 8) {
      for (let c = 0; c < drum.length; c++) {
        const at = drum.nextTime + c * drum.colDur;
        if (drum.endTime != null && at >= drum.endTime) break;
        for (let r = 0; r < drum.rows.length; r++) {
          if (drum.rows[r] && drum.rows[r][c]) drumHit(r, at);
        }
      }
      drum.nextTime += drum.length * drum.colDur;
    }
    if (drum.endTime != null && drum.nextTime >= drum.endTime) {
      if (drum.timer) clearInterval(drum.timer);
      drum.timer = null;
    }
  }

  /* Secuencia de pasos: cada paso es un array de notas MIDI */
  function stepsTick() {
    if (!stepsSeq) return;
    const s = stepsSeq;
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (s.nextTime < horizon &&
           (s.endTime == null || s.nextTime < s.endTime) &&
           guard++ < 16) {
      const notes = s.steps[s.index % s.steps.length];
      if (notes && notes.length) {
        playBlock(notes, s.nextTime, s.dur, s.layer);
        if (onStepsTick) onStepsTick(notes, s.nextTime, s.dur);
      }
      s.nextTime += s.stepDur;
      s.index++;
    }
    if (s.endTime != null && s.nextTime >= s.endTime) {
      if (s.timer) clearInterval(s.timer);
      s.timer = null;
    }
  }

  function playSteps(steps, opts) {
    ensure();
    stopSteps();
    const o = opts || {};
    const name = o.layer || 'arp';
    const list = (steps || []).slice();
    if (!list.length) return;

    const stepDur = Math.max(0.04, (o.stepMs || 150) / 1000);
    const dur = Math.max(0.03, (o.durMs || stepDur * 0.9) / 1000);
    const start = Math.max(ctx.currentTime + 0.05, o.startTime || ctx.currentTime + 0.06);

    stepsSeq = {
      steps: list,
      layer: name,
      stepDur: stepDur,
      dur: dur,
      nextTime: start,
      endTime: o.totalDur ? start + o.totalDur : null,
      index: 0,
      timer: null
    };
    stepsSeq.timer = setInterval(stepsTick, 25);
    stepsTick();
  }

  function stopSteps() {
    if (!stepsSeq) return;
    const name = stepsSeq.layer;
    if (stepsSeq.timer) clearInterval(stepsSeq.timer);
    stepsSeq = null;
    stopLayer(name);
  }

  function stopDrum() {
    if (!drum) return;
    if (drum.timer) clearInterval(drum.timer);
    drum = null;
  }

  /* rows: 4 arrays de 0/1 · length: columnas activas · colDur: segundos por columna */
  function drumStart(cfg, opts) {
    ensure();
    stopDrum();
    if (!cfg || !cfg.rows) return;
    const o = opts || {};
    const start = Math.max(ctx.currentTime + 0.04, o.startTime || ctx.currentTime + 0.05);
    drum = {
      rows: cfg.rows,
      length: Math.max(1, Math.min(16, cfg.length || 16)),
      colDur: Math.max(0.02, cfg.colDur || 0.125),
      nextTime: start,
      endTime: o.totalDur != null ? start + o.totalDur : null,
      timer: null
    };
    drum.timer = setInterval(drumTick, 25);
    drumTick();
  }

  /* ---------- Metrónomo ---------- */
  function clickAt(when) {
    if (!ctx) return;
    const at = Math.max(when, ctx.currentTime);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.02, Settings.clickVolume), at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + 0.06);
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  /* ---------- Ajustes ---------- */
  function configure(patch) {
    Object.assign(Settings, patch);
    if (master) master.gain.value = Math.pow(Settings.volume, 1.4) * 0.9;
  }

  function setDrumVolume(v) {
    if (drumBus) drumBus.gain.value = Math.max(0, Math.min(1, v));
  }

  function setLayerOptions(layer, opts) {
    if (!layerCfg[layer]) return;
    Object.assign(layerCfg[layer], opts || {});
  }

  function preview(midi) {
    ensure();
    spawn(midi, ctx.currentTime + 0.01, 0.55, 0.9, 'chord');
  }

  global.AudioEngine = {
    Settings,
    ensure,
    start,
    melody,
    sequence: melody,
    pattern,
    drumStart,
    stopDrum,
    playSteps,
    stopSteps,
    setDrumVolume,
    clickAt,
    now,
    stop,
    stopLayer,
    setNotes,
    preview,
    configure,
    setLayerOptions,
    isPlaying: (layer) => (layer ? !!(L[layer] && L[layer].active) : !!(L.chord.active || L.seq.active || L.scale.active)),
    get onEnd() { return onEnd; },
    set onEnd(fn) { onEnd = fn; },
    get onDrumHit() { return onDrumHit; },
    set onDrumHit(fn) { onDrumHit = fn; },
    get onStepsTick() { return onStepsTick; },
    set onStepsTick(fn) { onStepsTick = fn; }
  };
})(window);
