/* =====================================================================
   midi.js — Salida MIDI (Web MIDI API) multicanal.

   Cada capa de la app (acorde, escala, bajo, batería) puede salir por su
   propio canal. Las notas se agrupan por canal para poder detener una
   capa sin cortar las demás.
   ===================================================================== */
(function (global) {
  'use strict';

  let access = null;
  let output = null;
  let enabled = false;
  let onStateChange = null;

  const held = new Map();   // "canal:nota" -> { note, ch }
  const timers = new Set();
  const chanTimers = new Map(); // canal -> Set(ids)

  function addTimer(ch, fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      const set = chanTimers.get(ch);
      if (set) set.delete(id);
      fn();
    }, Math.max(0, ms));
    timers.add(id);
    if (ch) {
      let set = chanTimers.get(ch);
      if (!set) { set = new Set(); chanTimers.set(ch, set); }
      set.add(id);
    }
    return id;
  }

  function clearChannelTimers(ch) {
    const set = chanTimers.get(ch);
    if (!set) return;
    set.forEach((id) => {
      clearTimeout(id);
      timers.delete(id);
    });
    set.clear();
    chanTimers.delete(ch);
  }

  const supported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  const chMask = (ch) => (Math.max(1, Math.min(16, ch || 1)) - 1) & 0x0f;

  async function enable() {
    if (!supported()) throw new Error('Este navegador no soporta Web MIDI');
    access = await navigator.requestMIDIAccess({ sysex: false });
    enabled = true;
    access.onstatechange = () => { if (onStateChange) onStateChange(outputs()); };
    const list = outputs();
    if (!output && list.length) output = list[0];
    if (onStateChange) onStateChange(list);
    return list;
  }

  function outputs() {
    if (!access) return [];
    return Array.from(access.outputs.values());
  }

  function select(id) {
    if (!access) return null;
    output = id ? access.outputs.get(id) || null : null;
    return output;
  }

  function send(data) {
    if (!output || !output.send) return false;
    try {
      output.send(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noteOn(note, ch, velocity) {
    send([0x90 | chMask(ch), note & 0x7f, Math.max(1, Math.min(127, velocity || 100))]);
    held.set(chMask(ch) + ':' + note, { note, ch: chMask(ch) + 1 });
  }

  function noteOff(note, ch) {
    send([0x80 | chMask(ch), note & 0x7f, 0]);
    held.delete(chMask(ch) + ':' + note);
  }

  /* Apaga solo las notas de un canal */
  function stopChannel(ch) {
    const c = chMask(ch);
    clearChannelTimers(c + 1);
    const kill = [];
    held.forEach((v, k) => { if ((v.ch - 1) === c) kill.push(k); });
    kill.forEach((k) => {
      const v = held.get(k);
      send([0x80 | c, v.note, 0]);
      held.delete(k);
    });
    send([0xb0 | c, 123, 0]);
  }

  function allNotesOff() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    chanTimers.clear();
    held.forEach((v) => send([0x80 | ((v.ch - 1) & 0x0f), v.note, 0]));
    held.clear();
    for (let ch = 0; ch < 16; ch++) send([0xb0 | ch, 123, 0]);
  }

  function scheduleOff(notes, ch, ms) {
    addTimer(ch, () => notes.forEach((n) => noteOff(n, ch)), Math.max(60, ms || 1200));
  }

  /* notes: array de notas MIDI. channel: 1..16 */
  function sendNotes(notes, durationMs, channel) {
    if (!output || !notes || !notes.length) return;
    const ch = channel || 1;
    stopChannel(ch);
    notes.forEach((n) => noteOn(n, ch, 100));
    scheduleOff(notes, ch, durationMs);
  }

  function sendNote(note, durationMs, channel) {
    if (!output) return;
    const ch = channel || 1;
    noteOn(note, ch, 100);
    scheduleOff([note], ch, durationMs || 500);
  }

  /* Melodía: notas en orden, con pasos parejos */
  function sendSequence(notes, stepMs, durMs, channel) {
    if (!output || !notes || !notes.length) return;
    const ch = channel || 1;
    stopChannel(ch);
    const step = Math.max(40, stepMs || 250);
    const dur = Math.max(60, durMs || step * 0.9);
    notes.forEach((n, i) => {
      addTimer(ch, () => noteOn(n, ch, 95), i * step);
      addTimer(ch, () => noteOff(n, ch), i * step + dur);
    });
  }

  /* Patrón de acordes */
  function sendPattern(notes, strikes, intervalMs, durMs, channel) {
    if (!output || !notes || !notes.length) return;
    const ch = channel || 1;
    stopChannel(ch);
    const step = Math.max(60, intervalMs || 500);
    const dur = Math.max(50, durMs || step * 0.9);
    for (let i = 0; i < Math.max(1, strikes || 1); i++) {
      addTimer(ch, () => notes.forEach((n) => noteOn(n, ch, 95)), i * step);
      addTimer(ch, () => notes.forEach((n) => noteOff(n, ch)), i * step + dur);
    }
  }

  /* Golpe de batería (una nota corta) */
  function sendDrum(note, channel, velocity) {
    if (!output) return;
    const ch = channel || 10;
    noteOn(note, ch, velocity || 110);
    addTimer(ch, () => noteOff(note, ch), 130);
  }

  global.MidiOut = {
    supported,
    enable,
    outputs,
    select,
    sendNotes,
    sendSequence,
    sendPattern,
    sendDrum,
    sendNote,
    stopChannel,
    allNotesOff,
    get enabled() { return enabled && !!output; },
    get outputName() { return output ? output.name : null; },
    set onStateChange(fn) { onStateChange = fn; }
  };
})(window);
