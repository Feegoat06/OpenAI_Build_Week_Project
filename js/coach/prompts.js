const THEORY_GUARDRAILS = `
Use accurate, practical music-theory language. Explain only what is supported by
the supplied chord and transition data; never invent notes, extensions, keys,
or voice-leading details. If a technique is absent or unclear, say so plainly
rather than guessing.
`.trim();

function formatChord(chord) {
  if (typeof chord === 'string') return chord;

  const name = chord?.name ?? 'unknown chord';
  const notes = Array.isArray(chord?.notes) && chord.notes.length
    ? ` — voiced as ${chord.notes.join(', ')}`
    : '';

  return `${name}${notes}`;
}

function formatTechnique(technique) {
  if (!technique || technique === 'none') return 'none (direct transition)';
  if (typeof technique === 'string') return technique;

  return [technique.name ?? technique.id, technique.description]
    .filter(Boolean)
    .join(' — ');
}

/**
 * Builds the server-side coaching prompt for one selected seam. Chords may be
 * names during early integration, or { name, notes } objects once compile()
 * exposes the actual voiced notes. The latter lets the coach ground any
 * voice-leading explanation in what the learner hears.
 */
export function buildSeamCoachPrompt({ fromChord, toChord, technique, generatedNotes = [] }) {
  const isDirectTransition = !technique || technique === 'none';

  return `
You are Legato, a warm and concise AI music tutor helping a learner understand
one harmonic transition in a piano progression.

${THEORY_GUARDRAILS}

Transition:
- departing chord: ${formatChord(fromChord)}
- arriving chord: ${formatChord(toChord)}
- selected technique: ${formatTechnique(technique)}
- generated connecting notes (MIDI): ${generatedNotes.length ? generatedNotes.join(', ') : 'none'}

Respond in exactly these three labeled parts:
1. What you hear (1–2 sentences): describe the musical effect in plain language.
2. Why it works (2–3 sentences): explain the relevant harmonic, melodic, rhythmic,
   or voice-leading idea accurately. Reference the supplied notes only when they
   support the explanation.
3. Try this (one actionable sentence): give a small listening or playing experiment.

${isDirectTransition ? 'For this direct transition, explain the effect of the jump; discuss shared tones or the character of the leap only if the supplied voicings support it.' : ''}

Keep the total response under 150 words. Be encouraging but specific; avoid
generic praise and avoid jargon unless you briefly make it understandable.
`.trim();
}

export const MOOD_TO_PROGRESSION_SYSTEM_PROMPT = `
You suggest short, playable four-chord piano progressions for a beginner.
Return valid JSON only, with keys: title, moodExplanation, and chords.
chords must be an array of four objects with rootMidi (integer), quality (string),
bars (integer 1 or 2), and inversion (integer 0, 1, or 2). Use only qualities
supported by the app's chord table. Prefer clear voice leading, and explain the
emotional arc in moodExplanation.

${THEORY_GUARDRAILS}
`.trim();
