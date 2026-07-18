/**
 * Left composition workspace: score settings, chord list, and transition
 * seams. Owns every DOM node inside <aside class="editor-pane">.
 *
 * State lives in main.js; this module renders from it and hands user events
 * back through `callbacks`. Every render is idempotent — main.js calls
 * `render(state)` after any mutation and this rebuilds the chord/seam rows.
 */
import { availableBeats, chordTotalBeats, barsToBeats, beatsToBars } from '../state.js';
import { chordDisplayName, noteName } from '../engine/chords.js';
import { evaluateAllTechniques } from '../engine/technique-eligibility.js';
import { escapeHtml } from '../util/html.js';

const TEMPLATE = `
<header class="brand-block">
  <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
  <div><a class="brand" href="#">LEGATO</a>
    <p>Progression coach</p>
  </div>
  <span class="build-tag">EDU / 01</span>
</header>

<div class="editor-scroll">
  <section class="intro-block">
    <p class="kicker">Composition workspace</p>
    <h1>Build the space<br><em>between chords.</em></h1>
    <p class="intro-copy">Place exact piano voicings, shape the connective tissue, then listen for what changed.</p>
  </section>

  <section class="editor-section" aria-labelledby="score-settings-title">
    <div class="section-title"><span>01</span>
      <h2 id="score-settings-title">Score settings</h2>
    </div>
    <div class="settings-grid">
      <label class="tempo-control"><span>Tempo</span>
        <div><input id="tempo" type="range" min="40" max="180" value="96"><output id="tempo-value">96</output><small>BPM</small></div>
      </label>
      <label><span>Meter</span><select id="time-signature">
          <option>3/4</option>
          <option selected>4/4</option>
          <option>5/4</option>
          <option>7/4</option>
          <option>6/8</option>
        </select></label>
      <label><span>Key signature</span><select id="key-signature">
          <option value="-3">E♭ · 3 flats</option>
          <option value="-2">B♭ · 2 flats</option>
          <option value="-1">F · 1 flat</option>
          <option value="0" selected>C · no accidentals</option>
          <option value="1">G · 1 sharp</option>
          <option value="2">D · 2 sharps</option>
          <option value="3">A · 3 sharps</option>
        </select></label>
      <label><span>Clef</span><select id="clef">
          <option value="auto">Auto</option>
          <option value="treble">Treble</option>
          <option value="bass">Bass</option>
        </select></label>
    </div>
    <p class="field-note">Key signature moves only its matching natural notes by a sharp or flat; it never globally transposes the progression.</p>
  </section>

  <section class="editor-section" aria-labelledby="chords-title">
    <div class="section-title"><span>02</span>
      <h2 id="chords-title">Chord material</h2><button id="add-chord" class="text-action">+ Add chord</button>
    </div>
    <div class="table-head"><span>Voicing</span><span>Beats</span><span></span></div>
    <div id="chord-list" class="chord-list"></div>
  </section>

  <section class="editor-section" aria-labelledby="seams-title">
    <div class="section-title"><span>03</span>
      <h2 id="seams-title">Transitions</h2>
    </div>
    <p class="section-copy">Techniques appear only when the departing chord has enough space.</p>
    <div id="seam-list" class="seam-list"></div>
  </section>
</div>
`;

export function mountEditorPanel({ container, callbacks }) {
  container.classList.add('editor-pane');
  container.innerHTML = TEMPLATE;

  const chordListEl = container.querySelector('#chord-list');
  const seamListEl = container.querySelector('#seam-list');
  const tempoInput = container.querySelector('#tempo');
  const tempoValue = container.querySelector('#tempo-value');
  const timeSigSelect = container.querySelector('#time-signature');
  const keySigSelect = container.querySelector('#key-signature');
  const clefSelect = container.querySelector('#clef');
  const addChordBtn = container.querySelector('#add-chord');

  tempoInput.oninput = (event) => {
    tempoValue.value = event.target.value;
    callbacks.onTempoInput(Number(event.target.value));
  };
  timeSigSelect.onchange = (event) => {
    const [num, den] = event.target.value.split('/').map(Number);
    callbacks.onTimeSigChange({ num, den });
  };
  keySigSelect.onchange = (event) => callbacks.onKeyChange(Number(event.target.value));
  clefSelect.onchange = (event) => callbacks.onClefChange(event.target.value);
  addChordBtn.onclick = () => callbacks.onAddChord();

  function syncSettings(settings) {
    tempoInput.value = String(settings.tempo);
    tempoValue.value = String(settings.tempo);
    timeSigSelect.value = `${ settings.timeSig.num }/${ settings.timeSig.den }`;
    keySigSelect.value = String(settings.key);
    clefSelect.value = settings.clef;
  }

  function renderChords(progression) {
    chordListEl.replaceChildren();
    if (!progression.chords.length) {
      chordListEl.innerHTML = '<div class="empty-state">No material yet. Add a chord and choose its exact piano voicing.</div>';
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
      const displayName = escapeHtml(chordDisplayName(chord, progression.settings.key));
      row.innerHTML = `<button class="chord-main" aria-label="Edit chord ${ index + 1 }"><strong>${ String(index + 1).padStart(2, '0') } · ${ displayName }</strong><small>${ escapeHtml(notes) }</small></button><select class="chord-bars" aria-label="Beats for chord ${ index + 1 }">${ options.map((beats) => `<option value="${ beats }" ${ beats === currentBeats ? 'selected' : '' }>${ beatLabel(beats) }</option>`).join('') }</select><button class="delete-button" aria-label="Delete chord ${ index + 1 }">×</button>`;
      row.querySelector('.chord-main').onclick = () => callbacks.onEditChord(chord);
      row.querySelector('.chord-bars').onchange = (event) => callbacks.onSetChordBeats(chord, Number(event.target.value));
      row.querySelector('.delete-button').onclick = () => callbacks.onDeleteChord(chord);
      chordListEl.append(row);
    });
  }

  function renderSeams(progression, selectedSeam) {
    seamListEl.replaceChildren();
    if (!progression.seams.length) {
      seamListEl.innerHTML = '<div class="empty-state">Add at least two chords to create a transition seam.</div>';
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
      select.onchange = () => callbacks.onSetSeamTechnique(index, select.value || null);
      row.querySelector('.seam-explain').onclick = () => callbacks.onExplainSeam(index);
      row.onclick = (event) => {
        if (event.target === select || event.target.closest('button')) return;
        callbacks.onSelectSeam(index);
      };
      seamListEl.append(row);
    });
  }

  return {
    render({ progression, selectedSeam }) {
      syncSettings(progression.settings);
      renderChords(progression);
      renderSeams(progression, selectedSeam);
    },
  };
}
