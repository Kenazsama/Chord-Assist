/* =====================================================================
   midi.js — Salida MIDI (Web MIDI API).
   Trabaja con notas MIDI absolutas, igual que el motor de audio:
   así el MIDI manda exactamente lo que suena (incluidos los bajos).
   Requiere contexto seguro: https o http://localhost.
   ===================================================================== */
(function (global) {
  'use strict';

  let access = null;
  let output = null;
  let channel = 0;
  let enabled = false;
  let onStateChange = null;
  const held = new Set();
  const offTimers = new Set();
  const seqTimers = new Set();

  const supported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

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

  function noteOn(note, velocity) {
    send([0x90 | (channel & 0x0f), Math.max(0, Math.min(127, note)), Math.max(1, Math.min(127, velocity || 100))]);
  }

  function noteOff(note) {
    send([0x80 | (channel & 0x0f), Math.max(0, Math.min(127, note)), 0]);
    held.delete(note);
  }

  function allNotesOff() {
    offTimers.forEach((t) => clearTimeout(t));
    offTimers.clear();
    seqTimers.forEach((t) => clearTimeout(t));
    seqTimers.clear();
    held.forEach((n) => noteOff(n));
    send([0xb0 | (channel & 0x0f), 123, 0]);
    held.clear();
  }

  function scheduleOff(notes, ms) {
    const t = setTimeout(() => {
      notes.forEach((n) => noteOff(n));
      offTimers.delete(t);
    }, Math.max(80, ms || 1200));
    offTimers.add(t);
  }

  /* notes: array de notas MIDI absolutas */
  function sendNotes(notes, durationMs, velocity) {
    if (!output || !notes || !notes.length) return;
    allNotesOff();
    notes.forEach((n) => {
      noteOn(n, velocity || 100);
      held.add(n);
    });
    scheduleOff(notes, durationMs);
  }

  function sendNote(midi, durationMs, velocity) {
    if (!output) return;
    noteOn(midi, velocity || 100);
    held.add(midi);
    scheduleOff([midi], durationMs || 550);
  }

  /* Melodía: dispara las notas en orden, con pasos parejos. */
  function sendSequence(notes, stepMs, durMs) {
    if (!output || !notes || !notes.length) return;
    allNotesOff();
    const step = Math.max(40, stepMs || 250);
    const dur = Math.max(60, durMs || step * 0.9);
    notes.forEach((n, i) => {
      const on = setTimeout(() => { noteOn(n, 95); held.add(n); }, i * step);
      const off = setTimeout(() => { noteOff(n); }, i * step + dur);
      seqTimers.add(on);
      seqTimers.add(off);
    });
  }

  /* Patrón de acordes: varias pulsaciones separadas por intervalMs. */
  function sendPattern(notes, strikes, intervalMs, durMs) {
    if (!output || !notes || !notes.length) return;
    allNotesOff();
    const n = Math.max(1, strikes || 1);
    const step = Math.max(60, intervalMs || 500);
    const dur = Math.max(50, durMs || step * 0.9);
    for (let i = 0; i < n; i++) {
      const on = setTimeout(() => {
        notes.forEach((note) => { noteOn(note, 95); held.add(note); });
      }, i * step);
      const off = setTimeout(() => {
        notes.forEach((note) => noteOff(note));
      }, i * step + dur);
      seqTimers.add(on);
      seqTimers.add(off);
    }
  }

  function program(pc) {
    send([0xc0 | (channel & 0x0f), Math.max(0, Math.min(127, pc | 0))]);
  }

  function setChannel(ch) {
    allNotesOff();
    channel = Math.max(0, Math.min(15, (ch | 0) - 1));
  }

  global.MidiOut = {
    supported,
    enable,
    outputs,
    select,
    sendNotes,
    sendSequence,
    sendPattern,
    sendNote,
    allNotesOff,
    program,
    setChannel,
    get enabled() { return enabled && !!output; },
    get outputName() { return output ? output.name : null; },
    get channel() { return channel + 1; },
    set onStateChange(fn) { onStateChange = fn; }
  };
})(window);
