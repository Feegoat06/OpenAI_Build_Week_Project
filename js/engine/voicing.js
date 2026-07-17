import { pitchClassOf } from '../util/midi.js';

/**
 * Closest-voicing search: pick an octave placement for each target pitch class
 * that sits nearest to a reference voicing. Used ONLY on auto-generated
 * technique chords — user chords are never re-voiced (see DATA-MODEL.md §6).
 *
 * The search window (40..88) is deliberately narrower than the modal's input
 * range (21..108): users can place a chord anywhere on the keyboard, but
 * generated connective tissue stays in a central register.
 *
 * The cost function and rationale are documented in DATA-MODEL.md §6:
 *   cost = sum |sorted candidate − sorted reference| + 0.1 * |mean diff|
 *
 * ~600 combinations for a 4-note chord — brute force is sub-millisecond.
 */
const MIN = 40;
const MAX = 88;
const MAX_SPAN = 16;

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function combinations(options, index = 0, current = [], output = []) {
  if (index === options.length) {
    const sorted = [...current].sort((a, b) => a - b);
    if (sorted.at(-1) - sorted[0] <= MAX_SPAN) output.push(sorted);
    return output;
  }
  for (const note of options[index]) combinations(options, index + 1, [...current, note], output);
  return output;
}

/**
 * @param {number[]} pitchClasses  Target pitch classes (any octave; only PC matters).
 * @param {number[]} reference     Reference MIDI notes to voice-lead toward
 *                                 (typically the departing chord's `notes`).
 * @returns {number[]}             MIDI notes, one per unique pitch class,
 *                                 chosen to minimize voice motion from `reference`.
 */
export function closestVoicing(pitchClasses, reference) {
  if (!pitchClasses?.length) return [];
  const unique = [...new Set(pitchClasses.map(pitchClassOf))];
  const options = unique.map((pc) => {
    const notes = [];
    for (let midi = MIN; midi <= MAX; midi += 1) if (midi % 12 === pc) notes.push(midi);
    return notes;
  });
  const ref = [...reference].sort((a, b) => a - b);
  let best = null;
  let bestCost = Infinity;
  for (const candidate of combinations(options)) {
    const paired = Math.min(candidate.length, ref.length);
    let cost = 0;
    for (let index = 0; index < paired; index += 1) cost += Math.abs(candidate[index] - ref[index]);
    cost += 0.1 * Math.abs(mean(candidate) - mean(ref));
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best ?? unique.map((pc) => 60 + ((pc - 0 + 12) % 12));
}
