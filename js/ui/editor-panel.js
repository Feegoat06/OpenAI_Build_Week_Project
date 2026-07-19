/**
 * Scene inspector: one ordered chord/transition timeline.
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
<div class="editor-scroll">
  <section class="project-title-block">
    <p class="kicker">Composition plan</p>
    <input id="project-name-input" class="project-name-input" type="text" spellcheck="false" autocomplete="off" aria-label="Project name" />
    <p class="inspector-copy">Keep the full harmonic route visible while the score stays on the stand.</p>
    <button id="load-example" class="inspector-reset" type="button">Reload example</button>
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
  const addChordBtn = container.querySelector('#add-chord');
  const projectNameInput = container.querySelector('#project-name-input');
  const expandedSeamIndexes = new Set();
  let directEditorOpenForCurrentRender = null;

  addChordBtn.onclick = () => callbacks.onAddChord();
  container.querySelector('#load-example').onclick = () => callbacks.onLoadExample();
  projectNameInput.onblur = () => callbacks.onRenameProject(projectNameInput.value);
  projectNameInput.onkeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); projectNameInput.blur(); }
    if (event.key === 'Escape') { projectNameInput.value = projectNameInput.dataset.lastCommitted ?? ''; projectNameInput.blur(); }
  };
  function makeChordRow(progression, chord, index, selectedChordId) {
    const timeSig = progression.settings.timeSig;
    const beatChoices = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
    const beatLabel = (beats) => beats === 0.5 ? '½' : beats === 1.5 ? '1½' : String(beats);
    const row = document.createElement('article');
    row.className = `chord-row ${ selectedChordId === chord.id ? 'selected' : '' }`;
    row.dataset.chordId = chord.id;
    const notes = chord.notes.map((note) => noteName(note, progression.settings.key)).join(' · ');
    const currentBeats = Number(barsToBeats(chord.bars, timeSig).toFixed(4));
    const options = beatChoices.includes(currentBeats) ? beatChoices : [...beatChoices, currentBeats].sort((a, b) => a - b);
    const displayName = escapeHtml(chordDisplayName(chord, progression.settings.key));
    row.innerHTML = `<button class="chord-main" aria-label="Edit ${ displayName }"><strong>${ displayName }</strong><small>${ escapeHtml(notes) }</small></button><select class="chord-bars" aria-label="Beats for ${ displayName }">${ options.map((beats) => `<option value="${ beats }" ${ beats === currentBeats ? 'selected' : '' }>${ beatLabel(beats) }</option>`).join('') }</select><button class="delete-button" aria-label="Delete ${ displayName }">×</button>`;
    row.querySelector('.chord-main').onclick = () => { callbacks.onSelectChord?.(chord.id); callbacks.onEditChord(chord); };
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
    seam.dataset.seamIndex = String(index);
    const toggleLabel = selectedTechnique
      ? `${ escapeHtml(selectedTechnique.name) } · ${ formatBeatCost(selectedTechnique.beatCost) }`
      : '+ Add transition';
    seam.innerHTML = `<div class="transition-connector"><button class="transition-toggle" type="button" aria-expanded="${ isOpen }"><span class="transition-rule" aria-hidden="true"></span><span class="transition-label">${ toggleLabel }</span><span class="transition-rule" aria-hidden="true"></span></button><button class="transition-explain" type="button">Ask LEGATO</button></div>${ isOpen ? `<div class="transition-editor"><div class="transition-editor-copy"><strong>${ fromName } → ${ toName }</strong><small>${ budget } beat${ budget === 1 ? '' : 's' } available in the departing tail</small></div><label>Technique <select class="transition-select" aria-label="Technique for ${ fromName } to ${ toName }"></select></label></div>` : '' }`;
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
    seam.querySelector('.transition-explain').onclick = () => callbacks.onAskSeam(index);
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

  function renderProgression(progression, selectedSeam, selectedChordId) {
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
      progressionListEl.append(makeChordRow(progression, chord, index, selectedChordId));
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
    render({ progression, selectedSeam, selectedChordId, projectName }) {
      syncProjectName(projectName);
      renderProgression(progression, selectedSeam, selectedChordId);
    },
    scrollToChord(chordId) { progressionListEl.querySelector(`[data-chord-id="${ CSS.escape(chordId) }"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    scrollToSeam(index) { progressionListEl.querySelector(`[data-seam-index="${ index }"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  };
}
