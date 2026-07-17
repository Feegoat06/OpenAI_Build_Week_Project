import { inferChordIdentity } from './chords.js';
import { closestVoicing } from './voicing.js';

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
  return intervals.map((interval) => (root + interval) % 12);
}

function assertIntervalFormula(label, root, intervals, expectedSteps) {
  const absolute = intervals.map((interval) => root + interval);
  const steps = absolute.slice(1).map((note, index) => note - absolute[index]);
  if (steps.length !== expectedSteps.length || steps.some((step, index) => step !== expectedSteps[index])) {
    throw new Error(`${label} interval formula is invalid: expected ${expectedSteps.join(', ')}, got ${steps.join(', ')}`);
  }
}

function voicedBlock(label, root, intervals, expectedSteps, reference, duration) {
  // Assert the source formula before closest-voicing chooses octave placement.
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
      const pc = (target + 11) % 12;
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
