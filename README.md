# LEGATO

LEGATO is an interactive AI music tutor for pianists. Build exact chord voicings, connect them with a harmonic technique, see and hear the compiled result, then ask why the transition works. The interface uses an editorial “sand hologram” composition-studio direction with Fraunces, Inter, and Space Grotesk.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open `http://localhost:8000`. The app loads VexFlow, Tone.js, and Salamander piano samples from CDNs, so notation/audio need an internet connection on first load.

If port 8000 is already occupied, choose another one:

```bash
PORT=8001 npm start
```

For AI coaching, set the server-only environment variable before starting:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-5.6" # optional default
npm start
```

Never put the key in client code. `server.mjs` serves the local API route; `api/coach.js` is also compatible with a Vercel serverless deployment.

## Architecture

The UI mutates one `progression`. Pure `compile()` turns it into atomic segments with exact pitches and timing. VexFlow notation, Tone.js playback, highlighting, and coach grounding all consume that same segment list. User MIDI voicings are never altered; generated technique material alone uses closest-voicing search. Coach responses are server-validated into `whatYouHear`, `whyItWorks`, `tryThis`, and `reflect` before rendering.

Key areas: `js/state.js` (runtime contract), `js/engine/` (techniques, voice leading, rhythm), `js/notation/`, `js/audio/`, `js/ui/`, and `api/coach.js`.

## Test

```bash
npm test
```

Tests cover seam preservation, validation, all eight registry techniques, user-voicing integrity, generated-register choice, run beat caps, measure-relative timing, tempo and hint independence, coach grounding, schema failures, and API-key isolation.

## Current scope

The first sample intentionally defers drag reordering, free-note chord naming, project storage/import/export, mood generation, accounts, and elaborate particle effects. When an explicit note set does not exactly match a supported quality, technique targeting uses the chord’s lowest note as a deterministic fallback root without adding fields to stored state.
