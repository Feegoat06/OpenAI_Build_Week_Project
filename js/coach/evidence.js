/**
 * Deterministic facts that ground the coach's LLM response.
 *
 * The rule (see docs/AGENTS.md §8): the coach must not invent notes or
 * relationships. So we pre-compute — in code — every claim it's allowed to
 * make about a seam: common tones, exact common MIDI notes, bass and soprano
 * motion in semitones, and the actual generated events. The prompt then just
 * asks the model to explain these facts pedagogically, not rediscover them.
 */
import { pitchClassOf } from '../util/midi.js';

function pitchClasses(notes) {
  return [...new Set(notes.map(pitchClassOf))].sort((a, b) => a - b);
}

export function buildCoachEvidence(progression, segments, seamIndex) {
  const from = progression.chords[seamIndex];
  const to = progression.chords[seamIndex + 1];
  const fromPcs = pitchClasses(from.notes);
  const toPcs = pitchClasses(to.notes);
  const generated = segments.filter((segment) => segment.seamIndex === seamIndex);
  // A rest on either side has no voices, so motion facts are meaningless.
  const bothSound = from.notes.length > 0 && to.notes.length > 0;
  return {
    commonPitchClasses: fromPcs.filter((pc) => toPcs.includes(pc)),
    exactCommonMidiNotes: from.notes.filter((note) => to.notes.includes(note)),
    bassMotionSemitones: bothSound ? Math.min(...to.notes) - Math.min(...from.notes) : null,
    sopranoMotionSemitones: bothSound ? Math.max(...to.notes) - Math.max(...from.notes) : null,
    generatedEvents: generated.map((segment) => ({ notes: segment.notes, durationBeats: segment.durationBeats })),
    generatedTotalBeats: generated.reduce((sum, segment) => sum + segment.durationBeats, 0),
  };
}
