/**
 * Client-side coach wire protocol. Kept isolated from prompt authoring
 * (prompts.js) and evidence extraction (evidence.js) so each layer is testable.
 * The server endpoint is /api/coach.js — the OpenAI key never touches the
 * browser.
 */

/** Schema guard for the coach's four-field JSON response. Shared with api/coach.js. */
export function isCoachResponse(value) {
  const keys = ['whatYouHear', 'whyItWorks', 'tryThis', 'reflect'];
  return Boolean(value && typeof value === 'object'
    && Object.keys(value).length === keys.length
    && keys.every((key) => typeof value[key] === 'string' && value[key].trim().length > 0));
}

export function isReviewResponse(value) {
  const allowedKinds = new Set(['tempo', 'key', 'clef', 'meter', 'chordBeats', 'chordVoicing', 'seamTechnique']);
  return Boolean(value && typeof value === 'object' && typeof value.overview === 'string'
    && Array.isArray(value.suggestions) && value.suggestions.every((suggestion) => suggestion
      && typeof suggestion.id === 'string' && typeof suggestion.title === 'string'
      && typeof suggestion.rationale === 'string' && Array.isArray(suggestion.changes)
      && suggestion.changes.every((change) => allowedKinds.has(change?.kind)
        && Number.isInteger(change.targetIndex)
        && (change.numberValue == null || Number.isFinite(change.numberValue))
        && (change.stringValue == null || typeof change.stringValue === 'string')
        && Array.isArray(change.notesValue))));
}

/**
 * POST the seam payload to /api/coach.js and validate the response.
 * `signal` lets the caller abort (main.js uses a 20s AbortController timeout).
 * Any non-200 or schema-invalid response throws — the caller renders an error.
 */
export async function requestCoach(payload, { signal } = {}) {
  const response = await fetch('/api/coach.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The coach could not respond.');
  if (!isCoachResponse(data.explanation)) throw new Error('The coach returned an invalid response.');
  return data.explanation;
}

export async function requestProgressionReview(payload, { signal } = {}) {
  const response = await fetch('/api/coach.js', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, intent: 'progression-review' }), signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'LEGATO could not review the progression.');
  if (!isReviewResponse(data.explanation)) throw new Error('LEGATO returned an invalid review.');
  return data.explanation;
}
