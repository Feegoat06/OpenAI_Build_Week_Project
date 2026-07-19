import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEditorHash, editorHash } from '../js/router.js';

test('canonical project route and legacy editor route preserve project ids', () => {
  assert.deepEqual(parseEditorHash('#/project/project%20one'), { id: 'project one', legacy: false });
  assert.deepEqual(parseEditorHash('#/edit/old-id'), { id: 'old-id', legacy: true });
  assert.equal(editorHash('project one'), '#/project/project%20one');
});
