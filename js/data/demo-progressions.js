/**
 * Bundled demo progressions.
 *
 * Every demo chord is authored with an explicit hint (`{rootMidi, quality}`)
 * so its row names itself instantly, and its notes come from `notesFrom()` —
 * the same builder the piano modal uses for its default voicings. This keeps
 * demo data on the exact same data contract as user chords: no parallel
 * "recipe" representation.
 */
import { makeChord, makeProgression } from '../state.js';
import { notesFrom } from '../engine/chords.js';

/** ii-V-I with a tritone sub inserted between the V and I. Loaded at boot. */
export function makeDefaultProgression() {
  const chords = [
    makeChord(notesFrom(50, 'Min7'), 1, { rootMidi: 50, quality: 'Min7' }),
    makeChord(notesFrom(55, 'Dom7'), 1, { rootMidi: 55, quality: 'Dom7' }),
    makeChord(notesFrom(60, 'Major'), 1, { rootMidi: 60, quality: 'Major' }),
  ];
  return makeProgression({
    settings: { tempo: 96, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
    chords,
    seams: [null, 'tritoneSub'],
  });
}
