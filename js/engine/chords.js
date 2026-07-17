/**
 * Chord vocabulary + note-name helpers.
 *
 * QUALITIES is the single source of truth for what triads/tetrads the app
 * understands. Every quality-driven path (piano modal chip row, `notesFrom`
 * used by demo data, `inferChordIdentity` used by the engine and the piano
 * modal, and the eight transition techniques) reads from this table.
 */
import { pitchClassOf, octaveOf, spellPitchClass } from '../util/midi.js';

export const QUALITIES = Object.freeze({
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Dom7: [0, 4, 7, 10],
  Maj7: [0, 4, 7, 11],
  Min7: [0, 3, 7, 10],
  Dim: [0, 3, 6],
  Dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
  Aug: [0, 4, 8],
});

/**
 * Build a default MIDI voicing for `<rootMidi> <quality>` by stacking the
 * quality's intervals on top of the root. Used by the piano modal's quality
 * chips as the reset voicing and by demo data authoring.
 * Throws if `quality` isn't in QUALITIES.
 */
export function notesFrom(rootMidi, quality) {
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown quality: ${ quality }`);
  return intervals.map((interval) => rootMidi + interval);
}

const QUALITY_ORDER = ['Dom7', 'Min7', 'Maj7', 'Dim7', 'm7b5', 'Major', 'Minor', 'Dim', 'Sus4', 'Sus2', 'Aug'];

/**
 * Derive a chord identity exclusively from the notes stored in progression
 * state. This is the single detector used by both the engine (for technique
 * eligibility + targeting) and the piano modal (for live chord recognition
 * while the user toggles keys).
 *
 * Hints are display-only and MUST NEVER affect engine behavior. An
 * unrecognised chord still receives a deterministic bass root so callers can
 * emit a helpful eligibility reason instead of crashing.
 *
 * @param {{notes: number[]}} chord
 * @param {{preferBassRoot?: boolean}} [options]
 *        preferBassRoot: try the bass pitch class first when scanning root
 *        candidates. Matters only for symmetric qualities (Dim7, Aug) where
 *        any rotation would match — the bass is usually the musical root.
 *        The engine leaves this false so its behaviour is deterministic
 *        regardless of voicing.
 * @returns {{rootPc: number, quality: keyof QUALITIES | null, recognised: boolean}}
 */
export function inferChordIdentity(chord, options = {}) {
  const { preferBassRoot = false } = options;
  const pitchClasses = [...new Set(chord.notes.map(pitchClassOf))].sort((a, b) => a - b);
  const bassPc = pitchClassOf(Math.min(...chord.notes));
  const allPcs = Array.from({ length: 12 }, (_, i) => i);
  const rootOrder = preferBassRoot
    ? [bassPc, ...allPcs.filter((pc) => pc !== bassPc)]
    : allPcs;

  for (const quality of QUALITY_ORDER) {
    for (const rootPc of rootOrder) {
      const expected = [...new Set(QUALITIES[quality].map((interval) => (rootPc + interval) % 12))]
        .sort((a, b) => a - b);
      if (pitchClasses.length === expected.length && pitchClasses.every((pc, index) => pc === expected[index])) {
        return { rootPc, quality, recognised: true };
      }
    }
  }

  return { rootPc: bassPc, quality: null, recognised: false };
}

/**
 * Human-readable pitch name for a MIDI number.
 * `key` picks the accidental spelling (< 0 → flats, ≥ 0 → sharps) — this is
 * spelling only, never audio. `withOctave` false returns just the letter.
 */
export function noteName(midi, key = 0, withOctave = true) {
  const name = spellPitchClass(midi, key);
  return withOctave ? `${ name }${ octaveOf(midi) }` : name;
}

/**
 * Row label for a chord in the chord list ("C Major", "F♯ Dom7", …).
 * Uses the display-only `hint` if set (the fast path — every hint-annotated
 * chord names itself without running detection); falls back to a note list.
 */
export function chordDisplayName(chord, key = 0) {
  if (chord.hint) return `${ noteName(chord.hint.rootMidi, key, false) } ${ chord.hint.quality }`;
  return chord.notes.map((note) => noteName(note, key)).join('–');
}
