import test from 'node:test';
import assert from 'node:assert/strict';
import { modeForComposerSubmission } from '../js/ui/tutor-chat.js';

test('a manually submitted Tutor message always uses conversational Ask mode', () => {
  assert.deepEqual(
    ['explain', 'suggest', 'ask'].map((mode) => modeForComposerSubmission(mode)),
    ['ask', 'ask', 'ask'],
  );
});
