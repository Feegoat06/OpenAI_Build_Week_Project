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

/** The demo loaded at boot. Swap the commented return when projects can select examples. */
export function makeDefaultProgression() {
  // return makeIiVIWithTritoneSubProgression();
  return make4536251PopProgression();
}

/** ii-V-I with a tritone sub inserted between the V and I. */
function makeIiVIWithTritoneSubProgression() {
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

/** 4–5–3–6–2–5–1, the ubiquitous pop-song turnaround, in C major. */
function make4536251PopProgression() {
  const chords = [
    makeChord(notesFrom(53, 'Major'), 1, { rootMidi: 53, quality: 'Major' }), // IV: F
    makeChord(notesFrom(55, 'Major'), 1, { rootMidi: 55, quality: 'Major' }), // V: G
    makeChord(notesFrom(52, 'Minor'), 1, { rootMidi: 52, quality: 'Minor' }), // iii: Em
    makeChord(notesFrom(57, 'Minor'), 1, { rootMidi: 57, quality: 'Minor' }), // vi: Am
    makeChord(notesFrom(50, 'Minor'), 1, { rootMidi: 50, quality: 'Minor' }), // ii: Dm
    makeChord(notesFrom(55, 'Major'), 1, { rootMidi: 55, quality: 'Major' }), // V: G
    makeChord(notesFrom(60, 'Major'), 1, { rootMidi: 60, quality: 'Major' }), // I: C
  ];
  return makeProgression({
    settings: { tempo: 96, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
    chords,
    seams: [
      'passingDim', // F → F#dim → G
      'susPassing', // G → Esus → Em
      'secondaryDom', // Em → E7 → Am
      'scaleRun', // Am → scale run → Dm
      'susPassing', // Dm → Gsus → G
      'ii_v_i', // G → Dm7 → G7 → C
    ],
  });
}
