/**
 * Which techniques are theoretically valid between two chords.
 *
 * Some techniques only make musical sense in specific contexts (e.g. a passing
 * diminished chord needs whole-step root motion). This module encodes those
 * theoretical constraints so the seam picker can grey out inapplicable options
 * and compile() can decline to insert them.
 *
 * NOTE: eligibility is theoretical only. The beat-budget check (whether the
 * departing chord has enough tail to borrow) is applied separately by the UI
 * and by compile(), because it depends on `chord.bars` and the current meter.
 */
import { inferChordIdentity } from './chords.js';
import { TECHNIQUES } from './techniques.js';
import { pitchClassOf } from '../util/midi.js';

function intervalUp(fromRoot, toRoot) {
  return pitchClassOf(toRoot - fromRoot);
}

function circularDistance(a, b) {
  const up = intervalUp(a, b);
  return Math.min(up, 12 - up);
}

/**
 * Theoretical eligibility only. Beat-budget filtering is applied by the UI and
 * compile() separately because it depends on the departing chord duration.
 * inferChordIdentity deliberately falls back to the bass note for free-note
 * input, so root-motion techniques continue to work on explicit one-note or
 * otherwise unlabelled user voicings.
 */
export function evaluateTechnique(id, fromChord, toChord) {
  if (!fromChord.notes.length || !toChord.notes.length) {
    return { id, valid: false, reason: 'a rest cannot carry a transition' };
  }
  const from = inferChordIdentity(fromChord);
  const to = inferChordIdentity(toChord);

  switch (id) {
    case 'passingDim': {
      if (circularDistance(from.rootPc, to.rootPc) !== 2) {
        return { id, valid: false, reason: 'requires whole-step root motion between the departure and arrival chords' };
      }
      return { id, valid: true, reason: '' };
    }
    case 'tritoneSub':
      if (from.quality !== 'Dom7') return { id, valid: false, reason: 'the departure chord is not a dominant 7th chord' };
      if (intervalUp(from.rootPc, to.rootPc) !== 5) return { id, valid: false, reason: 'requires the dominant root to resolve up a fourth into the arrival chord' };
      return { id, valid: true, reason: '' };
    case 'leadingTone':
      if (from.rootPc === (to.rootPc + 11) % 12) return { id, valid: false, reason: 'the departure root is already the arrival chord’s leading tone' };
      return { id, valid: true, reason: '' };
    case 'scaleRun':
      if (circularDistance(from.rootPc, to.rootPc) < 3) return { id, valid: false, reason: 'requires at least three semitones of root motion to contain a real passing tone' };
      return { id, valid: true, reason: '' };
    case 'secondaryDom':
    case 'ii_v_i':
    case 'susPassing':
    case 'arpBridge':
      return { id, valid: true, reason: '' };
    default:
      return { id, valid: false, reason: 'unknown technique' };
  }
}

export function evaluateAllTechniques(fromChord, toChord) {
  return Object.keys(TECHNIQUES).map((id) => ({ ...TECHNIQUES[id], ...evaluateTechnique(id, fromChord, toChord) }));
}

export function getAvailableTechniques(fromChord, toChord) {
  return evaluateAllTechniques(fromChord, toChord).filter((technique) => technique.valid);
}
