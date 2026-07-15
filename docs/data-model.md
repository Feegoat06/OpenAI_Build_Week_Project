# Legato: Data Model & `compile()` Contract

**This is the one file everyone builds against.** We three and Codex all reference it.
It defines the shared state shape, what every field means, and the `compile()` output that
notation, audio, and the bar-playback effect all consume.

Rule of thumb: **this doc is authoritative for *meaning*; [`js/state.js`](../js/state.js) is
authoritative for *shape* (types + factories).** If they ever disagree, the types in
`state.js` win and this doc gets fixed.

The whole app in one line:

> **UI mutates `progression` -> `compile()` -> the same segment list feeds render + audio + bar effect.**

---

## 0. The *project* vs *progression* layer

Keep these separate. The **progression** is the musical content `compile()` eats. The
**project** is the named, timestamped container the library and Import/Export deal with.
Names and timestamps must never leak into the thing the engine reasons about.

```js
// persistence.js — the library layer
project = {
  id,           // crypto.randomUUID()
  name,         // "Autumn Leaves sketch"
  createdAt,    // ISO string
  updatedAt,    // ISO string
  progression   // the object in §1
}

// the export file wraps one-or-many projects + a version
exportFile = { schemaVersion: 1, kind: 'legato-projects', projects: [ project, ... ] }
```

`schemaVersion` exists so a future format change doesn't break old exported files. On import,
**validate before trusting** - a malformed uploaded file must fail gracefully, not crash the app.

---

## 1. `progression`: the single source of truth

```js
progression = {
  settings: { tempo: 100, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
  chords:   [ { id, notes: [60, 64, 67], bars: 1, hint: { rootMidi: 60, quality: 'Major' } } ],
  seams:    [ /* techniqueId | null, length === chords.length - 1 */ ]
}
```

The UI **never** mutates notation or audio directly. It mutates `progression`, then fires one
`rerender()`. Notation and audio both subscribe. This decoupling is what keeps three branches
from colliding.

### 1.1 `settings`

| Field | Type | Meaning | Notes |
|---|---|---|---|
| `tempo` | number (BPM) | Playback speed. | **Player-only.** `compile()` ignores it - tempo changes never re-run compile. |
| `timeSig` | `{ num, den }` | Time signature, e.g. `{num:5, den:4}`. | Structural. Measure length (in quarter-beats) = `num * 4 / den`. See §4. |
| `key` | integer -7..+7 | Key signature on the circle of fifths: sharps positive, flats negative. C=0, G=+1, F=-1, Bb=-2... | **Spelling only.** Chooses sharp-vs-flat when turning a MIDI number into a VexFlow keystring. Never touches audio or voice-leading. |
| `clef` | `'auto' \| 'treble' \| 'bass'` | One clef for the whole progression (no grand staff). | `'auto'` = pick from median pitch at render time (below middle C -> bass, else treble). Store the user's literal choice; resolve `'auto'` only when rendering. |

### 1.2 `chords`
**The individual notes solely dictates the chord, not their quality, chordal root, etc.**

```js
{ id, notes: [midi...], bars, hint?: { rootMidi, quality } }
```

| Field | Type | Meaning | Notes |
|---|---|---|---|
| `id` | string | Stable, within-project-unique. | What SortableJS keys off and what lets you edit/delete the right row. `randomUUID()` or a counter. |
| `notes` | `[int...]` | The **exact** MIDI notes that sound. This is the ground truth. | Full-keyboard range (MIDI 21-108). **Never re-voiced** - what's stored is what plays. Voicing, octave, doubling, and inversion are all encoded here implicitly. |
| `bars` | number | Duration in bars (min 0.5, step 0.5). | Total beats = `bars * measureLength`. A following technique carves its cost out of this chord's tail (§3). |
| `hint` | `{ rootMidi, quality }` \| absent | **Display-only** name hint. | Set by the quality-assisted input path so the row names itself instantly without the detector. `compile()`, audio, and render **never** read `hint`. If the user edits `notes` so they no longer match, drop the hint and fall back to `detect.js`. |

**Why notes-as-truth?** Both input modes produce the same thing - an explicit note set:

- **Quality-assisted (Mode A):** pick root + quality -> every pitch class of that chord is
  highlighted across the keyboard -> user toggles individual notes for the octave/doubling/
  inversion they want. Sets `hint` so the name shows instantly. **Output: `notes`.**
- **Free selection (Mode B):** click any notes -> `detect.js` names them live (e.g. C/E/G with
  E in the bass -> "C major, 1st inversion"). No hint. **Output: `notes`.**

The quality palette is a *selection accelerator*, not a second way of storing a chord. Inversion
is never stored - it's read off the bass note by the detector.

> **Barebones fallback if the detector slips:** ship Mode A only. Every chord is born with a
> `hint`, so every row names itself with zero detector dependence. Mode B (free-note detection)
> then drops in later as a strictly additive layer with **no schema change.**

### 1.3 `seams`

We use technique **keys**, and never hardcode computed notes.

```js
seams: [ techniqueId | null ]   // length === chords.length - 1
```

Each entry is either `null` ("no technique on this transition") or a **string key** into the
code-side `TECHNIQUES` registry (§5). One entry per gap between consecutive chords.

**We store the key, not the resulting notes, and this is deliberate:** voice-leading is
*contextual* - the same technique between the same two chords produces different MIDI notes
depending on the register of whatever sounds before it. So the notes can never live in state;
they're always recomputed by `compile()`. Consequences:

- **If a technique's math changes, every project using that key upgrades automatically** on the
  next `compile()`. Fix the tritone-sub voicing once, every saved project improves. Exactly the
  property we want while Eric is still tuning the engine.
- **On reorder/delete, seams are preserved where the adjacency is unchanged** and nulled only
  where it isn't (§6).
- **Unknown key = treat as `null` + warn.** If a key is ever renamed/removed, old imported
  projects reference a dead id; `compile()` and the import validator must degrade gracefully,
  not throw.

---

## 2. `compile()` — what it is and why it matters

```
progression  ->  compile()  ->  segmentList  ->  notation.render()
                                            \->  audio.play()
                                            \->  bar-playback timing map
```

`compile(progression)` is a **pure function**: state in, an ordered list of **segments** out.
No DOM, no audio side effects. It translates *high-level intent* ("a Cmaj for 1 bar, a secondary
dominant, then Fmaj") into *concrete atomic events* VexFlow and Tone.js can actually consume.

Inside, `compile()`:

1. Runs **voice-leading** on auto-generated technique material (never on the user's chords).
2. **Decomposes** each duration into standard notatable values.
3. Lays pieces into measures and tags **ties** across splits.

Two payoffs, and they're the whole architectural bet:

- **One list, two consumers -> what you see equals what you hear.** Renderer and player read the
  *same* segments, so a note physically cannot be drawn as a half but played as a quarter. This
  is what lets Fee (notation) and Eric (audio) build on separate branches without silent drift.
- **Purity makes it testable.** The two required tests (§7) just call `compile()` on a crafted
  progression and assert on the returned list.

### 2.1 The segment — `compile()`'s output unit

One atomic, fully-resolved, notatable-and-playable event:

```js
segment = {
  notes,          // [midi...]  the resolved pitches (post voice-leading)
  durationBeats,  // number     one standard note-value's worth (see §4)
  isTechnique,    // boolean    drives colour + whether the coach explains it
  sourceId,       // string     TIES: adjacent segments sharing this get a StaveTie
  seamIndex,      // int | null which seam produced it (for the GPT coach lookup)
  measureIndex,   // int        which stave this draws on
  startBeat       // number     beats from the start of ITS OWN measure
}
```

| Field | Why it exists |
|---|---|
| `notes` | The actual pitches to draw and play. For user chords, identical to `chord.notes`. For techniques, the voice-led result. |
| `durationBeats` | The single guarantee that see == hear. Both branches read this. |
| `isTechnique` | Technique notes render in the accent colour and are what the coach explains. |
| `sourceId` | Stamped identically on every decomposed piece of one original chord/technique instance. Two adjacent segments with the same `sourceId` get a `StaveTie` - even across a barline. |
| `seamIndex` | Lets a clicked seam map back to its segments and its two flanking chords, so the coach can explain the real transition. `null` for user chords. |
| `measureIndex` | Which measure/stave to place it on. |
| `startBeat` | **Measure-relative** - beats from the start of its own measure (what the renderer wants for horizontal placement). Absolute time, which the player and bar-effect need, is `measureIndex * measureLength + startBeat`. This is clean *because* every measure in a progression shares one length. **Convention: measure-relative. Don't store absolute here.** |

---

## 3. Rhythm — how a chord's duration is spent

Work internally in **quarter-note beats**. A measure holds `measureLength = num * 4 / den`
quarter-beats.

A chord nominally occupies `bars * measureLength` beats. A following technique **borrows** its
cost out of the *tail* of the departing chord - it does **not** extend the piece. Available
budget for a technique on a given seam:

```js
availableBeats = max(0, min(departingChordTotalBeats - 1, 4))
```

Always leave the departing chord at least 1 beat of its own sound; never borrow more than 4.
The seam UI only offers techniques whose `beatCost <= availableBeats`.

---

## 4. Duration decomposition & measures

Decompose any beat-duration greedily into standard values, largest-first:

```
[4, 2, 1, 0.5, 0.25]   // whole, half, quarter, eighth, sixteenth
```

**Sixteenth (0.25) must be in this list** - stopping at 0.5 silently mis-renders shorter notes
as quarters and corrupts the measure's beat total.

Lay pieces into measures of `measureLength` beats each, splitting across a boundary into tied
pieces (same `sourceId`) as needed. A tie connects any two adjacent pieces, in play order,
from the same original sustained instance.

**Compound meters (6/8, 9/8, 12/8) play correctly for free** (a 12/8 bar is just 6 quarter-beats)
but **notate** with quarter-tied-to-eighth instead of idiomatic dotted values, because the list
above has no dotted values. Making compound meter *look* right (dotted values `[3, 1.5, 0.75]` +
triple beaming) is a **stretch**, not spine. Ship simple meters (3/4, 4/4, 5/4, 7/4 - all free);
scope compound-meter *notation* only if Saturday has slack.

**Run-length cap (required test).** When spreading N single notes (techniques 7/8) across B beats,
cap N first so even at the smallest value they fit: `maxNotes = floor(B / 0.25)`. If the run is
longer, evenly subsample down to `maxNotes` rather than overshooting the budget. A wide interval
squeezed into 2 beats will silently corrupt the measure without this. **Write a test.**

---

## 5. The eight techniques (registry lives in `techniques.js`)

Each is a code-side entry keyed by the string stored in `seams`. All target the **next** chord;
all get their final register from closest-voicing (§ voice-leading) - the rows below only fix the
*pitch classes/quality*, never the octave.

| `seams` key | Name | `beatCost` | Content (targets next chord) |
|---|---|---|---|
| `passingDim` | Diatonic passing diminished | 1 | Dim7, root a half step **below** target. |
| `secondaryDom` | Secondary dominant | 1 | Dom7, root a perfect 5th **above** target. |
| `tritoneSub` | Tritone substitution | 1 | Dom7, root a half step **above** target. |
| `ii_v_i` | 2-5-1 insert | 2 | Two chords: Min7 on target+2 semitones, then Dom7 on target+7, beats split evenly. |
| `susPassing` | Sus chord passing | 1 | Target's own root, **Sus4** quality. |
| `leadingTone` | Leading tone bass note | 0.5 | A **single note** (not a chord), a half step below the target's root. |
| `scaleRun` | Scale run | 2 | Chromatic stepwise walk from current chord's top note to the closest note of the next chord. Each step is one single-note event. If adjacent (0-1 semitone apart), fall back to a single neighbour-tone. |
| `arpBridge` | Arpeggiated bridge | 2 | Same harmony as `secondaryDom` (Dom7 a 5th above), but ascending individual notes, not a block. |

`scaleRun` and `arpBridge` exist to add real melodic motion (stepwise and skip-wise) so the piece
doesn't sound like "static chord, static chord, passing chord, static chord" on loop.

---

## 6. Voice-leading (only on technique material)

**User chords are never re-voiced** - they play exactly as `chord.notes` says. Voice-leading runs
**only** on auto-generated technique notes, seeded from whatever is *actually sounding* immediately
before (the previous chord's `notes`, or the previous piece of the same multi-chord technique).

A technique gives a target **pitch-class set**; we choose an octave for each pitch class so the
result sits closest to the reference voicing `r`. Over all candidate voicings `c` (every octave
placement of each pitch class within roughly MIDI 40-88), discard any spanning more than 16
semitones, then minimize:

$$
\text{cost}(\mathbf{c}) = \sum_{i=1}^{\min(|\mathbf{c}|,\,|\mathbf{r}|)} \bigl| c_{(i)} - r_{(i)} \bigr|
\;+\; 0.1 \cdot \bigl| \overline{\mathbf{c}} - \overline{\mathbf{r}} \bigr|
$$

where `c_(i)`, `r_(i)` are the two voicings **sorted ascending** and the bars denote means.

- First term = total voice motion (L1 distance, sorted smallest-to-smallest). Minimizing it *is*
  smooth voice-leading.
- Second term = light register tie-breaker on average pitch, weight `0.1` so it only decides
  near-ties and never overrides real voice motion.

**Brute force it.** ~600 combinations for a 4-note chord; sub-millisecond, compile-time only.
Nothing cleverer earns its complexity.

**The bug this prevents:** placing a technique chord at an octave from arithmetic ("previous
octave + target pitch class") lands it in an arbitrary register and sounds awful. Closest-voicing
pins it to what's sounding, by construction. **This is required test #1.**

**Range asymmetry (intentional, don't "fix" it):** the search window is MIDI **40-88**,
deliberately narrower than the modal input range **21-108**. Users can place a chord anywhere on
the full keyboard; auto-generated connective tissue stays in a sane central range.

---

## 7. Required automated tests (non-negotiable)

Both are silent-failure bugs - they don't crash, they just sound/look wrong on camera.

1. **Register:** a technique chord between two chords placed in very different octaves stays near
   the **departing** chord's register, not the target's.
2. **Beat budget:** a wide scale run never sums to more beats than allotted
   (`maxNotes = floor(B / 0.25)`).

Both call `compile()` on a crafted progression and assert on the returned segment list.

---

## 8. Worked example

Progression in 4/4, key of C (`key: 0`):

- Cmaj `{ notes:[60,64,67], bars:1 }`
- seam `secondaryDom`
- Fmaj `{ notes:[65,69,72], bars:1 }`

`compile()` returns roughly:

```js
[
  // Cmaj: 4 beats − 1 borrowed = 3 sounding. 3 -> [2, 1], tied (same sourceId).
  { notes:[60,64,67], durationBeats:2, isTechnique:false, sourceId:'c1', seamIndex:null, measureIndex:0, startBeat:0 },
  { notes:[60,64,67], durationBeats:1, isTechnique:false, sourceId:'c1', seamIndex:null, measureIndex:0, startBeat:2 }, // tied to prev

  // Secondary dominant of F = C7 {C,E,G,Bb}, voice-led near where Cmaj sat. 1 beat.
  { notes:[/* voice-led C7 */], durationBeats:1, isTechnique:true, sourceId:'s0', seamIndex:0, measureIndex:0, startBeat:3 },

  // Fmaj: full bar, new measure.
  { notes:[65,69,72], durationBeats:4, isTechnique:false, sourceId:'c2', seamIndex:null, measureIndex:1, startBeat:0 },
]
```

Three high-level objects -> four flat segments, each one note head and one scheduled event.