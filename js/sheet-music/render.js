/**
 * VexFlow rendering of the compiled progression.
 *
 * Reads the same `Segment[]` the audio scheduler consumes, so the sheet music
 * cannot silently drift from what plays. Each measure is drawn in its own
 * `<g>` group with `data-measure=<n>` — main.js toggles a `.is-playing` class
 * on that group during playback to light the current bar.
 *
 * User notes are drawn in `--ivory`; technique-generated notes in `--anchor`
 * (the accent color). Ties are drawn between adjacent segments that share a
 * `sourceId` (see rhythm.js), even across a barline.
 */
import { vexKeyForNote, chordSpellingIdentity } from '../engine/chords.js';
import { accidentalFor } from '../engine/key-signature.js';

const KEY_SIGNATURES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const DURATIONS = new Map([[4, 'w'], [2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16']]);

/** 'auto' picks bass or treble from the median MIDI note across all segments. */
function resolvedClef(segments, setting) {
  if (setting !== 'auto') return setting;
  const notes = segments.flatMap((segment) => segment.notes).sort((a, b) => a - b);
  return (notes[Math.floor(notes.length / 2)] ?? 60) < 60 ? 'bass' : 'treble';
}

function styleModifiers(stave, color) {
  stave.getModifiers().forEach((modifier) => modifier.setStyle({ fillStyle: color, strokeStyle: color }));
}

/**
 * Draw the sheet music into `container`, replacing anything already there.
 *
 * @param {HTMLElement} container
 * @param {Segment[]}   segments   Output of compile().
 * @param {Settings}    settings   For key signature, time signature, and clef.
 * @param {Chord[]}     [chords]   Origin chords for spelling — used to spell
 *                                 each user segment's notes per its chord
 *                                 identity (so G♯ major reads as G♯/B♯/D♯ and
 *                                 not G♯/C/D♯). Technique-generated segments
 *                                 fall through to key-based spelling.
 * @returns {{measureCount: number, layout: object[]}} Summary plus staff geometry for the Canvas overlay.
 */
export function renderNotation(container, segments, settings, chords = []) {
  const VF = window.Vex?.Flow ?? window.VexFlow;
  container.replaceChildren();
  if (!VF) {
    container.innerHTML = '<div class="notice">Notation is still loading. Refresh if this message remains.</div>';
    return { measureCount: 0, layout: [] };
  }
  if (!segments.length) {
    container.innerHTML = '<div class="notice">Add a chord to begin the sheet music.</div>';
    return { measureCount: 0, layout: [] };
  }

  const measureCount = Math.max(...segments.map((segment) => segment.measureIndex)) + 1;
  const width = Math.max(600, container.clientWidth || 820);
  const staveWidth = Math.max(230, Math.min(360, (width - 36) / Math.min(2, measureCount)));
  const columns = Math.max(1, Math.floor((width - 20) / staveWidth));
  const rows = Math.ceil(measureCount / columns);
  const rowHeight = 150;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, rows * rowHeight + 20);
  const context = renderer.getContext();
  const clef = resolvedClef(segments, settings.clef);
  const staffColor = '#927a58';
  const lineColor = '#69563f';
  const userColor = '#e6ceaa';
  const techniqueColor = '#d1a15a';
  const notesBySource = [];
  const layout = [];
  const identityBySourceId = new Map();
  chords.forEach((chord) => identityBySourceId.set(chord.id, chordSpellingIdentity(chord)));

  for (let measure = 0; measure < measureCount; measure += 1) {
    const column = measure % columns;
    const row = Math.floor(measure / columns);
    const x = 10 + column * staveWidth;
    const y = 16 + row * rowHeight;
    layout.push({ index: measure, x, width: staveWidth, staffTop: y + 40, lineGap: 10 });
    context.openGroup('measure-group', `measure-${ measure }`, { 'data-measure': String(measure) });
    const stave = new VF.Stave(x, y, staveWidth);
    if (column === 0) {
      stave.addClef(clef).addTimeSignature(`${ settings.timeSig.num }/${ settings.timeSig.den }`).addKeySignature(KEY_SIGNATURES[settings.key + 7]);
    }
    styleModifiers(stave, staffColor);
    context.setStrokeStyle(lineColor); context.setFillStyle(lineColor);
    stave.setStyle({ fillStyle: lineColor, strokeStyle: lineColor }).setContext(context).draw();
    const measureSegments = segments.filter((segment) => segment.measureIndex === measure);
    const staveNotes = measureSegments.map((segment) => {
      const identity = segment.isTechnique ? null : identityBySourceId.get(segment.sourceId) ?? null;
      const spelled = segment.notes.map((midi) => vexKeyForNote(midi, identity, settings.key));
      const staveNote = new VF.StaveNote({
        clef,
        keys: spelled,
        duration: DURATIONS.get(segment.durationBeats) ?? 'q',
      });
      spelled.forEach((vex, index) => {
        const accidental = accidentalFor(vex, settings.key);
        if (accidental) staveNote.addModifier(new VF.Accidental(accidental), index);
      });
      const color = segment.isTechnique ? techniqueColor : userColor;
      staveNote.setStyle({ fillStyle: color, strokeStyle: color });
      staveNote.setLedgerLineStyle?.({ fillStyle: color, strokeStyle: color });
      notesBySource.push({ segment, note: staveNote });
      return staveNote;
    });
    if (staveNotes.length) {
      const voice = new VF.Voice({ num_beats: settings.timeSig.num, beat_value: settings.timeSig.den }).setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      new VF.Formatter().joinVoices([voice]).format([voice], staveWidth - (column === 0 ? 120 : 32));
      voice.draw(context, stave);
    }
    context.closeGroup();
  }

  for (let index = 0; index < notesBySource.length - 1; index += 1) {
    const current = notesBySource[index];
    const next = notesBySource[index + 1];
    if (current.segment.sourceId !== next.segment.sourceId) continue;
    const count = Math.min(current.note.keys.length, next.note.keys.length);
    const indices = Array.from({ length: count }, (_, noteIndex) => noteIndex);
    new VF.StaveTie({ first_note: current.note, last_note: next.note, first_indices: indices, last_indices: indices })
      .setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(context).draw();
  }
  return { measureCount, layout };
}
