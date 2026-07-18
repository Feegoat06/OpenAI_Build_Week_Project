/**
 * Application bootstrap and shared state.
 *
 * This file owns the top-level `progression` object plus the render pipeline
 * that keeps every panel in sync. It never renders DOM directly: panel
 * modules (editor-panel, sheet-music-panel, transport, coach-panel,
 * piano-modal) inject their own HTML and expose `render(state)` +
 * setter APIs. All user actions bubble back through callbacks so state
 * mutation lives here, in one place.
 *
 *   UI mutates `progression` → compile() → segmentList
 *                                            → sheetMusic.render()
 *                                            → playSegments()
 *                                            → sheetMusic.setActiveMeasure()
 */
import { compile, makeChord, reconcileSeams, beatsToBars } from './state.js';
import { makeDefaultProgression } from './data/demo-progressions.js';
import { chordDisplayName } from './engine/chords.js';
import { applyKeySignature } from './engine/key-signature.js';
import { TECHNIQUES } from './engine/techniques.js';
import { evaluateAllTechniques } from './engine/technique-eligibility.js';
import { playSegments, stopPlayback } from './audio/playback.js';
import { openPianoModal, populateChordControls, mountPianoModal } from './ui/piano-modal.js';
import { mountEditorPanel } from './ui/editor-panel.js';
import { mountSheetMusicPanel } from './ui/sheet-music-panel.js';
import { mountTransport } from './ui/transport.js';
import { mountCoachPanel } from './ui/coach-panel.js';
import { buildCoachEvidence } from './coach/evidence.js';
import { requestCoach } from './coach/coach.js';

let progression = makeDefaultProgression();
let segments = [];
let editingId = null;
let selectedSeam = 0;
const keySourceNotes = new Map();
const keySourceHints = new Map();

/* ── Panel mounts ────────────────────────────────────────────────── */

const sheetMusic = mountSheetMusicPanel({
  container: document.querySelector('#sheet-music-pane-mount'),
});

const pianoDialog = mountPianoModal({
  container: document.querySelector('#piano-modal-mount'),
});
populateChordControls(pianoDialog);

const editor = mountEditorPanel({
  container: document.querySelector('#editor-pane-mount'),
  callbacks: {
    onTempoInput(tempo) {
      progression.settings.tempo = tempo;
    },
    onTimeSigChange(timeSig) {
      progression.settings.timeSig = timeSig;
      coach.setEmpty();
      rerender();
    },
    onKeyChange(key) {
      progression.settings.key = key;
      applyKeyToMaterial();
      coach.setEmpty();
      rerender();
    },
    onClefChange(clef) {
      progression.settings.clef = clef;
      rerender();
    },
    onAddChord() {
      editingId = null;
      openPianoModal(pianoDialog, null, saveChord, progression.settings.timeSig, progression.settings.key);
    },
    onEditChord(chord) {
      editingId = chord.id;
      openPianoModal(pianoDialog, chord, saveChord, progression.settings.timeSig, progression.settings.key);
    },
    onDeleteChord(chord) {
      replaceChords(progression.chords.filter((item) => item.id !== chord.id));
    },
    onSetChordBeats(chord, beats) {
      chord.bars = beatsToBars(beats, progression.settings.timeSig);
      rerender();
    },
    onSelectSeam(index) {
      selectedSeam = index;
      editor.render({ progression, selectedSeam });
      coach.setContext(coachContextText());
    },
    onSetSeamTechnique(index, techniqueId) {
      progression.seams[index] = techniqueId;
      selectedSeam = index;
      coach.setEmpty();
      rerender();
    },
    onExplainSeam(index) { explainSeam(index); },
  },
});

const transport = mountTransport({
  container: sheetMusic.transportMount,
  callbacks: {
    onPlay: handlePlay,
    onStop: handleStop,
    onReset: handleReset,
  },
});

const coach = mountCoachPanel({
  container: sheetMusic.coachMount,
  callbacks: {
    onRetry(retryIndex) { explainSeam(retryIndex); },
  },
});

/* ── State mutation ──────────────────────────────────────────────── */

/**
 * Swap out `progression.chords` after a reorder/delete. Runs `reconcileSeams`
 * so a seam survives only if its exact adjacency existed before, then drops
 * any technique that's no longer eligible under the new adjacency.
 */
function replaceChords(nextChords) {
  progression.seams = reconcileSeams(progression.chords, progression.seams, nextChords);
  progression.chords = nextChords;
  rememberKeySources(nextChords);
  resetIneligibleSeams();
  selectedSeam = Math.min(selectedSeam, Math.max(0, progression.seams.length - 1));
  rerender();
}

function rememberKeySources(chords) {
  chords.forEach((chord) => {
    if (!keySourceNotes.has(chord.id)) keySourceNotes.set(chord.id, [...chord.notes]);
    if (!keySourceHints.has(chord.id)) keySourceHints.set(chord.id, chord.hint ? { ...chord.hint } : null);
  });
}

function applyKeyToMaterial() {
  rememberKeySources(progression.chords);
  progression.chords.forEach((chord) => {
    const sourceNotes = keySourceNotes.get(chord.id);
    chord.notes = applyKeySignature(sourceNotes, progression.settings.key);
    const changed = chord.notes.some((note, index) => note !== sourceNotes[index]);
    if (changed) delete chord.hint;
    else if (keySourceHints.get(chord.id)) chord.hint = { ...keySourceHints.get(chord.id) };
  });
  resetIneligibleSeams();
}

function resetIneligibleSeams() {
  progression.seams = progression.seams.map((techniqueId, index) => {
    if (!techniqueId) return null;
    return evaluateAllTechniques(progression.chords[index], progression.chords[index + 1])
      .find((technique) => technique.id === techniqueId)?.valid ? techniqueId : null;
  });
}

/**
 * Callback the piano modal invokes on Save. Handles both "add" (no editingId)
 * and "edit in place" (editingId set from the row's edit click).
 * `input` shape: `{ notes: number[], bars: number, hint?: {rootMidi, quality} }`.
 */
function saveChord(input) {
  if (editingId) {
    const chord = progression.chords.find((item) => item.id === editingId);
    const { hint: _oldHint, ...withoutHint } = chord;
    Object.assign(chord, withoutHint, input);
    keySourceNotes.set(chord.id, [...input.notes]);
    keySourceHints.set(chord.id, input.hint ? { ...input.hint } : null);
    chord.notes = applyKeySignature(input.notes, progression.settings.key);
    if (!input.hint) delete chord.hint;
  } else {
    const chord = makeChord(input.notes, input.bars, input.hint);
    keySourceNotes.set(chord.id, [...input.notes]);
    keySourceHints.set(chord.id, input.hint ? { ...input.hint } : null);
    chord.notes = applyKeySignature(input.notes, progression.settings.key);
    progression.chords.push(chord);
    if (progression.chords.length > 1) progression.seams.push(null);
  }
  resetIneligibleSeams();
  editingId = null;
  coach.setEmpty();
  rerender();
}

/* ── Coach flow ──────────────────────────────────────────────────── */

function coachContextText() {
  if (!progression.seams.length) return 'Add two chords to create a seam that LEGATO can explain.';
  const from = chordDisplayName(progression.chords[selectedSeam], progression.settings.key);
  const to = chordDisplayName(progression.chords[selectedSeam + 1], progression.settings.key);
  const technique = progression.seams[selectedSeam] ? TECHNIQUES[progression.seams[selectedSeam]].name : 'Direct transition';
  return `${ from } → ${ to } · ${ technique }`;
}

/**
 * Ask the coach to explain the transition at `index`. Assembles the payload
 * from compiled facts (voicings + generated notes + evidence facts) so the
 * LLM is grounded in exact MIDI rather than UI labels. Timeout, network
 * errors, and malformed responses all render a retry-able error card
 * instead of blowing up.
 */
async function explainSeam(index) {
  selectedSeam = index;
  editor.render({ progression, selectedSeam });
  coach.setContext(coachContextText());
  const techniqueId = progression.seams[index];
  const payload = {
    fromChord: { name: chordDisplayName(progression.chords[index], progression.settings.key), notes: progression.chords[index].notes },
    toChord: { name: chordDisplayName(progression.chords[index + 1], progression.settings.key), notes: progression.chords[index + 1].notes },
    technique: techniqueId ? { id: techniqueId, ...TECHNIQUES[techniqueId] } : 'none',
    generatedNotes: segments.filter((segment) => segment.seamIndex === index).flatMap((segment) => segment.notes),
    evidence: buildCoachEvidence(progression, segments, index),
  };
  coach.setLoading();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const result = await requestCoach(payload, { signal: controller.signal });
    clearTimeout(timer);
    coach.setResult(result);
  } catch (error) {
    const message = error.name === 'AbortError' ? 'The coach took too long to respond.' : error.message;
    coach.setError(message, index);
  }
}

/* ── Transport handlers ──────────────────────────────────────────── */

async function handlePlay() {
  transport.setPlayEnabled(false);
  transport.setPulseActive(true);
  transport.setStatus('Loading piano…');
  sheetMusic.particles.beginPlayback();
  try {
    await playSegments(
      segments,
      progression.settings,
      (measure) => {
        sheetMusic.setActiveMeasure(measure);
        if (measure !== null) transport.setStatus(`Playing measure ${ measure + 1 }`);
      },
      () => {
        sheetMusic.particles.settle();
        transport.setPlayEnabled(true);
        transport.setPulseActive(false);
        transport.setStatus('Playback complete');
      },
      (progress, measure) => sheetMusic.particles.setProgress(progress, measure),
    );
  } catch (error) {
    sheetMusic.particles.settle({ immediate: true });
    transport.setPlayEnabled(true);
    transport.setPulseActive(false);
    transport.setStatus(error.message);
  }
}

function handleStop() {
  stopPlayback();
  sheetMusic.particles.settle({ preserveProgress: true });
  sheetMusic.setActiveMeasure(null);
  transport.setPlayEnabled(true);
  transport.setPulseActive(false);
  transport.setStatus('Stopped');
}

function handleReset() {
  progression = makeDefaultProgression();
  keySourceNotes.clear();
  keySourceHints.clear();
  applyKeyToMaterial();
  selectedSeam = 0;
  coach.setEmpty();
  transport.setStatus('Example restored');
  rerender();
}

/* ── Render pipeline ─────────────────────────────────────────────── */

/**
 * The one-and-only render pipeline. Every state mutation ends by calling
 * this; nothing else renders sheet music or reads segments directly.
 * Notation, audio (via `segments`), and DOM all update from the same
 * source in one pass.
 */
function rerender() {
  stopPlayback();
  sheetMusic.particles.settle({ immediate: true });
  sheetMusic.setActiveMeasure(null);
  transport.setPlayEnabled(true);
  transport.setPulseActive(false);
  segments = compile(progression);
  editor.render({ progression, selectedSeam });
  sheetMusic.render(segments, progression.settings);
  coach.setContext(coachContextText());
}

applyKeyToMaterial();
rerender();
