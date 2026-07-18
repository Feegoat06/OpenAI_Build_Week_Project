import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceTiedSegments, stopPlayback } from '../js/audio/playback.js';

test('tied notation fragments schedule as one sustained playback event', () => {
  const events = coalesceTiedSegments([
    { notes: [60, 64, 67], durationBeats: 2, sourceId: 'c1', measureIndex: 0, startBeat: 0 },
    { notes: [60, 64, 67], durationBeats: 2, sourceId: 'c1', measureIndex: 0, startBeat: 2 },
    { notes: [60, 64, 67], durationBeats: 4, sourceId: 'c1', measureIndex: 1, startBeat: 0 },
  ], 4);
  assert.equal(events.length, 1);
  assert.equal(events[0].durationBeats, 8);
  assert.equal(events[0].startBeat, 0);
});

test('distinct source material still starts a new playback event', () => {
  const events = coalesceTiedSegments([
    { notes: [60], durationBeats: 1, sourceId: 'c1', measureIndex: 0, startBeat: 0 },
    { notes: [60], durationBeats: 1, sourceId: 's0-0', measureIndex: 0, startBeat: 1 },
  ], 4);
  assert.equal(events.length, 2);
});

test('stopPlayback cancels future audio events on the Tone transport', () => {
  const calls = [];
  const previousWindow = globalThis.window;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.window = {
    Tone: {
      Transport: {
        stop: () => calls.push('stop'),
        cancel: (after) => calls.push(['cancel', after]),
      },
    },
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    stopPlayback();
    assert.deepEqual(calls, ['stop', ['cancel', 0]]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
  }
});
