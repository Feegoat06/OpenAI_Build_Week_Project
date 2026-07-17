/**
 * Duration → notatable pieces + measure layout.
 *
 * `compile()` produces high-level {notes, duration} events; this module turns
 * each event into one or more atomic segments that VexFlow can draw and Tone.js
 * can schedule. Splits across barlines share the parent event's `sourceId` so
 * the renderer can draw a tie (see DATA-MODEL.md §4).
 */

/** Greedy decomposition values (whole, half, quarter, eighth, sixteenth). */
export const STANDARD_DURATIONS = [4, 2, 1, 0.5, 0.25];

/**
 * Greedy largest-first decomposition of `duration` (in quarter-beats) into
 * STANDARD_DURATIONS pieces. Duration is quantized to sixteenths to tame
 * accumulated floating-point drift.
 */
export function decompose(duration) {
  const values = [];
  let remaining = Math.round(duration * 4) / 4;
  for (const value of STANDARD_DURATIONS) {
    while (remaining + 1e-9 >= value) {
      values.push(value);
      remaining = Math.round((remaining - value) * 4) / 4;
    }
  }
  return values;
}

/**
 * Fold an ordered list of `{notes, duration, isTechnique, sourceId, seamIndex}`
 * events into flat `Segment[]` (per DATA-MODEL.md §2.1). An event that crosses
 * a barline is split into pieces, each tagged with the same `sourceId` so the
 * renderer can tie them, and each stamped with `measureIndex` + measure-relative
 * `startBeat` for both the renderer and the audio scheduler to consume.
 */
export function layoutEvents(events, measureBeats) {
  const segments = [];
  let absoluteBeat = 0;
  for (const event of events) {
    let remaining = event.duration;
    while (remaining > 1e-9) {
      const position = absoluteBeat % measureBeats;
      const room = measureBeats - position;
      const chunk = Math.min(remaining, room);
      for (const durationBeats of decompose(chunk)) {
        segments.push({
          notes: [...event.notes], durationBeats, isTechnique: event.isTechnique,
          sourceId: event.sourceId, seamIndex: event.seamIndex,
          measureIndex: Math.floor(absoluteBeat / measureBeats), startBeat: absoluteBeat % measureBeats,
        });
        absoluteBeat += durationBeats;
      }
      remaining = Math.round((remaining - chunk) * 4) / 4;
    }
  }
  return segments;
}
