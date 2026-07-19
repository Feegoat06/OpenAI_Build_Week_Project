import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChord, makeProgression } from '../js/state.js';
import { normalizeReview, selectedChanges, reviewPreviews } from '../js/coach/review.js';
import { isReviewResponse } from '../js/coach/coach.js';
import { buildProgressionReviewPrompt } from '../js/coach/prompts.js';

const progression = makeProgression({
  chords: [makeChord([60, 64, 67]), makeChord([65, 69, 72])],
  seams: [null],
});

const raw = {
  overview: 'A grounded experiment.',
  suggestions: [{
    id: 'tempo', title: 'Give it more room', rationale: 'A slower tempo changes the perceived space.',
    changes: [{ kind: 'tempo', targetIndex: -1, numberValue: 84, stringValue: null, notesValue: [] }],
  }],
};

test('review response validates and normalizes executable changes', () => {
  assert.equal(isReviewResponse(raw), true);
  const normalized = normalizeReview(raw, progression);
  assert.deepEqual(selectedChanges(normalized, [0]), [{ kind: 'tempo', value: 84 }]);
  assert.match(reviewPreviews(normalized, progression)[0], /100 → 84 BPM/);
});

test('review drops invalid MIDI targets and conflicting targets', () => {
  const invalid = structuredClone(raw);
  invalid.suggestions.push({ id: 'bad', title: 'Bad', rationale: 'Bad', changes: [{ kind: 'chordVoicing', targetIndex: 8, numberValue: null, stringValue: null, notesValue: [999] }] });
  invalid.suggestions.push({ id: 'conflict', title: 'Conflict', rationale: 'Conflict', changes: [{ kind: 'tempo', targetIndex: -1, numberValue: 120, stringValue: null, notesValue: [] }] });
  const normalized = normalizeReview(invalid, progression);
  assert.equal(normalized.suggestions.length, 1);
});

test('progression review prompt preserves key-signature guardrail', () => {
  const prompt = buildProgressionReviewPrompt({ progression, segments: [], chordLabels: [], evidenceBySeam: [] });
  assert.match(prompt, /not proof of tonic/i);
  assert.match(prompt, /exact user material/i);
});
