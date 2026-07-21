import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, isRest, makeChord, makeProgression, makeRest, validateProgression } from '../js/state.js';
import { evaluateTechnique } from '../js/engine/technique-eligibility.js';
import { chordDisplayName, chordSpellingIdentity, formatChordSymbol } from '../js/engine/chords.js';
import { coalesceTiedSegments } from '../js/audio/playback.js';

const settings = { tempo: 100, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' };

test('makeRest creates a silent whole-bar item recognised by isRest', () => {
  const rest = makeRest(2);
  assert.deepEqual(rest.notes, []);
  assert.equal(rest.bars, 2);
  assert.equal(isRest(rest), true);
  assert.equal(isRest(makeChord([60, 64, 67])), false);
});

test('rests compile into empty-note segments that occupy their full duration', () => {
  const chord = makeChord([60, 64, 67]);
  const rest = makeRest(1);
  const after = makeChord([65, 69, 72]);
  const segments = compile(makeProgression({ settings, chords: [chord, rest, after] }));
  const restSegments = segments.filter((segment) => segment.sourceId === rest.id);
  assert.equal(restSegments.length, 1);
  assert.deepEqual(restSegments[0].notes, []);
  assert.equal(restSegments[0].durationBeats, 4);
  assert.equal(restSegments[0].measureIndex, 1);
  // The following chord still lands on its own measure.
  assert.equal(segments.find((segment) => segment.sourceId === after.id).measureIndex, 2);
});

test('techniques are ineligible on either side of a rest', () => {
  const chord = makeChord([60, 64, 67]);
  const rest = makeRest(1);
  assert.equal(evaluateTechnique('secondaryDom', chord, rest).valid, false);
  assert.equal(evaluateTechnique('secondaryDom', rest, chord).valid, false);
});

test('a rest compiles silently even when a seam requests a technique', () => {
  const chord = makeChord([67, 71, 74, 77]); // G7, tritoneSub-eligible toward C
  const rest = makeRest(1);
  const segments = compile(makeProgression({ settings, chords: [chord, rest], seams: ['tritoneSub'] }));
  assert.equal(segments.some((segment) => segment.isTechnique), false);
});

test('display helpers name rests without crashing', () => {
  const rest = makeRest(1);
  assert.equal(chordDisplayName(rest), 'Rest');
  assert.equal(formatChordSymbol(rest).plain, 'Rest');
  assert.equal(formatChordSymbol(rest).root, '');
  assert.equal(chordSpellingIdentity(rest), null);
});

test('validation round-trips rest items and still rejects broken chords', () => {
  const progression = makeProgression({ settings, chords: [makeChord([60, 64, 67]), makeRest(1.5)] });
  const result = validateProgression(JSON.parse(JSON.stringify(progression)));
  assert.equal(result.ok, true);
  assert.equal(isRest(result.progression.chords[1]), true);
  assert.equal(result.progression.chords[1].bars, 1.5);
  // A non-rest chord with no notes is still invalid.
  const broken = makeProgression({ settings, chords: [{ id: 'x', notes: [], bars: 1 }] });
  assert.equal(validateProgression(broken).ok, false);
});

test('a multi-bar rest coalesces into one silent playback event', () => {
  const rest = makeRest(2);
  const segments = compile(makeProgression({ settings, chords: [rest] }));
  const events = coalesceTiedSegments(segments, 4);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].notes, []);
  assert.equal(events[0].durationBeats, 8);
});
