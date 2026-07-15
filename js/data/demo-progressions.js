/**
 * Curated, public-domain-style harmonic examples for Legato's "Load example"
 * menu. Each chord uses the shared progression model defined in js/state.js.
 */
export const DEMO_PROGRESSIONS = [
  {
    id: 'ii-v-i-c-major',
    name: 'ii–V–I in C major',
    description: 'The essential jazz resolution: D minor moves through G7 and resolves to C major.',
    settings: { tempo: 96, timeSig: 4, clef: 'auto' },
    chords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 2, inversion: 0 },
    ],
  },
  {
    id: 'autumn-turnaround-g-minor',
    name: 'Minor turnaround in G minor',
    description: 'A compact minor-key cadence with a dominant pull into G minor.',
    settings: { tempo: 88, timeSig: 4, clef: 'auto' },
    chords: [
      { rootMidi: 57, quality: 'min7b5', bars: 1, inversion: 0 },
      { rootMidi: 50, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 55, quality: 'min7', bars: 2, inversion: 0 },
    ],
  },
  {
    id: 'circle-of-fifths-c-major',
    name: 'Circle of fifths in C',
    description: 'A chain of dominant motion that makes each arrival feel inevitable.',
    settings: { tempo: 108, timeSig: 4, clef: 'auto' },
    chords: [
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 50, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 55, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
  },
  {
    id: 'wistful-a-minor',
    name: 'Wistful resolution in A minor',
    description: 'A moody descent that lands with a hopeful Picardy-style lift.',
    settings: { tempo: 76, timeSig: 4, clef: 'auto' },
    chords: [
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 53, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 45, quality: 'maj7', bars: 1, inversion: 0 },
    ],
  },
];

export function getDemoProgression(id) {
  return DEMO_PROGRESSIONS.find((progression) => progression.id === id);
}

/**
 * Focused examples for the eight transition techniques. `anchorChords` are the
 * stable chords at either side of a seam; `generatedMaterial` is what the
 * technique engine inserts between them. MIDI 60 is middle C.
 *
 * These are deliberately data, rather than rendered chord voicings: compile()
 * should voice-lead generated chords/notes to the user's actual anchor voicings.
 */
export const TRANSITION_DEMOS = [
  {
    id: 'diatonic-passing-diminished',
    name: 'Diatonic passing diminished',
    durationBeats: 1,
    construction: 'Insert a fully diminished seventh chord a semitone above the departing tonic to approach ii by chromatic step: Cmaj7 → C♯°7 → Dm7. Despite the common label, this passing chord is chromatic—not diatonic—in C major.',
    anchorChords: [
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chord',
      chord: { rootMidi: 49, quality: 'dim7', durationBeats: 1, inversion: 0 },
    },
  },
  {
    id: 'secondary-dominant',
    name: 'Secondary dominant',
    durationBeats: 1,
    construction: 'Precede a target chord with its dominant: A7 is V7/ii in C major and resolves to Dm7.',
    anchorChords: [
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chord',
      chord: { rootMidi: 45, quality: 'dom7', durationBeats: 1, inversion: 0 },
    },
  },
  {
    id: 'tritone-substitution',
    name: 'Tritone substitution',
    durationBeats: 1,
    construction: 'Replace G7 (V7 of C) with D♭7, a dominant chord a tritone away; its third and seventh are the same guide tones in reverse.',
    anchorChords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chord',
      chord: { rootMidi: 49, quality: 'dom7', durationBeats: 1, inversion: 0 },
    },
  },
  {
    id: 'ii-v-i-insert',
    name: 'ii–V–I insert',
    durationBeats: 2,
    construction: 'Insert Dm7–G7 before Cmaj7: ii prepares V, and V resolves to I through dominant-function tension.',
    anchorChords: [
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chordSequence',
      chords: [
        { rootMidi: 50, quality: 'min7', durationBeats: 1, inversion: 0 },
        { rootMidi: 55, quality: 'dom7', durationBeats: 1, inversion: 0 },
      ],
    },
  },
  {
    id: 'sus-chord-passing',
    name: 'Sus chord passing',
    durationBeats: 1,
    construction: 'Delay a dominant chord’s third with its fourth: G7sus4 holds C over G, then resolves that suspended C down to B before Cmaj7.',
    anchorChords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chord',
      chord: { rootMidi: 55, quality: 'dom7sus4', durationBeats: 1, inversion: 0 },
      resolution: { rootMidi: 55, quality: 'dom7', durationBeats: 0, inversion: 0 },
    },
  },
  {
    id: 'leading-tone-bass-note',
    name: 'Leading-tone bass note',
    durationBeats: 0.5,
    construction: 'Place B, the leading tone of C, in the bass immediately before Cmaj7. The semitone bass motion B → C supplies the pull.',
    anchorChords: [
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'bassNote',
      notes: [47],
      durationBeats: 0.5,
    },
  },
  {
    id: 'scale-run-stepwise',
    name: 'Scale run, stepwise',
    durationBeats: 2,
    construction: 'Connect Cmaj7 to Am7 with a stepwise C-major ascent. Each note moves by step and the final A belongs to the arriving chord.',
    anchorChords: [
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'noteRun',
      notes: [60, 62, 64, 65, 67, 69],
      durationBeats: 2,
      rhythm: 'even',
    },
  },
  {
    id: 'arpeggiated-bridge',
    name: 'Arpeggiated bridge',
    durationBeats: 2,
    construction: 'Bridge Cmaj7 to Am7 by arpeggiating the arriving Am7 tones. A–C–E–G outlines the destination before it is sustained.',
    anchorChords: [
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'noteRun',
      notes: [57, 60, 64, 67],
      durationBeats: 2,
      rhythm: 'even',
    },
  },
  {
    id: 'chromaticEnclosure',
    name: 'Chromatic enclosure',
    category: 'ornament',
    durationBeats: 0.5,
    construction: 'Approach an arriving chord tone from a semitone above and below before landing on it. Here F and D♯ enclose E, the third of Cmaj7.',
    anchorChords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'graceNoteFigure',
      notes: [65, 63],
      targetMidi: 64,
      durationBeats: 0.5,
      rhythm: 'twoEvenNotes',
    },
  },
  {
    id: 'slipNoteBridge',
    name: 'Slip-note bridge',
    category: 'ornament',
    durationBeats: 1,
    construction: 'Sound a dominant suspension, then slide the top voice up by semitone into the arrival. G7sus4 supports D♯ → E as Cmaj7 arrives.',
    anchorChords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'chordPlusGraceNote',
      chord: { rootMidi: 55, quality: 'dom7sus4', durationBeats: 0.75, inversion: 0 },
      graceNotes: [63],
      targetMidi: 64,
      durationBeats: 1,
    },
  },
  {
    id: 'turnIntoTarget',
    name: 'Turn into target',
    category: 'ornament',
    durationBeats: 1,
    construction: 'Ornament the arriving top voice with a turn: upper neighbor, target, lower neighbor, then target again. F–E–D–E decorates E, Cmaj7’s third, without a harmony change.',
    anchorChords: [
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'ornament',
      notes: [65, 64, 62, 64],
      targetMidi: 64,
      durationBeats: 1,
      rhythm: 'fourEvenNotes',
    },
  },
  {
    id: 'appoggiaturaChord',
    name: 'Appoggiatura chord',
    category: 'ornament',
    durationBeats: 1,
    construction: 'Strike an accented upper-neighbor sonority on the beat, then resolve every voice down by step. D♭–F–A♭ resolves to C–E–G over a C bass.',
    anchorChords: [
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'accentedResolution',
      notes: [61, 65, 68],
      resolutionNotes: [60, 64, 67],
      durationBeats: 1,
    },
  },
  {
    id: 'anticipation',
    name: 'Anticipation',
    category: 'ornament',
    durationBeats: 0.5,
    construction: 'Play an arriving chord tone early, then let it repeat or sustain when the harmony changes. E sounds before Cmaj7 and becomes its third on arrival.',
    anchorChords: [
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'anticipation',
      notes: [64],
      targetMidi: 64,
      durationBeats: 0.5,
    },
  },
  {
    id: 'suspension-resolution',
    name: 'Suspension resolution',
    category: 'ornament',
    durationBeats: 1,
    construction: 'Hold a note from the previous harmony across the change, creating a temporary dissonance, then resolve it down by step. F from G7 is held over Cmaj7 and resolves to E.',
    anchorChords: [
      { rootMidi: 55, quality: 'dom7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'suspension',
      heldMidi: 65,
      resolutionMidi: 64,
      durationBeats: 1,
    },
  },
  {
    id: 'diatonic-neighbor-approach',
    name: 'Diatonic neighbor approach',
    category: 'ornament',
    durationBeats: 0.5,
    construction: 'Touch the scale note above the target and return by step. F–E adds a light melodic lift before E settles as the third of Cmaj7.',
    anchorChords: [
      { rootMidi: 50, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'neighborFigure',
      notes: [65, 64],
      targetMidi: 64,
      durationBeats: 0.5,
    },
  },
  {
    id: 'pentatonic-arrival-riff',
    name: 'Pentatonic arrival riff',
    category: 'ornament',
    durationBeats: 2,
    construction: 'Use a short C-major pentatonic figure to approach the destination. A–G–E–D–C creates rhythmic lift while landing on C, the arriving root.',
    anchorChords: [
      { rootMidi: 57, quality: 'min7', bars: 1, inversion: 0 },
      { rootMidi: 48, quality: 'maj7', bars: 1, inversion: 0 },
    ],
    generatedMaterial: {
      type: 'noteRun',
      notes: [69, 67, 64, 62, 60],
      targetMidi: 60,
      durationBeats: 2,
      rhythm: 'even',
    },
  },
];

export function getTransitionDemo(id) {
  return TRANSITION_DEMOS.find((transition) => transition.id === id);
}
