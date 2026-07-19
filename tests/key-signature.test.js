import test from 'node:test';
import assert from 'node:assert/strict';
import { accidentalFor } from '../js/engine/key-signature.js';

test('spelling that matches the key signature needs no accidental', () => {
  // D major: F#, C# are in the signature.
  assert.equal(accidentalFor('f#/4', 2), '');
  assert.equal(accidentalFor('c#/4', 2), '');
  // Bb major: Bb, Eb are in the signature.
  assert.equal(accidentalFor('bb/3', -2), '');
  assert.equal(accidentalFor('eb/4', -2), '');
});

test('a natural letter that the key signature would alter needs a natural sign', () => {
  // F natural in D major must be explicitly naturalized.
  assert.equal(accidentalFor('f/4', 2), 'n');
  // B natural in Bb major.
  assert.equal(accidentalFor('b/3', -2), 'n');
});

test('a note whose spelled accidental disagrees with the key signature gets that accidental', () => {
  // C# in C major → explicit #.
  assert.equal(accidentalFor('c#/4', 0), '#');
  // Ab in G major (which has F#, no flats) → explicit b.
  assert.equal(accidentalFor('ab/4', 1), 'b');
});

test('C major leaves natural notes unmarked', () => {
  assert.equal(accidentalFor('c/4', 0), '');
  assert.equal(accidentalFor('f/4', 0), '');
  assert.equal(accidentalFor('b/3', 0), '');
});
