/**
 * Left composition workspace: score settings plus one ordered progression list.
 * Each transition is rendered at the seam between its two adjacent chord rows.
 *
 * State lives in main.js; this module renders from it and hands user events
 * back through `callbacks`. Every render is idempotent — main.js calls
 * `render(state)` after any mutation and this rebuilds the chord/seam rows.
 */
import { availableBeats, chordTotalBeats, barsToBeats, beatsToBars, isTechniqueUsable } from '../state.js';
import { chordDisplayName, noteName } from '../engine/chords.js';
import { evaluateAllTechniques } from '../engine/technique-eligibility.js';
import { escapeHtml } from '../util/html.js';

const TEMPLATE = `
<header class="brand-block">
  <button id="brand-home" class="brand-home" type="button" aria-label="View all projects">
    <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
    <span class="brand-copy"><span class="brand">LEGATO</span>
      <span class="brand-subtitle">Progression coach</span>
    </span>
  </button>
  <button id="view-all-projects" class="text-action view-all-projects" type="button">View all projects</button>
  <button id="toggle-score-settings" class="icon-button" type="button" aria-label="Show score settings" aria-controls="score-settings" aria-expanded="false">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.3h4.8l.6 2.2a7.3 7.3 0 0 1 1.7 1l2.1-.7 2.4 4.1-1.6 1.6a7 7 0 0 1 0 2l1.6 1.6-2.4 4.1-2.1-.7a7.3 7.3 0 0 1-1.7 1l-.6 2.2H9.6L9 19.5a7.3 7.3 0 0 1-1.7-1l-2.1.7-2.4-4.1 1.6-1.6a7 7 0 0 1 0-2L2.8 9.9l2.4-4.1 2.1.7a7.3 7.3 0 0 1 1.7-1l.6-2.2Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
  </button>
</header>

<div class="editor-scroll">
  <section class="project-title-block">
    <p class="kicker">Project</p>
    <input id="project-name-input" class="project-name-input" type="text" spellcheck="false" autocomplete="off" aria-label="Project name" />
  </section>

  <section id="score-settings" class="settings-panel" aria-labelledby="score-settings-title" hidden>
    <div class="section-title">
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
    <div class="section-title">
      <h2 id="chords-title">Chord material</h2><button id="add-chord" class="text-action">+ Add chord</button>
    </div>
    <div class="table-head"><span>Voicing</span><span>Beats</span><span></span></div>
    <div id="progression-list" class="progression-list"></div>
  </section>
</div>
`;

export function mountEditorPanel({ container, callbacks }) {
  container.classList.add('editor-pane');
  container.innerHTML = TEMPLATE;

  const progressionListEl = container.querySelector('#progression-list');
  const scoreSettingsEl = container.querySelector('#score-settings');
  const scoreSettingsButton = container.querySelector('#toggle-score-settings');
  const tempoInput = container.querySelector('#tempo');
  const tempoValue = container.querySelector('#tempo-value');
  const timeSigSelect = container.querySelector('#time-signature');
  const keySigSelect = container.querySelector('#key-signature');
  const clefSelect = container.querySelector('#clef');
  const addChordBtn = container.querySelector('#add-chord');
  const brandHomeBtn = container.querySelector('#brand-home');
  const viewAllBtn = container.querySelector('#view-all-projects');
  const projectNameInput = container.querySelector('#project-name-input');
  let scoreSettingsOpen = false;
  const expandedSeamIndexes = new Set();
  let directEditorOpenForCurrentRender = null;

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
  brandHomeBtn.onclick = () => callbacks.onGoHome();
  viewAllBtn.onclick = () => callbacks.onGoHome();
  projectNameInput.onblur = () => callbacks.onRenameProject(projectNameInput.value);
  projectNameInput.onkeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); projectNameInput.blur(); }
    if (event.key === 'Escape') { projectNameInput.value = projectNameInput.dataset.lastCommitted ?? ''; projectNameInput.blur(); }
  };
  scoreSettingsButton.onclick = () => {
    scoreSettingsOpen = !scoreSettingsOpen;
    scoreSettingsEl.hidden = !scoreSettingsOpen;
    scoreSettingsButton.setAttribute('aria-expanded', String(scoreSettingsOpen));
    scoreSettingsButton.setAttribute('aria-label', `${ scoreSettingsOpen ? 'Hide' : 'Show' } score settings`);
  };

  function syncSettings(settings) {
    tempoInput.value = String(settings.tempo);
    tempoValue.value = String(settings.tempo);
    timeSigSelect.value = `${ settings.timeSig.num }/${ settings.timeSig.den }`;
    keySigSelect.value = String(settings.key);
    clefSelect.value = settings.clef;
  }

  function makeChordRow(progression, chord, index) {
    const timeSig = progression.settings.timeSig;
    const beatChoices = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
    const beatLabel = (beats) => beats === 0.5 ? '½' : beats === 1.5 ? '1½' : String(beats);
    const row = document.createElement('article');
    row.className = 'chord-row';
    const notes = chord.notes.map((note) => noteName(note, progression.settings.key)).join(' · ');
    const currentBeats = Number(barsToBeats(chord.bars, timeSig).toFixed(4));
    const options = beatChoices.includes(currentBeats) ? beatChoices : [...beatChoices, currentBeats].sort((a, b) => a - b);
    const displayName = escapeHtml(chordDisplayName(chord, progression.settings.key));
    row.innerHTML = `<button class="chord-main" aria-label="Edit ${ displayName }"><strong>${ displayName }</strong><small>${ escapeHtml(notes) }</small></button><select class="chord-bars" aria-label="Beats for ${ displayName }">${ options.map((beats) => `<option value="${ beats }" ${ beats === currentBeats ? 'selected' : '' }>${ beatLabel(beats) }</option>`).join('') }</select><button class="delete-button" aria-label="Delete ${ displayName }">×</button>`;
    row.querySelector('.chord-main').onclick = () => callbacks.onEditChord(chord);
    row.querySelector('.chord-bars').onchange = (event) => callbacks.onSetChordBeats(chord, Number(event.target.value));
    row.querySelector('.delete-button').onclick = () => callbacks.onDeleteChord(chord);
    return row;
  }

  function formatBeatCost(beats) {
    return `${ beats } beat${ beats > 1 ? 's' : '' }`;
  }

  function addTechniqueOptions(select, techniques, departingChord, timeSig, budget) {
    select.add(new Option('Direct transition (None)', ''));
    techniques.forEach((technique) => {
      const affordable = isTechniqueUsable(technique, departingChord, timeSig);
      const option = new Option(`${ technique.name } · ${ formatBeatCost(technique.beatCost) }`, technique.id, false, false);
      option.disabled = !technique.valid || !affordable;
      option.title = !technique.valid ? technique.reason : (!affordable ? `Requires ${ formatBeatCost(technique.beatCost) }; only ${ budget } available.` : '');
      select.add(option);
    });
  }

  function makeTransitionSeam(progression, index, selectedSeam) {
    const selectedTechniqueId = progression.seams[index];
    const fromChord = progression.chords[index];
    const toChord = progression.chords[index + 1];
    const budget = availableBeats(chordTotalBeats(fromChord, progression.settings.timeSig));
    const techniques = evaluateAllTechniques(fromChord, toChord);
    const selectedTechnique = techniques.find((technique) => technique.id === selectedTechniqueId);
    const fromName = escapeHtml(chordDisplayName(fromChord, progression.settings.key));
    const toName = escapeHtml(chordDisplayName(toChord, progression.settings.key));
    const isOpen = expandedSeamIndexes.has(index);
    const seam = document.createElement('article');
    seam.className = `transition-seam ${ selectedTechnique ? 'has-technique' : 'is-direct' } ${ selectedSeam === index ? 'selected' : '' } ${ isOpen ? 'is-open' : '' }`;
    const toggleLabel = selectedTechnique
      ? `${ escapeHtml(selectedTechnique.name) } · ${ formatBeatCost(selectedTechnique.beatCost) }`
      : '+ Add transition';
    seam.innerHTML = `<div class="transition-connector"><button class="transition-toggle" type="button" aria-expanded="${ isOpen }"><span class="transition-rule" aria-hidden="true"></span><span class="transition-label">${ toggleLabel }</span><span class="transition-rule" aria-hidden="true"></span></button><button class="transition-explain" type="button">Explain</button></div>${ isOpen ? `<div class="transition-editor"><div class="transition-editor-copy"><strong>${ fromName } → ${ toName }</strong><small>${ budget } beat${ budget === 1 ? '' : 's' } available in the departing tail</small></div><label>Technique <select class="transition-select" aria-label="Technique for ${ fromName } to ${ toName }"></select></label></div>` : '' }`;
    const toggle = seam.querySelector('.transition-toggle');
    toggle.onclick = () => {
      if (isOpen) {
        expandedSeamIndexes.delete(index);
      } else {
        expandedSeamIndexes.add(index);
        // A direct seam survives the selection render that opened it, then
        // closes on the next state update unless a technique is chosen.
        directEditorOpenForCurrentRender = selectedTechnique ? null : index;
      }
      callbacks.onSelectSeam(index);
    };
    seam.querySelector('.transition-explain').onclick = () => callbacks.onExplainSeam(index);
    const select = seam.querySelector('.transition-select');
    if (select) {
      addTechniqueOptions(select, techniques, fromChord, progression.settings.timeSig, budget);
      select.value = selectedTechniqueId ?? '';
      select.onchange = () => {
        const techniqueId = select.value || null;
        if (techniqueId) expandedSeamIndexes.add(index);
        else expandedSeamIndexes.delete(index);
        directEditorOpenForCurrentRender = null;
        callbacks.onSetSeamTechnique(index, techniqueId);
      };
    }
    return seam;
  }

  function renderProgression(progression, selectedSeam) {
    progressionListEl.replaceChildren();
    if (!progression.chords.length) {
      progressionListEl.innerHTML = '<div class="empty-state">No material yet. Add a chord and choose its exact piano voicing.</div>';
      return;
    }
    expandedSeamIndexes.forEach((index) => {
      const isDirect = !progression.seams[index];
      const isOutOfRange = index >= progression.seams.length;
      if (isOutOfRange || (isDirect && directEditorOpenForCurrentRender !== index)) {
        expandedSeamIndexes.delete(index);
      }
    });
    directEditorOpenForCurrentRender = null;
    progression.chords.forEach((chord, index) => {
      progressionListEl.append(makeChordRow(progression, chord, index));
      if (index < progression.seams.length) progressionListEl.append(makeTransitionSeam(progression, index, selectedSeam));
    });
  }

  function syncProjectName(name) {
    // Don't overwrite while the user is actively editing.
    if (document.activeElement === projectNameInput) return;
    projectNameInput.value = name ?? '';
    projectNameInput.dataset.lastCommitted = projectNameInput.value;
  }

  return {
    render({ progression, selectedSeam, projectName }) {
      syncSettings(progression.settings);
      syncProjectName(projectName);
      renderProgression(progression, selectedSeam);
    },
  };
}
