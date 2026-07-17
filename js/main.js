/**
 * Application entry: wires DOM events → state mutation → single `rerender()`.
 *
 * The whole app is:
 *
 *   UI mutates `progression` → compile() → segmentList
 *                                              → renderNotation()
 *                                              → playSegments()
 *                                              → bar highlight
 *
 * This file owns the top-level `progression` object, all `#…` DOM handlers,
 * and the coach fetch. It never renders notation or schedules audio directly:
 * it just mutates state and calls `rerender()`.
 */
import { availableBeats, chordTotalBeats, compile, makeChord, reconcileSeams, barsToBeats, beatsToBars } from './state.js';
import { makeDefaultProgression } from './data/demo-progressions.js';
import { chordDisplayName, noteName } from './engine/chords.js';
import { applyKeySignature } from './engine/key-signature.js';
import { TECHNIQUES } from './engine/techniques.js';
import { evaluateAllTechniques } from './engine/technique-eligibility.js';
import { renderNotation } from './notation/render.js';
import { playSegments, stopPlayback } from './audio/playback.js';
import { openPianoModal, populateChordControls } from './ui/piano-modal.js';
import { buildCoachEvidence } from './coach/evidence.js';
import { requestCoach } from './coach/coach.js';

let progression = makeDefaultProgression();
let segments = [];
let editingId = null;
let selectedSeam = 0;
let scoreZoom = 1;
const keySourceNotes = new Map();
const keySourceHints = new Map();

const $ = (selector) => document.querySelector(selector);
const elements = { chords: $('#chord-list'), seams: $('#seam-list'), score: $('#score'), coach: $('#coach-output') };

function syncControls() {
  $('#tempo').value = String(progression.settings.tempo);
  $('#tempo-value').value = String(progression.settings.tempo);
  $('#time-signature').value = `${ progression.settings.timeSig.num }/${ progression.settings.timeSig.den }`;
  $('#key-signature').value = String(progression.settings.key);
  $('#clef').value = progression.settings.clef;
}

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

function renderChords() {
  elements.chords.replaceChildren();
  if (!progression.chords.length) {
    elements.chords.innerHTML = '<div class="empty-state">No material yet. Add a chord and choose its exact piano voicing.</div>';
    return;
  }
  const timeSig = progression.settings.timeSig;
  const beatChoices = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
  const beatLabel = (beats) => beats === 0.5 ? '½' : beats === 1.5 ? '1½' : String(beats);
  progression.chords.forEach((chord, index) => {
    const row = document.createElement('article');
    row.className = 'chord-row';
    const notes = chord.notes.map((note) => noteName(note, progression.settings.key)).join(' · ');
    const currentBeats = Number(barsToBeats(chord.bars, timeSig).toFixed(4));
    const options = beatChoices.includes(currentBeats) ? beatChoices : [...beatChoices, currentBeats].sort((a, b) => a - b);
    // chordDisplayName + noteName produce trusted strings today (both derive
    // from a fixed vocabulary), but interpolating into innerHTML makes escape
    // discipline a policy — not a per-call judgement. Wrap them defensively.
    const displayName = escapeHtml(chordDisplayName(chord, progression.settings.key));
    row.innerHTML = `<button class="chord-main" aria-label="Edit chord ${ index + 1 }"><strong>${ String(index + 1).padStart(2, '0') } · ${ displayName }</strong><small>${ escapeHtml(notes) }</small></button><select class="chord-bars" aria-label="Beats for chord ${ index + 1 }">${ options.map((beats) => `<option value="${ beats }" ${ beats === currentBeats ? 'selected' : '' }>${ beatLabel(beats) }</option>`).join('') }</select><button class="delete-button" aria-label="Delete chord ${ index + 1 }">×</button>`;
    row.querySelector('.chord-main').onclick = () => { editingId = chord.id; openPianoModal($('#piano-dialog'), chord, saveChord, timeSig, progression.settings.key); };
    row.querySelector('.chord-bars').onchange = (event) => { chord.bars = beatsToBars(Number(event.target.value), timeSig); rerender(); };
    row.querySelector('.delete-button').onclick = () => replaceChords(progression.chords.filter((item) => item.id !== chord.id));
    elements.chords.append(row);
  });
}

function renderSeams() {
  elements.seams.replaceChildren();
  if (!progression.seams.length) {
    elements.seams.innerHTML = '<div class="empty-state">Add at least two chords to create a transition seam.</div>';
    return;
  }
  progression.seams.forEach((selected, index) => {
    const budget = availableBeats(chordTotalBeats(progression.chords[index], progression.settings.timeSig));
    const row = document.createElement('article');
    row.className = `seam-row ${ selectedSeam === index ? 'selected' : '' }`;
    const from = escapeHtml(chordDisplayName(progression.chords[index], progression.settings.key));
    const to = escapeHtml(chordDisplayName(progression.chords[index + 1], progression.settings.key));
    row.innerHTML = `<div class="seam-top"><span class="seam-index">S${ String(index + 1).padStart(2, '0') }</span><div class="seam-label"><strong>${ from } → ${ to }</strong><small>${ budget } beat${ budget === 1 ? '' : 's' } available in the departing tail</small></div></div><div class="seam-actions"><select class="seam-select" aria-label="Technique for transition ${ index + 1 }"></select><button class="seam-explain">Explain</button></div>`;
    const select = row.querySelector('.seam-select');
    select.add(new Option('Direct transition', ''));
    evaluateAllTechniques(progression.chords[index], progression.chords[index + 1]).forEach((technique) => {
      const affordable = technique.beatCost <= budget;
      const option = new Option(`${ technique.name } · ${ technique.beatCost }b`, technique.id, false, false);
      option.disabled = !technique.valid || !affordable;
      option.title = !technique.valid ? technique.reason : (!affordable ? `requires ${ technique.beatCost } beats; only ${ budget } available` : '');
      select.add(option);
    });
    select.value = selected ?? '';
    select.onchange = () => { progression.seams[index] = select.value || null; selectedSeam = index; clearCoach(); rerender(); };
    row.querySelector('.seam-explain').onclick = () => explainSeam(index);
    row.onclick = (event) => { if (event.target === select || event.target.closest('button')) return; selectedSeam = index; renderSeams(); updateCoachContext(); };
    elements.seams.append(row);
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
  clearCoach();
  rerender();
}

function updateCoachContext() {
  if (!progression.seams.length) {
    $('#coach-context').textContent = 'Add two chords to create a seam that LEGATO can explain.';
    return;
  }
  const from = chordDisplayName(progression.chords[selectedSeam], progression.settings.key);
  const to = chordDisplayName(progression.chords[selectedSeam + 1], progression.settings.key);
  const technique = progression.seams[selectedSeam] ? TECHNIQUES[progression.seams[selectedSeam]].name : 'Direct transition';
  $('#coach-context').textContent = `${ from } → ${ to } · ${ technique }`;
}

function clearCoach() {
  elements.coach.innerHTML = '<div class="coach-empty"><span>∿</span><p>Your grounded explanation will appear here.</p></div>';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Ask the coach to explain the transition at `index`.
 * Assembles the payload from compiled facts (voicings + generated notes +
 * evidence facts computed in `buildCoachEvidence`) so the LLM is grounded in
 * exact MIDI rather than UI labels. Timeout, network errors, and malformed
 * responses all render a retry-able error card instead of blowing up.
 */
async function explainSeam(index) {
  selectedSeam = index;
  renderSeams(); updateCoachContext();
  const techniqueId = progression.seams[index];
  const payload = {
    fromChord: { name: chordDisplayName(progression.chords[index], progression.settings.key), notes: progression.chords[index].notes },
    toChord: { name: chordDisplayName(progression.chords[index + 1], progression.settings.key), notes: progression.chords[index + 1].notes },
    technique: techniqueId ? { id: techniqueId, ...TECHNIQUES[techniqueId] } : 'none',
    generatedNotes: segments.filter((segment) => segment.seamIndex === index).flatMap((segment) => segment.notes),
    evidence: buildCoachEvidence(progression, segments, index),
  };
  elements.coach.innerHTML = '<div class="coach-loading"><span class="spinner"></span>Tracing the exact voices and generated notes…</div>';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const result = await requestCoach(payload, { signal: controller.signal });
    clearTimeout(timer);
    elements.coach.innerHTML = `<div class="coach-grid"><article class="coach-card"><span>What you hear</span><p>${ escapeHtml(result.whatYouHear) }</p></article><article class="coach-card"><span>Why it works</span><p>${ escapeHtml(result.whyItWorks) }</p></article><article class="coach-card"><span>Try this</span><p>${ escapeHtml(result.tryThis) }</p></article><article class="coach-card reflect"><span>Reflect</span><p>${ escapeHtml(result.reflect) }</p></article></div>`;
  } catch (error) {
    const message = error.name === 'AbortError' ? 'The coach took too long to respond.' : error.message;
    elements.coach.innerHTML = `<div class="coach-error"><span>${ escapeHtml(message) }</span><button id="retry-coach">Retry explanation</button></div>`;
    $('#retry-coach').onclick = () => explainSeam(index);
  }
}

function setActiveMeasure(index) {
  document.querySelectorAll('.measure-group').forEach((measure) => measure.classList.toggle('is-playing', Number(measure.dataset.measure) === index));
}

/**
 * The one-and-only render pipeline. Every state mutation ends by calling this;
 * nothing else calls compile() or renderNotation() directly. Notation, audio
 * (via `segments`), and DOM all update from the same source in one pass.
 */
function rerender() {
  segments = compile(progression);
  renderChords(); renderSeams();
  const { measureCount } = renderNotation(elements.score, segments, progression.settings);
  $('#score-summary').textContent = `${ measureCount } measure${ measureCount === 1 ? '' : 's' } · ${ segments.length } event${ segments.length === 1 ? '' : 's' }`;
  syncControls(); updateCoachContext();
}

populateChordControls($('#piano-dialog'));
$('#add-chord').onclick = () => { editingId = null; openPianoModal($('#piano-dialog'), null, saveChord, progression.settings.timeSig, progression.settings.key); };
$('#reset-example').onclick = () => { stopPlayback(); progression = makeDefaultProgression(); keySourceNotes.clear(); keySourceHints.clear(); applyKeyToMaterial(); selectedSeam = 0; setActiveMeasure(null); clearCoach(); $('#playback-status').value = 'Example restored'; $('#playback-pulse').classList.remove('active'); rerender(); };
$('#play').onclick = async () => {
  $('#play').disabled = true; $('#playback-pulse').classList.add('active'); $('#playback-status').value = 'Loading piano…';
  try {
    await playSegments(segments, progression.settings, (measure) => { setActiveMeasure(measure); if (measure !== null) $('#playback-status').value = `Playing measure ${ measure + 1 }`; }, () => { $('#play').disabled = false; $('#playback-pulse').classList.remove('active'); $('#playback-status').value = 'Playback complete'; });
  } catch (error) {
    $('#play').disabled = false; $('#playback-pulse').classList.remove('active'); $('#playback-status').value = error.message;
  }
};
$('#stop').onclick = () => { stopPlayback(); setActiveMeasure(null); $('#play').disabled = false; $('#playback-pulse').classList.remove('active'); $('#playback-status').value = 'Stopped'; };
$('#tempo').oninput = (event) => { progression.settings.tempo = Number(event.target.value); $('#tempo-value').value = event.target.value; };
$('#time-signature').onchange = (event) => { const [num, den] = event.target.value.split('/').map(Number); progression.settings.timeSig = { num, den }; clearCoach(); rerender(); };
$('#key-signature').onchange = (event) => { progression.settings.key = Number(event.target.value); applyKeyToMaterial(); clearCoach(); rerender(); };
$('#clef').onchange = (event) => { progression.settings.clef = event.target.value; rerender(); };
function setScoreZoom(nextZoom) {
  scoreZoom = Math.max(0.7, Math.min(1.5, Math.round(nextZoom * 10) / 10));
  elements.score.style.zoom = String(scoreZoom);
  $('#score-zoom-value').textContent = `${ Math.round(scoreZoom * 100) }% · scroll score to zoom`;
}
$('.notation-stage').addEventListener('wheel', (event) => {
  if (event.deltaY === 0) return;
  event.preventDefault();
  setScoreZoom(scoreZoom + (event.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });
window.addEventListener('resize', () => renderNotation(elements.score, segments, progression.settings));
applyKeyToMaterial();
rerender();
setScoreZoom(scoreZoom);
