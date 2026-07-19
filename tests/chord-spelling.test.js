import test from 'node:test';
import assert from 'node:assert/strict';
import { chordAwareVexKey, vexKeyForNote, chordSpellingIdentity, chordToneName } from '../js/engine/chords.js';

test('G♯ major spells its third as B♯, not C', () => {
  // G# = MIDI 68, B# = MIDI 72 (enharmonic to C5), D# = MIDI 75.
  const identity = { rootPc: 8, quality: 'Major' };
  assert.equal(chordAwareVexKey(68, identity, 0), 'g#/4');
  assert.equal(chordAwareVexKey(72, identity, 0), 'b#/4');
  assert.equal(chordAwareVexKey(75, identity, 0), 'd#/5');
});

test('a G♯/A♭-rooted major in a flat key spells around A♭ (A♭·C·E♭)', () => {
  // Same pitch class 8, but flat-key context picks the A♭ letter for the root
  // so the chord tones fall on their natural letters.
  const identity = { rootPc: 8, quality: 'Major' };
  assert.equal(chordAwareVexKey(68, identity, -2), 'ab/4');
  assert.equal(chordAwareVexKey(72, identity, -2), 'c/5');
  assert.equal(chordAwareVexKey(75, identity, -2), 'eb/5');
});

test('D♯7 gets an F double-sharp for its third', () => {
  // D#7 = D#, F##, A#, C#. F## sounds like G (MIDI 67).
  const identity = { rootPc: 3, quality: 'Dom7' };
  assert.equal(chordAwareVexKey(63, identity, 0), 'd#/4');
  assert.equal(chordAwareVexKey(67, identity, 0), 'f##/4');
  assert.equal(chordAwareVexKey(70, identity, 0), 'a#/4');
  assert.equal(chordAwareVexKey(73, identity, 0), 'c#/5');
});

test('unknown quality falls through', () => {
  assert.equal(chordAwareVexKey(60, { rootPc: 0, quality: 'BogusQ' }, 0), null);
  assert.equal(chordAwareVexKey(60, null, 0), null);
});

test('passing tones (not in the chord) fall back to key-based spelling', () => {
  const identity = { rootPc: 0, quality: 'Major' }; // C major = C E G
  // MIDI 61 = C#, not in C major triad — should fall back to plain vexKey.
  assert.equal(chordAwareVexKey(61, identity, 0), null);
  assert.equal(vexKeyForNote(61, identity, 0), 'c#/4');
  // In flat context it'd prefer Db instead.
  assert.equal(vexKeyForNote(61, identity, -2), 'db/4');
});

test('chordSpellingIdentity prefers the display hint', () => {
  const chord = { notes: [68, 72, 75], hint: { rootMidi: 68, quality: 'Major' } };
  assert.deepEqual(chordSpellingIdentity(chord), { rootPc: 8, quality: 'Major' });
});

test('chordSpellingIdentity falls back to detection when no hint is set', () => {
  // C major triad in root position, no hint.
  const identity = chordSpellingIdentity({ notes: [60, 64, 67] });
  assert.deepEqual(identity, { rootPc: 0, quality: 'Major' });
});

test('chordSpellingIdentity returns null when notes do not form a recognised chord', () => {
  assert.equal(chordSpellingIdentity({ notes: [60, 61] }), null);
});

test('chordToneName renders a proper B♯ for MIDI 72 inside G♯ major', () => {
  const identity = { rootPc: 8, quality: 'Major' };
  assert.equal(chordToneName(72, identity, 0), 'B♯4');
});
