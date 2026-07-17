/**
 * MIDI number helpers shared across engine, notation, and UI.
 *
 * Kept dependency-free so any layer can import without creating cycles.
 * Two spelling tables live here — one for on-screen display (Unicode ♯/♭)
 * and one for VexFlow (ASCII #/b, lowercase) — so a single sharp-vs-flat
 * decision drives both. The rule is simple: `key < 0` (flat key signatures)
 * → prefer flats; otherwise → sharps.
 */

const SHARP_DISPLAY = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_DISPLAY = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARP_VEX = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_VEX = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

/** 0..11 pitch class for any (positive or negative) MIDI number. */
export const pitchClassOf = (midi) => ((midi % 12) + 12) % 12;

/** MIDI octave number using the standard convention where 60 = C4. */
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

/**
 * Letter+accidental for a pitch class, spelled per key signature.
 * Accepts a MIDI number too — only the pitch class is used.
 * e.g. `spellPitchClass(1, 0)` → 'C♯'; `spellPitchClass(1, -2)` → 'D♭'.
 */
export function spellPitchClass(pcOrMidi, key = 0) {
  return (key < 0 ? FLAT_DISPLAY : SHARP_DISPLAY)[pitchClassOf(pcOrMidi)];
}

/**
 * VexFlow key string: `letter[accidental]/octave`, e.g. 'c#/4' or 'eb/3'.
 * Accidental style follows the same key-signature rule as spellPitchClass.
 */
export function vexKey(midi, key = 0) {
  const names = key < 0 ? FLAT_VEX : SHARP_VEX;
  return `${ names[pitchClassOf(midi)] }/${ octaveOf(midi) }`;
}
