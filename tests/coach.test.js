import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSeamCoachPrompt } from '../js/coach/prompts.js';
import { parseCoachResponse } from '../api/coach.js';

const base = { fromChord: { name: 'C Major', notes: [60, 64, 67] }, toChord: { name: 'F Major', notes: [65, 69, 72] }, generatedNotes: [60, 64, 67, 70], evidence: { commonPitchClasses: [0, 5] } };

test('coach prompt includes exact voicings and generated notes', () => {
  const prompt = buildSeamCoachPrompt({ ...base, technique: { id: 'secondaryDom', name: 'Secondary dominant', beatCost: 1 } });
  assert.match(prompt, /\[60, 64, 67\]/); assert.match(prompt, /\[65, 69, 72\]/); assert.match(prompt, /\[60, 64, 67, 70\]/);
});

test('coach prompt forbids key inference and identifies direct transitions', () => {
  const prompt = buildSeamCoachPrompt({ ...base, technique: 'none', generatedNotes: [] });
  assert.match(prompt, /key-signature setting is spelling—not proof/i); assert.match(prompt, /none \(direct transition\)/); assert.match(prompt, /do not invent a technique/i);
});

test('invalid coach JSON produces controlled errors', () => {
  assert.throws(() => parseCoachResponse('not json'), /malformed JSON/);
  assert.throws(() => parseCoachResponse('{"whatYouHear":"x"}'), /required educational schema/);
});

test('client JavaScript contains no API key credential reference', async () => {
  const clientFiles = ['js/main.js', 'js/coach/coach.js', 'js/coach/prompts.js', 'js/ui/piano-modal.js'];
  const contents = await Promise.all(clientFiles.map((path) => readFile(new URL(`../${ path }`, import.meta.url), 'utf8')));
  assert.equal(contents.some((content) => content.includes('OPENAI_API_KEY')), false);
});
