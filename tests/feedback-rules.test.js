import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProgression } from '../js/state.js';
import { feedbackForChange } from '../js/coach/feedback-rules.js';

test('local settings feedback is deterministic and avoids tonal-center claims', () => {
  const progression = makeProgression();
  progression.settings.tempo = 64;
  assert.match(feedbackForChange({ type: 'tempo' }, progression), /64 BPM/);
  assert.match(feedbackForChange({ type: 'key' }, progression), /not.*tonal|tonal claims/i);
});
