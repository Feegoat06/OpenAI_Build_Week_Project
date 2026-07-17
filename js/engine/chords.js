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

export function notesFrom(rootMidi, quality) {
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown quality: ${quality}`);
  return intervals.map((interval) => rootMidi + interval);
}

/**
 * Derive a supported chord identity exclusively from the notes that are stored
 * in progression state. Hints are display-only and must never affect engine
 * behavior. An unrecognised chord still receives a deterministic bass root so
 * callers can give a helpful eligibility reason instead of crashing.
 */
export function inferChordIdentity(chord) {
  const pitchClasses = [...new Set(chord.notes.map((note) => ((note % 12) + 12) % 12))]
    .sort((a, b) => a - b);
  const qualityOrder = ['Dom7', 'Min7', 'Maj7', 'Dim7', 'm7b5', 'Major', 'Minor', 'Dim', 'Sus4', 'Sus2', 'Aug'];

  for (const quality of qualityOrder) {
    for (let rootPc = 0; rootPc < 12; rootPc += 1) {
      const expected = [...new Set(QUALITIES[quality].map((interval) => (rootPc + interval) % 12))]
        .sort((a, b) => a - b);
      if (pitchClasses.length === expected.length && pitchClasses.every((pc, index) => pc === expected[index])) {
        return { rootPc, quality, recognised: true };
      }
    }
  }

  return {
    rootPc: ((Math.min(...chord.notes) % 12) + 12) % 12,
    quality: null,
    recognised: false,
  };
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function noteName(midi, key = 0, withOctave = true) {
  const names = key < 0 ? FLAT_NAMES : SHARP_NAMES;
  const name = names[((midi % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}

export function chordDisplayName(chord, key = 0) {
  if (chord.hint) return `${noteName(chord.hint.rootMidi, key, false)} ${chord.hint.quality}`;
  return chord.notes.map((note) => noteName(note, key)).join('–');
}
