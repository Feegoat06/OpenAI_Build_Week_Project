/**
 * The eight transition-technique bodies.
 *
 * Each technique defines what plays inside a seam between two chords. Only the
 * pitch classes / melodic contour are fixed here — final octave placement for
 * block-chord techniques comes from `closestVoicing()` so the connective tissue
 * sits near what's actually sounding. See DATA-MODEL.md §5 for the full spec.
 *
 * A technique never mutates the user's chords. It borrows time from the
 * departing chord's tail (see `availableBeats` in state.js) and its notes are
 * always recomputed by `compile()` — nothing is cached in state.
 */
import { inferChordIdentity } from './chords.js';
import { closestVoicing } from './voicing.js';
import { pitchClassOf } from '../util/midi.js';

/** Registry: keys stored in `progression.seams`; values metadata for the UI + compile(). */
export const TECHNIQUES = Object.freeze({
  passingDim: { name: 'Diatonic passing diminished', beatCost: 1 },
  secondaryDom: { name: 'Secondary dominant', beatCost: 1 },
  tritoneSub: { name: 'Tritone substitution', beatCost: 1 },
  ii_v_i: { name: '2-5-1 insert', beatCost: 2 },
  susPassing: { name: 'Sus chord passing', beatCost: 1 },
  leadingTone: { name: 'Leading tone bass note', beatCost: 0.5 },
  scaleRun: { name: 'Scale run', beatCost: 2 },
  arpBridge: { name: 'Arpeggiated bridge', beatCost: 2 },
});

const INTERVALS = Object.freeze({
  dim7: [0, 3, 6, 9],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
});

function pitchClassesFrom(root, intervals) {
  return intervals.map((interval) => pitchClassOf(root + interval));
}

function assertIntervalFormula(label, root, intervals, expectedSteps) {
  const absolute = intervals.map((interval) => root + interval);
  const steps = absolute.slice(1).map((note, index) => note - absolute[index]);
  if (steps.length !== expectedSteps.length || steps.some((step, index) => step !== expectedSteps[index])) {
    throw new Error(`${ label } interval formula is invalid: expected ${ expectedSteps.join(', ') }, got ${ steps.join(', ') }`);
  }
}

/**
 * Build a single block-chord technique event: assert the interval formula is
 * intact (silent-failure guard), then let closestVoicing pick the octave that
 * sits nearest the reference voicing.
 */
function voicedBlock(label, root, intervals, expectedSteps, reference, duration) {
  assertIntervalFormula(label, root, intervals, expectedSteps);
  return [{ notes: closestVoicing(pitchClassesFrom(root, intervals), reference), duration }];
}

function closestTargetTo(source, targetNotes) {
  return [...targetNotes].sort((a, b) => Math.abs(a - source) - Math.abs(b - source))[0];
}

function subsample(notes, maxNotes) {
  if (notes.length <= maxNotes) return notes;
  if (maxNotes <= 1) return [notes[0]];
  return Array.from({ length: maxNotes }, (_, index) => notes[Math.round(index * (notes.length - 1) / (maxNotes - 1))]);
}

/**
 * Emit one single-note event per pitch, distributing `budget` beats as evenly
 * as possible across sixteenth-note slots. Any remainder is spread over the
 * leading notes so the total exactly equals `budget`.
 */
function noteEvents(notes, budget) {
  const totalUnits = Math.round(budget / 0.25);
  const count = Math.min(notes.length, totalUnits);
  const chosen = subsample(notes, count);
  const baseUnits = Math.floor(totalUnits / count);
  let remainder = totalUnits % count;
  return chosen.map((note) => {
    const units = baseUnits + (remainder-- > 0 ? 1 : 0);
    return { notes: [note], duration: units * 0.25 };
  });
}

/**
 * Produce the connective events that fill a seam.
 *
 * @param {keyof TECHNIQUES} id            Technique key from the registry.
 * @param {{notes: number[]}} fromChord    Departing chord.
 * @param {{notes: number[]}} toChord      Arriving chord (technique targets its root).
 * @param {number[]} reference             Reference voicing for closest-voicing (usually fromChord.notes).
 * @param {number} budget                  Beat budget carved from fromChord's tail.
 * @returns {Array<{notes: number[], duration: number}>}
 */
export function generateTechnique(id, fromChord, toChord, reference, budget) {
  const from = inferChordIdentity(fromChord);
  const to = inferChordIdentity(toChord);
  const target = to.rootPc;
  switch (id) {
    case 'passingDim': {
      const direction = ((target - from.rootPc + 12) % 12) === 2 ? 1 : -1;
      return voicedBlock('Passing diminished', from.rootPc + direction, INTERVALS.dim7, [3, 3, 3], reference, budget);
    }
    case 'secondaryDom': return voicedBlock('Secondary dominant', target + 7, INTERVALS.dom7, [4, 3, 3], reference, budget);
    case 'tritoneSub': return voicedBlock('Tritone substitution', from.rootPc + 6, INTERVALS.dom7, [4, 3, 3], reference, budget);
    case 'ii_v_i': {
      const first = voicedBlock('2-5-1 ii chord', target + 2, INTERVALS.min7, [3, 4, 3], reference, budget / 2)[0];
      const second = voicedBlock('2-5-1 V chord', target + 7, INTERVALS.dom7, [4, 3, 3], first.notes, budget / 2)[0];
      return [first, second];
    }
    case 'susPassing': return voicedBlock('Sus passing', target, INTERVALS.sus4, [5, 2], reference, budget);
    case 'leadingTone': {
      const pc = pitchClassOf(target - 1);
      const note = closestVoicing([pc], reference)[0];
      return [{ notes: [note], duration: budget }];
    }
    case 'scaleRun': {
      const start = Math.max(...fromChord.notes);
      const end = closestTargetTo(start, toChord.notes);
      let notes = [];
      if (Math.abs(end - start) <= 1) notes = [start + (end >= start ? -1 : 1)];
      else {
        const direction = Math.sign(end - start);
        for (let note = start + direction; direction > 0 ? note <= end : note >= end; note += direction) notes.push(note);
      }
      notes = subsample(notes, Math.floor(budget / 0.25));
      return noteEvents(notes, budget);
    }
    case 'arpBridge': {
      const direction = Math.max(...toChord.notes) >= Math.max(...fromChord.notes) ? 1 : -1;
      const ordered = (notes) => [...notes].sort((a, b) => direction * (a - b));
      let notes = [...ordered(fromChord.notes), ...ordered(toChord.notes)];
      notes = subsample(notes, Math.floor(budget / 0.25));
      return noteEvents(notes, budget);
    }
    default: return [];
  }
}
