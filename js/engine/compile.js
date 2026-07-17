/**
 * The pure translation: `progression` → ordered `Segment[]`.
 *
 * This is the linchpin of the app: notation, audio playback, and the bar-
 * highlight effect all consume the SAME list, so what you see is guaranteed
 * to equal what you hear. See DATA-MODEL.md §2.
 *
 * Per-chord flow:
 *   1. Emit the user's chord for `chord.bars * measureLength` beats, minus
 *      any beats a valid technique will borrow from the tail.
 *   2. If a technique is set + valid + fits the budget, `generateTechnique`
 *      produces the connective events (voice-led toward `chord.notes`).
 *   3. `layoutEvents` decomposes durations and splits across barlines.
 *
 * Unknown or ineligible technique keys warn to the console and degrade to a
 * direct transition — never throw.
 */
import { TECHNIQUES, generateTechnique } from './techniques.js';
import { evaluateTechnique } from './technique-eligibility.js';
import { layoutEvents } from './rhythm.js';
import { availableBeats, chordTotalBeats, measureLength } from '../state.js';

export function compileProgression(progression) {
  const timeSig = progression.settings.timeSig;
  const measureBeats = measureLength(timeSig);
  const events = [];
  for (let index = 0; index < progression.chords.length; index += 1) {
    const chord = progression.chords[index];
    const total = chordTotalBeats(chord, timeSig);
    const requested = progression.seams[index];
    const technique = requested ? TECHNIQUES[requested] : null;
    if (requested && !technique) console.warn(`Unknown technique "${ requested }" at seam ${ index }; ignored.`);
    const eligibility = technique && progression.chords[index + 1]
      ? evaluateTechnique(requested, chord, progression.chords[index + 1])
      : null;
    if (requested && eligibility && !eligibility.valid) console.warn(`Technique "${ requested }" at seam ${ index } is invalid here: ${ eligibility.reason }`);
    const budget = availableBeats(total);
    const cost = technique && eligibility?.valid && technique.beatCost <= budget ? technique.beatCost : 0;
    events.push({ notes: chord.notes, duration: total - cost, isTechnique: false, sourceId: chord.id, seamIndex: null });
    if (cost && progression.chords[index + 1]) {
      const generated = generateTechnique(requested, chord, progression.chords[index + 1], chord.notes, cost);
      generated.forEach((event, part) => events.push({ ...event, isTechnique: true, sourceId: `s${ index }-${ part }`, seamIndex: index }));
    }
  }
  return layoutEvents(events, measureBeats);
}
