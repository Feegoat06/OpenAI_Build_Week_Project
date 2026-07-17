/**
 * Serverless coach endpoint (Vercel Function).
 *
 * Reasons this lives on the server, not the client:
 *   - Holds OPENAI_API_KEY (env var). Key never touches the browser.
 *   - Enforces the JSON-schema response format so the client can trust the shape.
 *   - Turns provider errors into stable status codes for the UI to render.
 *
 * Shares two building blocks with the client to avoid drift:
 *   - `buildSeamCoachPrompt` — the actual prompt text.
 *   - `isCoachResponse` — the shape guard for the four educational fields.
 */
import { buildSeamCoachPrompt } from '../js/coach/prompts.js';
import { isCoachResponse } from '../js/coach/coach.js';

const COACH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['whatYouHear', 'whyItWorks', 'tryThis', 'reflect'],
  properties: {
    whatYouHear: { type: 'string' },
    whyItWorks: { type: 'string' },
    tryThis: { type: 'string' },
    reflect: { type: 'string' },
  },
};

function outputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
}

export function parseCoachResponse(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw Object.assign(new Error('The coach returned malformed JSON.'), { status: 502 }); }
  if (!isCoachResponse(parsed)) throw Object.assign(new Error('The coach response did not match the required educational schema.'), { status: 502 });
  return parsed;
}

export async function generateCoachResponse(payload) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('AI coaching is not configured. Add OPENAI_API_KEY on the server to enable explanations.'), { status: 503 });
  const prompt = buildSeamCoachPrompt(payload);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ process.env.OPENAI_API_KEY }` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6',
      input: prompt,
      max_output_tokens: 700,
      text: { format: { type: 'json_schema', name: 'legato_coach', strict: true, schema: COACH_SCHEMA } },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI request failed.'), { status: response.status });
  const text = outputText(data);
  if (!text) throw Object.assign(new Error('OpenAI returned no explanation.'), { status: 502 });
  return parseCoachResponse(text);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    return response.status(200).json({ explanation: await generateCoachResponse(request.body) });
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || 'Coach request failed.' });
  }
}
