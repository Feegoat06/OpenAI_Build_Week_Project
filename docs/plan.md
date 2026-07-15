# Legato - OpenAI Build Week Plan

**Team:** Eric (music + code), Fee (code), Louie (music, light code)

**Deadline:** Tuesday, July 21 at 5:00 PM PT (= 8:00 PM ET our time).

**Target: submit Monday night, keep Tuesday as pure buffer.**

**Track:** Education (AI music tutor)

---

## 1. TL;DR - what the expanded feature list changes

The new features do **not** change the core stack. They add two small things (a drag-reorder library and browser-based project storage). The big picture holds: a vanilla, no-build-step web app with a thin GPT-5.6 coaching layer, deployed on Vercel.

**Decisions baked into this plan**:

- **User login is cut. Cross-device is handled by Import/Export instead.** Multiple named projects live in `localStorage` on each device, and an **Export** button downloads a project (or all of them) as a JSON file that an **Import** button on another device reads back in. This is the whole "switch between devices" story with no accounts, no database, no cloud, no backend beyond the one GPT proxy.
- **Manual note-placement on the staff is cut.** The piano modal already covers note input; click-to-place is high-effort, low-demo-value.
- **The MuseScore-style cursor is cut, replaced by bar-playback particles.** Instead of a gliding line, the currently-playing bar lights up with a particle/glow effect (Fee's idea). This fits the hologram aesthetic far better than a line would, and bar-level position is easier to compute than note-level. The underlying timing map is the same work either way - only the *output* changes from a line to particles.
- **"Import jazz standards" is merged with "demo progressions."** Instead of parsing real files, we ship a small hardcoded set of 4-5 famous progressions as a "Load example" dropdown. This doubles as our demo material and Louie's deliverable.
- **A chord is a set of notes, not a (root, quality, inversion) recipe.** The piano modal writes an explicit `notes` array; the chord name is *derived*, not stored. This gives users full voicing/octave/doubling freedom and makes "never re-voiced" trivially true (what's stored is what plays). A display-only `hint` set by the quality-assisted input path keeps the common case named without leaning on the detector. Full rationale + field-by-field meaning live in [`docs/data-model.md`](./data-model.md) - that doc is now the canonical contract, this plan just references it.

---

## 2. Feature priority tiers

Everything below the line is genuinely optional. If we fall behind, we cut from the bottom up - and we decide that *early*, not at 2 AM on Monday.

### Must-have (the demo spine)
- Build a chord via the piano modal - **quality-assisted note selection** (pick a quality -> its pitch classes highlight across the keyboard, a default voicing auto-selects, then toggle individual notes for the octave/doubling/inversion you want). Writes an explicit `notes` array + a display `hint`.
- Render the progression as real notation (VexFlow)
- Audio playback on a real piano sample (Tone.js)
- Pick a transition technique per seam and hear/see it applied
- Score settings: tempo (slider), time signature, **key signature**, clef
- **GPT-5.6 "explain-this-seam"** - the pedagogical heart
- Drag to reorder chords
- Bar-playback particle indicator (the current bar lights up as it plays)

### Should-have
- **Free note selection + chord detection.** The modal's second mode: click any notes, `detect.js` names them live (Logic-Pro-X style). Also the fallback namer when a chord's notes drift off its `hint`. Kept in should-have because the quality-assisted path + `hint` already names the spine without it - detection is strictly *additive*, so if its ranking is shaky (the classic C6-vs-Am7 ambiguity) a should-have degrades gracefully instead of the spine breaking on camera.
- "Load example" progression dropdown (the merged jazz-standards feature)
- **Project manager:** multiple named projects in `localStorage` + Import/Export JSON (cross-device)
- `mood -> progression` GPT feature ("something wistful that resolves hopefully")
- Ambient particles + note fade-in cascade (the hologram aesthetic)

### Cut / stretch only
- Fancier bar-particle effects (beyond a basic glow-per-bar)
- Manual note placement on the staff - **cut**
- Real user accounts / cloud sync - **cut** (Import/Export replaces it)

---

## 3. Final stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS, **ES modules** | No build step; Codex regenerates cleanly; multiple files for branching |
| Notation | VexFlow 4.2.2 (CDN) | Already in spec |
| Audio | Tone.js 14.8.49 (CDN) | Already in spec, Salamander piano samples |
| Drag reorder | **SortableJS** (CDN) | Hand-rolled HTML5 drag-and-drop is painful; this is 3 lines |
| Saving | **`localStorage`** (multiple projects) + JSON **Import/Export** | Save many projects with zero backend; move them across devices via file |
| GPT proxy | **One Vercel serverless function** (`/api/coach.js`) | Holds the OpenAI key server-side; frontend can't expose a key |
| Hosting | **Vercel** (static site + function, one deploy) | Same repo, `git push` redeploys everything |
| Version control | GitHub | Required for submission; Vercel deploys from it |
| AI (build) | Codex + GPT-5.6, one main session | Needed for the `/feedback` session ID |

**Dev gotcha to internalize on day one:** ES module `import`s fail over `file://` (CORS). Do **not** double-click `index.html`. Run a local static server:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
(Or use the VS Code "Live Server" extension.) This is a non-issue on Vercel.

---

## 4. Architecture - the linchpin (read this before you touch a branch)

Everything works if we get **one** thing right: a single shared data model, and **one `compile()` function** that both the notation and the audio consume. Lock this interface tonight so three people on three branches build against a stable shape.

### The state model (single source of truth, `state.js`)

Types, factories, and the full contract are committed in `js/state.js`; prose and worked examples in [`docs/data-model.md`](./data-model.md). The shape:

```js
progression = {
  settings: { tempo: 100, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
  chords: [
    // the notes ARE the chord - NEVER re-voiced (what's stored is what plays).
    // hint is DISPLAY-ONLY (row name); compile/audio/render never read it.
    { id, notes: [60, 64, 67], bars: 1, hint?: { rootMidi, quality } }
  ],
  seams: [ /* techniqueId | null, length = chords.length - 1 */ ]
}
```

- `settings.timeSig` is **structural** now (a `{num, den}` pair, not a single number): measure length in quarter-beats = `num * 4 / den`. Simple meters (3/4, 5/4, 7/4...) are free; compound-meter *notation* (dotted values + triple beaming) is a **stretch**, though compound meters already *play* correctly.
- `settings.key` is the circle-of-fifths integer (-7..+7, sharps +, flats -). **Spelling only** - it picks sharp-vs-flat when a MIDI number becomes a VexFlow keystring, keeping diatonic notes clean and letting the chromatic technique chords carry the accidentals. Never touches audio or voice-leading.
- `seams` stores technique **keys**, never computed notes (voice-leading is contextual, so notes are always recomputed). Upshot: fix a technique's math once and every saved project upgrades on the next `compile()`. Unknown key -> treat as `null` + warn, never throw.

The UI never mutates notation or audio directly. It mutates `progression`, then fires one `rerender()`. Notation and audio both subscribe. This decoupling is exactly what keeps Fee's UI branch and Eric's engine branch from colliding.

### One compile, two consumers

```
progression  ->  compile()  ->  segmentList  ->  notation.render()
                                            \->  audio.play()
                                            \->  bar-playback timing map
```

`compile(progression)` is a **pure function** returning an ordered list of segments:
```js
segment = { notes:[midi...], durationBeats, isTechnique, sourceId, seamIndex, measureIndex, startBeat }
```
- It runs voice-leading on the auto-generated technique material (never on the user's own chords).
- It decomposes durations into notatable pieces and lays them into measures of `num * 4 / den` beats.
- Both the renderer and the player read the *same* list, so **what you see is guaranteed to equal what you hear.** The bar-playback effect reads `measureIndex` + `startBeat` off these segments plus each measure's x-range from the rendered SVG, so it knows which bar to light up at any moment.

Two fields earn their place beyond the original sketch: **`sourceId`** (stamped identically on every decomposed piece of one original chord/technique; adjacent pieces sharing it get a `StaveTie`, even across a barline) and **`seamIndex`** (back-links a segment to the seam that produced it, so a clicked seam maps to its two flanking chords for the coach; `null` for user chords). `startBeat` is **measure-relative** (absolute time = `measureIndex * measureLength + startBeat`). The note-fade-in cascade derives its "already-animated" key from segment content (`sourceId` + notes + position) rather than a stored field.

If you internalize nothing else: **UI mutates state -> `compile()` -> render + audio + bar effect.** That is the whole app.

### Voice-leading (the part that was broken before)

Auto-generated connecting chords are voice-led to whatever is *actually sounding* immediately before them, via closest-voicing search - **not** anchored to a fixed octave. Under the notes-as-truth model the reference voicing is now *literally* the previous chord's `notes` array (or the previous piece of the same multi-chord technique) - no derivation step in between, which is one less thing to get wrong. Over all candidate voicings (every octave placement of each target pitch class within MIDI 40-88), discard any spanning more than 16 semitones, then minimize:

$$\text{cost} = \sum_{i} \left| \text{cand}_{(i)} - \text{ref}_{(i)} \right| \;+\; 0.1 \cdot \left| \overline{\text{cand}} - \overline{\text{ref}} \right|$$

over the two voicings **sorted ascending**. The user's own chords are never touched. (Note the search window MIDI 40-88 is deliberately narrower than the modal's full-keyboard input range 21-108 - users place chords anywhere, connective tissue stays central. Don't "simplify" the two into agreeing.)

---

## 5. File structure and ownership (for clean branches)

```
/index.html                 thin shell: CDN scripts + main.js         [Eric]
/css/styles.css             shared palette (--ink, --anchor, ...)     [Fee]
/js/
  main.js                   bootstraps + wires modules                [Eric]
  state.js                  the progression model + compile()         [Eric]  <- the contract
  persistence.js            projects in localStorage + import/export  [Eric]
  engine/
    chords.js               quality table, voicings, inversions       [Eric]
    techniques.js           the 8 transitions                         [Eric]
    voicing.js              closest-voicing search                    [Eric]
    rhythm.js               beat decomposition, measures              [Eric]
    detect.js               chord name from selected notes            [Eric]
  ui/
    chord-list.js           rows, drag reorder, bars/inversion        [Fee]
    piano-modal.js          piano strip + quality palette             [Fee]
    seam-picker.js          transition dropdowns                      [Fee/Eric]
    controls.js             tempo / time-sig / clef / play / reset    [Fee]
  notation/
    render.js               VexFlow rendering + gotchas               [Fee]
  audio/
    playback.js             Tone.js sampler, transport, scheduling    [Eric]
  fx/
    particles.js            ambient background                        [Fee]
    playback-bars.js        bar-playback particle indicator           [Fee]
    note-animation.js       fade-in cascade                           [Fee]
  coach/
    coach.js                client: calls /api/coach                  [Louie + Fee wiring]
    prompts.js              the actual prompt strings                 [Louie]
/api/
  coach.js                  Vercel serverless function (holds key)    [Fee]
/README.md                                                            [Louie]
```

**Ownership boundaries:** Eric owns the music brain (state + engine + audio). Fee owns the code-heavy surface (UI, notation, effects, proxy, deploy). Louie owns coach content, the README, and the demo. The one file everyone depends on is `state.js` - Eric locks its shape **tonight** so no one builds against a moving target.

**Branch strategy:** feature branches off `main`, Eric reviews merges into `main`. Merge small and often - don't let a branch sit for three days.

---

## 6. Day-by-day plan

### Tonight - Tuesday, July 14 (evening, ~1-2 hrs, all three)
- Lock the name (**Legato**), the track (**Education**), and roles.
- Create the GitHub repo; everyone clones.
- **Fee:** create the Vercel project, connect the repo, deploy a hello-world `/api/coach.js`, and confirm a `git push` goes live. **De-risk the whole pipeline while the app is still empty** - so plumbing is never what breaks on Monday.
- **Eric:** commit the contract to `main` - `js/state.js` (typedefs, factories, `reconcileSeams`, `validateProgression`, the `compile()` signature stub) **and** `docs/DATA-MODEL.md` (the prose). Stubs are fine; the *shapes* are what everyone builds against. Add the local-server note to the README.
- **Louie:** get OpenAI API key access; get added to the repo; start gathering 4-5 candidate demo progressions.
- Agree on the branch strategy above.

### Wednesday - Day 1: core loop, ugly but alive
- **Eric:** the chord model is already locked (notes-as-truth) - so this is wiring: Tone.js sampler playing a chord straight from a `notes` array; `compile()` producing a segment list for plain chords (no techniques yet). Give Louie a tiny authoring helper `notesFrom(rootMidi, quality, inversion)` so demo data isn't hand-typed MIDI.
- **Fee:** piano modal (strip + quality palette + live readout + save) writing an explicit `notes` array + `hint` into state; basic VexFlow render of the chords. Barline/clef polish can wait. (Free-note detection mode is Friday - Wednesday is the quality-assisted path only.)
- **Louie:** finalize demo progressions *as data* (note-sets + bars, authored via Eric's `notesFrom` helper, each with a `hint`) - these become the "Load example" dropdown; draft v1 of the explain-this-seam prompt.
- **Milestone EOD:** click piano -> add chord -> see it notated -> hear it. Ugly is fine.

### Thursday - Day 2: the music engine + notation polish
- **Eric (heaviest day):** the 8 techniques, closest-voicing search, rhythm/beat decomposition, seam logic wired into `compile()`.
- **Fee:** notation gotchas (barline colour, clef/time-sig **and key-sig** `setStyle`, multi-measure wrapping); chord-list UI with bars input, delete (no inversion dropdown - inversion is just where you place the notes now); **drag reorder via SortableJS** (on reorder/delete, call `reconcileSeams` from `state.js` - it preserves any seam whose exact chord-to-chord adjacency is unchanged and nulls only the rest - then re-run voice-leading, since the seed voicing may have changed).
- **Louie:** ear-test each technique as Eric lands it; flag anything wrong-register or muddy; refine the coach prompt; start the README skeleton.
- **Milestone EOD:** a full progression with transitions renders and plays correctly.

### Friday - Day 3: the AI coach + chord detection + controls
- **Fee:** finish `/api/coach.js` (real GPT-5.6 call, key in a Vercel env var); wire explain-this-seam into the seam UI; build the controls panel (tempo slider, time-sig, play/reset).
- **Eric:** `detect.js` - name a chord from its `notes` (reduce to pitch classes, try all 12 roots against the quality table, rank by exact-match > extension > partial, tie-break toward root-in-bass / common qualities / fewer accidentals, read inversion off the bass). Powers the modal's free-note mode and the fallback when a chord's notes drift off its `hint`. Then help wire `mood -> progression` if time.
- **Louie:** own and finalize the coach prompt content and voice; validate **every** explanation is theory-correct against real seams; draft the `mood -> progression` prompt.
- **Milestone EOD:** click a seam -> GPT explains it correctly, referencing the actual two chords. Chord detection works in the modal.

### Saturday - Day 4: bar particles, projects, aesthetics, tests
- **Fee:** the bar-playback particle indicator (build the timing map: which measure is active at time `t`, plus each measure's x-range from the rendered SVG, then light that bar up); hologram look + ambient particles + note fade-in cascade.
- **Eric:** the two automated tests, then fix what they catch:
  1. a passing chord between two chords in very different octaves stays near the *departing* chord's register;
  2. a wide scale run never sums to more beats than allotted ($\text{maxNotes} = \lfloor B / 0.25 \rfloor$).
  Also: `persistence.js` - multiple named projects in `localStorage` + JSON Import/Export. The export wraps projects with `schemaVersion` (already `1` in `state.js`) so future format changes don't break old files; import runs the committed `validateProgression` (unknown technique keys -> `null` + warning, malformed notes -> graceful fail), so a bad uploaded file never crashes the app.
- **Louie:** README body + project description draft; finalize the 2-3 progressions for the video; write the video script.
- **Milestone EOD:** the playing bar lights up; you can save several projects and export/import them.

### Sunday - Day 5: FEATURE FREEZE + integration hardening
- **No new features after today.**
- **All three:** merge every branch into `main`; full run-throughs on the **deployed Vercel URL** (not just local); fix voicing/beat/timing bugs; test Import/Export round-trips cleanly across two devices.
- **Eric:** final voice-leading pass - confirm what's seen equals what's heard.
- **Fee:** deploy stability, responsive check below 1000px, confirm no key leaks to the client.
- **Louie:** finalize README + video script; pick the final demo takes.
- **Milestone EOD:** a stable, deployed, demo-ready build.

### Monday - Day 6: record + SUBMIT
- Record the **under-3-minute** video: **Louie** narrates the music/theory + coach; **Eric** narrates the **Codex + GPT-5.6** usage (this is explicitly scored - do not skip it). Keep it under 3:00.
- Grab the Codex **`/feedback` session ID** from the main session.
- Fill the Devpost form: description, category (Education), repo URL (share with **testing@devpost.com** and **build-week-event@openai.com** if the repo is private), video link, session ID.
- **Submit tonight.**

### Tuesday - Day 7: buffer only
- Already submitted Monday. Today is contingency for the thing that inevitably breaks. Due **5:00 PM PT / 8:00 PM ET**.

---

## 7. Risks that kill the demo (guard against these)

- **Silent wrong-octave / corrupted-beat bugs.** They don't crash - they just sound bad on camera. This is why the two automated tests are non-negotiable.
- **Gold-plating particles while the beat math is still wrong.** Aesthetics come *after* the core loop plays correctly. Saturday is the earliest anyone touches `requestAnimationFrame`.
- **Leaving the video to Tuesday.** Record Monday. Uploads and Devpost forms always take longer than expected.
- **Merge hell from divergent branches.** Prevented by locking `state.js` + `docs/DATA-MODEL.md` tonight and merging small and often.
- **Chord detection creeping onto the demo's critical path.** Notes-as-truth means naming a chord goes through `detect.js` - and its failure mode (calling a C6 an Am7) is the quiet, on-camera kind. Mitigated by design: the quality-assisted path sets a display `hint`, so the spine names every chord *without* the detector; free-note detection is additive. Barebones fallback if `detect.js` slips: ship the modal quality-assisted-only, every chord born with a hint, and drop free-note detection with zero schema change.
- **The `file://` CORS trap.** Everyone runs a local server from day one, or they'll waste an hour thinking the app is broken.
- **No OpenAI model *in* the product.** The coach layer is what turns "a music tool built with Codex" into "an AI music tutor." It is not optional - it's the reason we can enter the Education track credibly.