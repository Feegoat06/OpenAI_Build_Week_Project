/**
 * Tone.js audio playback.
 *
 * Two consumption modes:
 *   - `playSegments(compileOutput, …)` schedules the whole progression
 *     against Tone.Transport, feeding a per-measure callback so the score can
 *     highlight the bar currently sounding.
 *   - `playNote` / `playChord` fire single events NOW. Used by the piano modal
 *     for click-to-preview (per-key audio + the preview panel's play button).
 *
 * All modes share one lazily-built Salamander piano sampler so the samples
 * only download once per session. The sampler must be created and
 * `Tone.start()` must have been called in response to a user gesture (the
 * browser's audio-context policy) — hence the `await ready()` on every entry.
 */
let sampler;
let stopTimers = [];

function getSampler() {
  if (!window.Tone) throw new Error('Tone.js is not available.');
  if (!sampler) {
    sampler = new Tone.Sampler({
      urls: { A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3' },
      release: 1, baseUrl: 'https://tonejs.github.io/audio/salamander/',
    }).toDestination();
  }
  return sampler;
}

const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function sameNotes(first, second) {
  return first.length === second.length && first.every((note, index) => note === second[index]);
}

/**
 * Coalesce contiguous tied fragments into one sustained playback event.
 * `layoutEvents` splits sustained notes into notatable pieces at barlines; for
 * audio we want to hear one continuous note, so we merge adjacent pieces that
 * share a sourceId, have identical notes, and touch in time.
 */
export function coalesceTiedSegments(segments, measureLength) {
  const events = [];
  for (const segment of segments) {
    const startBeat = segment.measureIndex * measureLength + segment.startBeat;
    const previous = events.at(-1);
    const previousEnd = previous ? previous.startBeat + previous.durationBeats : null;
    if (previous && previous.sourceId === segment.sourceId && sameNotes(previous.notes, segment.notes)
      && Math.abs(previousEnd - startBeat) < 1e-9) {
      previous.durationBeats += segment.durationBeats;
      continue;
    }
    events.push({ ...segment, notes: [...segment.notes], startBeat });
  }
  return events;
}

/**
 * Schedule an entire compiled progression against Tone.Transport.
 *
 * @param {Segment[]} segments      Output of compile(); notation reads from the same list.
 * @param {Settings}  settings      Progression settings (tempo, timeSig).
 * @param {(measureIndex: number | null) => void} onMeasure  Fires when the active measure changes; called with `null` when playback ends.
 * @param {() => void} [onStop]     Fires once after the final segment stops sounding.
 *
 * Cancels any in-flight schedule before starting the new one so overlapping
 * `Play` clicks don't stack.
 */
export async function playSegments(segments, settings, onMeasure, onStop) {
  stopPlayback();
  await Tone.start();
  const instrument = getSampler();
  await Tone.loaded();
  const secondsPerBeat = 60 / settings.tempo;
  const measureLength = settings.timeSig.num * 4 / settings.timeSig.den;
  const now = Tone.now() + 0.08;
  let end = 0;
  let lastMeasure = -1;
  for (const event of coalesceTiedSegments(segments, measureLength)) {
    const at = event.startBeat * secondsPerBeat;
    instrument.triggerAttackRelease(event.notes.map(frequency), event.durationBeats * secondsPerBeat * 0.96, now + at);
    end = Math.max(end, at + event.durationBeats * secondsPerBeat);
    if (event.measureIndex !== lastMeasure) {
      stopTimers.push(setTimeout(() => onMeasure(event.measureIndex), at * 1000));
      lastMeasure = event.measureIndex;
    }
  }
  stopTimers.push(setTimeout(() => { onMeasure(null); onStop?.(); }, (end + 0.1) * 1000));
}

export function stopPlayback() {
  stopTimers.forEach(clearTimeout);
  stopTimers = [];
  sampler?.releaseAll();
}

/** Ensure the audio context is started + samples are loaded before triggering. */
async function ready() {
  await Tone.start();
  const instrument = getSampler();
  await Tone.loaded();
  return instrument;
}

/** Fire a single note immediately. Used by the piano modal per-key preview. */
export async function playNote(midi, seconds = 0.45) {
  const instrument = await ready();
  instrument.triggerAttackRelease(frequency(midi), seconds);
}

/** Fire a chord (multiple notes) immediately. Used by the preview panel's play button and sheet click. */
export async function playChord(midis, seconds = 1.2) {
  if (!midis?.length) return;
  const instrument = await ready();
  instrument.triggerAttackRelease(midis.map(frequency), seconds);
}
