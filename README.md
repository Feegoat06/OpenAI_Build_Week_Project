# Legato

Legato is an AI music tutor that helps learners build chord progressions, hear
how transitions work, and understand the theory behind them.

## What it does

- Build chords with root, quality, inversion, octave, and duration controls.
- Render the progression as staff notation and play it with a piano sound.
- Choose a transition technique between any two chords.
- Ask the AI coach to explain what a selected transition does and why.
- Reorder chords, adjust tempo/time signature/clef, and save or move projects
  using local storage plus JSON import/export.

## Local development

This is a no-build-step ES module app. Do not open `index.html` directly,
because browser module imports are blocked under `file://` URLs.

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Architecture

The progression model is the source of truth. UI changes update that model,
then `compile()` creates one ordered segment list for notation, playback, and
the active-bar animation. This keeps what the learner sees and hears aligned.

```text
progression → compile() → segment list → notation
                                      → audio
                                      → bar playback effect
```

## Stack

- Vanilla HTML, CSS, and JavaScript ES modules
- VexFlow for notation
- Tone.js with piano samples for audio
- SortableJS for chord reordering
- OpenAI via a Vercel serverless coach endpoint
- localStorage plus versioned JSON import/export for projects

## Demo material

The curated examples live in `js/data/demo-progressions.js`. Coaching prompt
content lives in `js/coach/prompts.js`; the server endpoint supplies the actual
model request and keeps API credentials out of the client.

## Team

- Eric — music engine, state model, audio
- Fee — UI, notation, effects, deployment, coach endpoint
- Louie — music examples, coaching content, documentation, demo narration
