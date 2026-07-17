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
