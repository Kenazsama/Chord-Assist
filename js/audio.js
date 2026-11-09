/* =====================================================================
   audio.js — Motor de audio con Web Audio API.
   Sintetizador propio: osciladores + ADSR + filtro + reverb corta.

   Habla en notas MIDI absolutas (no en pitch classes), así cada nota
   puede sonar en su octava real: eso habilita los bajos y las inversiones.
   Expone window.AudioEngine
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
    mode: 'block',       // block | arpeggio
    bpm: 96,
    strum: 0.025,        // separación entre notas del acorde en bloque
    repeat: false
  };

  let ctx = null;
  let master = null;
  let comp = null;
  let dryGain = null;
  let wetGain = null;

  const voices = new Set();
  let playing = false;
  let currentNotes = [];
  let activeMode = 'block';
  let activeBpm = 96;
  let activeRepeat = false;
  let loopTimer = null;
  let loopState = { active: false, nextTime: 0, step: 0 };
  let pat = null;
  let endTimer = null;
  let onEnd = null;

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

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

      dryGain = ctx.createGain();
      dryGain.gain.value = 1;
      wetGain = ctx.createGain();
      wetGain.gain.value = 0.16;

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
  function spawn(midi, when, duration, velocity) {
    const t0 = Math.max(when, ctx.currentTime + 0.001);
    const freq = midiToFreq(midi);
    const vel = velocity == null ? 1 : velocity;

    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(11000, 1400 + freq * 2.4), t0);
    lp.Q.value = 0.7;

    const osc = ctx.createOscillator();
    osc.type = Settings.waveform;
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
    const peak = 0.19 * vel;

    const holdUntil = t0 + Math.max(duration, a + d + 0.02);
    const releaseAt = Math.max(holdUntil, t0 + a + d + 0.01);
    const stopAt = releaseAt + r + 0.06;

    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(peak, t0 + a);
    out.gain.exponentialRampToValueAtTime(Math.max(peak * s, 0.0002), t0 + a + d);
    out.gain.setValueAtTime(Math.max(peak * s, 0.0002), releaseAt);
    out.gain.exponentialRampToValueAtTime(0.0001, releaseAt + r);

    osc.start(t0);
    shimmer.start(t0);
    sub.start(t0);
    osc.stop(stopAt);
    shimmer.stop(stopAt);
    sub.stop(stopAt);

    const voice = {
      gain: out,
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
        voices.delete(voice);
      }
    };
    voices.add(voice);
    osc.onended = () => voices.delete(voice);
    return voice;
  }

  /* ---------- Reproducción ---------- */
  const sortedNotes = (notes) => notes.slice().sort((a, b) => a - b);

  function playBlock(notes, when, duration) {
    const list = sortedNotes(notes);
    const stride = Settings.strum;
    list.forEach((m, i) => {
      spawn(m, when + i * stride, Math.max(0.12, duration - i * stride), 0.95 - i * 0.03);
    });
  }

  function playArpStep(notes, when, stepDur) {
    if (!notes.length) return;
    const list = sortedNotes(notes);
    const note = list[loopState.step % list.length];
    const octJump = Math.floor(loopState.step / list.length) % 2;
    spawn(note + octJump * 12, when, stepDur * 0.92, 0.9);
    loopState.step++;
  }

  function stepDuration() {
    const beat = 60 / Math.max(30, activeBpm);
    return activeMode === 'arpeggio' ? beat / 2 : beat * 2;
  }

  function clearTimers() {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    if (pat && pat.timer) { clearInterval(pat.timer); pat.timer = null; }
    pat = null;
    loopState.active = false;
  }

  function tick() {
    if (!loopState.active) return;
    // Si el navegador estuvo en segundo plano, no acumular notas atrasadas.
    if (loopState.nextTime < ctx.currentTime) loopState.nextTime = ctx.currentTime + 0.05;
    const horizon = ctx.currentTime + 0.22;
    const dur = stepDuration();
    let guard = 0;
    while (loopState.nextTime < horizon && guard++ < 96) {
      if (activeMode === 'arpeggio') {
        playArpStep(currentNotes, loopState.nextTime, dur);
      } else if (currentNotes.length) {
        playBlock(currentNotes, loopState.nextTime, dur * 0.92);
      }
      loopState.nextTime += dur;
    }
  }

  /* notes: array de notas MIDI. opts: { mode, bpm, repeat } */
  function start(notes, opts) {
    ensure();
    stop();
    const o = opts || {};
    activeMode = o.mode || Settings.mode;
    activeBpm = o.bpm || Settings.bpm;
    activeRepeat = o.repeat != null ? o.repeat : Settings.repeat;

    currentNotes = sortedNotes(notes || []);
    if (!currentNotes.length) return;
    playing = true;

    if (activeRepeat) {
      loopState = { active: true, nextTime: ctx.currentTime + 0.08, step: 0 };
      tick();
      loopTimer = setInterval(tick, 25);
    } else {
      const t0 = ctx.currentTime + 0.03;
      const dur = stepDuration();
      if (activeMode === 'arpeggio') {
        const total = currentNotes.length;
        for (let i = 0; i < total; i++) {
          spawn(currentNotes[i], t0 + i * dur, dur * 0.92, 0.9);
        }
        const endAt = t0 + total * dur + Settings.release + 0.1;
        endTimer = setTimeout(() => { stop(); if (onEnd) onEnd(); }, Math.max(180, (endAt - ctx.currentTime) * 1000));
      } else {
        const chordDur = Math.max(0.9, dur * 0.94);
        playBlock(currentNotes, t0, chordDur);
        const endAt = t0 + chordDur + Settings.release + 0.1;
        endTimer = setTimeout(() => { stop(); if (onEnd) onEnd(); }, Math.max(180, (endAt - ctx.currentTime) * 1000));
      }
    }
  }

  /* Melodía: toca las notas MIDI en el orden dado (escalas, arpegios sueltos). */
  function sequence(notes, opts) {
    ensure();
    stop();
    const o = opts || {};
    const step = o.step || (60 / (o.bpm || Settings.bpm)) / 2;
    const t0 = ctx.currentTime + 0.05;
    currentNotes = notes.slice();
    if (!currentNotes.length) return;
    playing = true;
    currentNotes.forEach((m, i) => spawn(m, t0 + i * step, step * 0.95, 0.9));
    const endAt = t0 + currentNotes.length * step + Settings.release + 0.05;
    endTimer = setTimeout(() => { stop(); if (onEnd) onEnd(); }, Math.max(180, (endAt - ctx.currentTime) * 1000));
  }

  /* Patrón de acordes: el mismo acorde golpeado cada intervalMs, strikes veces.
     Programa con un pequeño lookahead para no crear decenas de voces de golpe. */
  function pattern(notes, opts) {
    ensure();
    stop();
    const o = opts || {};
    const interval = Math.max(0.06, (o.intervalMs || 500) / 1000);
    const dur = Math.max(0.05, (o.durMs || interval * 900) / 1000);
    const strikes = Math.max(1, o.strikes || 1);

    currentNotes = notes.slice();
    if (!currentNotes.length) return;
    playing = true;

    pat = {
      notes: currentNotes.slice(),
      strikes: strikes,
      interval: interval,
      dur: dur,
      index: 0,
      nextTime: ctx.currentTime + 0.06,
      timer: null
    };

    pat.timer = setInterval(patternTick, 25);
    patternTick();

    const totalMs = ((strikes - 1) * interval + dur + Settings.release + 0.1) * 1000;
    endTimer = setTimeout(() => { stop(); if (onEnd) onEnd(); }, Math.max(200, totalMs));
  }

  function patternTick() {
    if (!pat) return;
    const horizon = ctx.currentTime + 0.22;
    let guard = 0;
    while (pat.index < pat.strikes && pat.nextTime < horizon && guard++ < 32) {
      playBlock(pat.notes, pat.nextTime, pat.dur);
      pat.nextTime += pat.interval;
      pat.index++;
    }
    if (pat.index >= pat.strikes && pat.timer) {
      clearInterval(pat.timer);
      pat.timer = null;
    }
  }

  /* Metrónomo: clic corto en un instante exacto del reloj de audio. */
  function clickAt(when) {
    if (!ctx) return;
    const at = Math.max(when, ctx.currentTime);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.22, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + 0.06);
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  function stop() {
    clearTimers();
    playing = false;
    voices.forEach((v) => {
      try { v.cancel(); } catch (e) { /* noop */ }
    });
    voices.clear();
  }

  function setNotes(notes) {
    currentNotes = sortedNotes(notes || []);
  }

  function preview(midi) {
    ensure();
    spawn(midi, ctx.currentTime + 0.01, 0.55, 0.9);
  }

  function configure(patch) {
    Object.assign(Settings, patch);
    if (master) master.gain.value = Math.pow(Settings.volume, 1.4) * 0.9;
  }

  global.AudioEngine = {
    Settings,
    ensure,
    start,
    sequence,
    pattern,
    clickAt,
    now,
    stop,
    setNotes,
    preview,
    configure,
    isPlaying: () => playing,
    get onEnd() { return onEnd; },
    set onEnd(fn) { onEnd = fn; }
  };
})(window);
