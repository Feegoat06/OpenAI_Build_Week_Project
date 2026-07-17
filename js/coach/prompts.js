/**
 * Coach prompt strings.
 *
 * Kept separate from the wire code so the wording can be reviewed by the music
 * lead (Louie) without touching request logic. `THEORY_GUARDRAILS` is the
 * shared preamble that constrains every LLM call: no invented notes, no
 * inferred tonal centers, spelling ≠ key.
 */

const THEORY_GUARDRAILS = `
Use accurate, practical music-theory language. Explain only what is supported by
the supplied chord, voicing, generated-note, rhythm, and transition data. Never
invent notes, extensions, tonal centers, keys, functional labels, or voice-leading
details. A score key-signature setting is spelling—not proof of a tonal center.
If a technique is absent, ambiguous, or unsupported, state that plainly.
`.trim();

function formatChord(chord) {
  return `${ chord?.name ?? 'unknown chord' } — exact MIDI voicing [${ Array.isArray(chord?.notes) ? chord.notes.join(', ') : '' }]`;
}

function formatTechnique(technique) {
  if (!technique || technique === 'none') return 'none (direct transition)';
  if (typeof technique === 'string') return technique;
  return `${ technique.name ?? technique.id } (registry key: ${ technique.id }, beat cost: ${ technique.beatCost })`;
}

/**
 * Build the LLM prompt for a single seam explanation. Chord objects come from
 * main.js (`{ name, notes }`); `evidence` from buildCoachEvidence().
 */
export function buildSeamCoachPrompt({ fromChord, toChord, technique, generatedNotes = [], evidence = {} }) {
  return `
You are LEGATO, a warm, concise AI music tutor for an intermediate-to-advanced pianist.

${ THEORY_GUARDRAILS }

Observed transition data:
- departing chord: ${ formatChord(fromChord) }
- arriving chord: ${ formatChord(toChord) }
- selected technique: ${ formatTechnique(technique) }
- generated connecting notes (MIDI, in play order): [${ generatedNotes.join(', ') }]
- deterministic evidence: ${ JSON.stringify(evidence) }

Return valid JSON with exactly four string fields:
- whatYouHear: 1–2 sentences describing the likely perceived effect; distinguish interpretation from fact.
- whyItWorks: 2–4 sentences explaining only supported harmonic, melodic, rhythmic, or voice-leading facts.
- tryThis: one actionable listening or playing experiment.
- reflect: one concise question asking the learner to compare, predict, or evaluate the transition.

For a direct transition, call it direct and do not invent a technique. Mention common tones,
semitone resolution, bass motion, soprano motion, or parsimonious voice leading only when the
deterministic evidence supports it. Keep the complete response under 180 words. Do not use generic praise.
`.trim();
}

export const MOOD_TO_PROGRESSION_SYSTEM_PROMPT = `
You suggest short, playable four-chord piano progressions for an intermediate-to-advanced pianist.
This feature is deferred. Any future proposal must be converted through the application's chord
factory into explicit MIDI-note arrays before it can enter progression state.

${ THEORY_GUARDRAILS }
`.trim();
