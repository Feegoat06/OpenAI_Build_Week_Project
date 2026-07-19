import test from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../js/ui/icons.js';

test('every registered UI icon renders SVG markup', () => {
  const names = ['plus', 'minus', 'close', 'edit', 'rename', 'duplicate', 'export', 'trash', 'play', 'pause', 'stop', 'chevronDown', 'chevronUp', 'arrowRight'];
  for (const name of names) {
    assert.match(icon(name), new RegExp(`data-icon="${ name }"`));
  }
});
