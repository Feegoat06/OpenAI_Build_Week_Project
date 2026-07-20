/**
 * Left composition workspace: project title (with an Edit Project Settings
 * button beside it) and one ordered progression list. Each transition is
 * rendered at the seam between its two adjacent chord rows.
 *
 * State lives in editor-view.js; this module renders from it and hands user
 * events back through `callbacks`. Score settings (tempo, time signature,
 * key, clef) are now edited through the shared project-settings-modal opened
 * by the pencil button — they no longer have inline controls here.
 */
import { availableBeats, beatChoicesForMeter, chordTotalBeats, barsToBeats, beatsToBars, isTechniqueUsable } from '../state.js';
import { chordDisplayName, formatChordSymbol, noteName, chordToneName, chordSpellingIdentity } from '../engine/chords.js';
import { evaluateAllTechniques } from '../engine/technique-eligibility.js';
import { escapeHtml } from '../util/html.js';
import { majorKeyName, timeSigLabel, tempoLabel } from '../util/labels.js';
import { icon } from './icons.js';

const TEMPLATE = `
<header class="brand-block">
  <button id="brand-home" class="brand-home" type="button" aria-label="View all projects">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="brand-copy"><span class="brand">LEGATO</span>
      <span class="brand-subtitle">Progression coach</span>
    </span>
  </button>
  <button id="view-all-projects" class="text-action view-all-projects" type="button">${ icon('home') }<span>All projects</span></button>
</header>

<div class="editor-scroll">
  <section class="project-title-block">
    <div class="project-title-row">
      <input id="project-name-input" class="project-name-input" type="text" spellcheck="false" autocomplete="off" aria-label="Project name" />
      <button id="edit-project-settings" class="edit-project-settings" type="button">
        ${ icon('edit') }<span>Edit Project Settings</span>
      </button>
    </div>
    <div id="project-meta-pills" class="project-meta-pills"></div>
  </section>

  <section class="editor-section" aria-labelledby="chords-title">
    <div class="section-title">
      <h2 id="chords-title" class="section-heading">Chords</h2><button id="add-chord" class="primary-action" type="button">${ icon('plus') }<span>Add Chord</span></button>
    </div>
    <div id="progression-list" class="progression-list"></div>
  </section>
</div>
`;

export function mountEditorPanel({ container, callbacks }) {
  container.classList.add('editor-pane');
  container.innerHTML = TEMPLATE;

  const editorScrollEl = container.querySelector('.editor-scroll');
  const progressionListEl = container.querySelector('#progression-list');
  const chordsSectionEl = progressionListEl.closest('.editor-section');
  const addChordBtn = container.querySelector('#add-chord');
  const brandHomeBtn = container.querySelector('#brand-home');
  const viewAllBtn = container.querySelector('#view-all-projects');
  const projectNameInput = container.querySelector('#project-name-input');
  const editSettingsBtn = container.querySelector('#edit-project-settings');
  const metaPillsEl = container.querySelector('#project-meta-pills');
  const expandedSeamIndexes = new Set();
  let directEditorOpenForCurrentRender = null;

  addChordBtn.onclick = () => callbacks.onAddChord();
  brandHomeBtn.onclick = () => callbacks.onGoHome();
  viewAllBtn.onclick = () => callbacks.onGoHome();
  editSettingsBtn.onclick = () => callbacks.onEditProjectSettings();
  projectNameInput.onblur = () => callbacks.onRenameProject(projectNameInput.value);
  projectNameInput.onkeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); projectNameInput.blur(); }
    if (event.key === 'Escape') { projectNameInput.value = projectNameInput.dataset.lastCommitted ?? ''; projectNameInput.blur(); }
  };

  function makeChordRow(progression, chord, index) {
    const timeSig = progression.settings.timeSig;
    const beatChoices = beatChoicesForMeter(timeSig);
    const row = document.createElement('article');
    row.className = 'chord-row';
    const identity = chordSpellingIdentity(chord);
    const notes = chord.notes.map((note) => identity
      ? chordToneName(note, identity, progression.settings.key)
      : noteName(note, progression.settings.key)).join(' · ');
    const currentBeats = Number(barsToBeats(chord.bars, timeSig).toFixed(4));
    const options = beatChoices.includes(currentBeats) ? beatChoices : [...beatChoices, currentBeats].sort((a, b) => a - b);
    const displayName = escapeHtml(chordDisplayName(chord, progression.settings.key));
    const glyphHtml = renderChordGlyph(formatChordSymbol(chord, progression.settings.key));
    row.innerHTML = `<button class="chord-main" aria-label="Edit ${ displayName }"><strong class="chord-glyph">${ glyphHtml }</strong><small>${ escapeHtml(notes) }</small></button><label class="chord-beats" aria-label="Beats for ${ displayName }"><span class="chord-beats-display" aria-hidden="true">${ formatBeatDisplay(currentBeats) } <em>${ currentBeats === 1 ? 'beat' : 'beats' }</em></span><select class="chord-beats-select">${ options.map((beats) => `<option value="${ beats }" ${ beats === currentBeats ? 'selected' : '' }>${ formatBeatDisplay(beats) }</option>`).join('') }</select></label><button class="delete-button" aria-label="Delete ${ displayName }">${ icon('trash') }</button>`;
    row.querySelector('.chord-main').onclick = () => callbacks.onEditChord(chord);
    row.querySelector('.chord-beats-select').onchange = (event) => callbacks.onSetChordBeats(chord, Number(event.target.value));
    row.querySelector('.delete-button').onclick = () => callbacks.onDeleteChord(chord);
    return row;
  }

  function renderChordGlyph({ root, baseline, marker, suffix, superscript, plain }) {
    if (!root) return escapeHtml(plain);
    const rootHtml = escapeHtml(root);
    const baselineHtml = baseline ? escapeHtml(baseline) : '';
    const markerHtml = marker ? `<sup class="chord-quality-marker">${ escapeHtml(marker) }</sup>` : '';
    const suffixHtml = suffix ? `<sup class="chord-quality-suffix">${ escapeHtml(suffix) }</sup>` : '';
    const supHtml = superscript ? `<sup>${ escapeHtml(superscript) }</sup>` : '';
    return `${ rootHtml }${ baselineHtml }${ markerHtml }${ suffixHtml }${ supHtml }`;
  }

  function formatBeatDisplay(beats) {
    if (beats === 0.5) return '½';
    if (beats === 1.5) return '1½';
    return String(beats);
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
      : `${ icon('plus', 'transition-label-icon') } Add transition`;
    seam.innerHTML = `<div class="transition-connector"><button class="transition-toggle" type="button" aria-expanded="${ isOpen }"><span class="transition-rule" aria-hidden="true"></span><span class="transition-label">${ toggleLabel }</span><span class="transition-rule" aria-hidden="true"></span></button></div>${ isOpen ? `<div class="transition-editor"><div class="transition-editor-copy"><small>${ budget } beat${ budget === 1 ? '' : 's' } available in the departing tail</small></div><label>Technique <select class="transition-select" aria-label="Technique for ${ fromName } to ${ toName }"></select></label></div>` : '' }`;
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
    const isEmpty = !progression.chords.length;
    editorScrollEl.classList.toggle('editor-scroll--empty', isEmpty);
    chordsSectionEl.classList.toggle('editor-section--empty', isEmpty);
    if (isEmpty) {
      progressionListEl.append(makeEmptyState());
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

  function renderMetaPills(settings) {
    metaPillsEl.replaceChildren();
    const pills = [
      { label: timeSigLabel(settings.timeSig), variant: 'filled' },
      { label: majorKeyName(settings.key), variant: 'outline' },
      { label: tempoLabel(settings.tempo), variant: 'outline' },
    ];
    for (const pill of pills) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `meta-pill meta-pill--${ pill.variant }`;
      el.textContent = pill.label;
      el.setAttribute('aria-label', `Edit project settings: ${ pill.label }`);
      el.onclick = () => callbacks.onEditProjectSettings();
      metaPillsEl.append(el);
    }
  }

  function makeEmptyState() {
    // See css/editor-pane.css `.empty-state` for the treatment. The
    // Tenutino SVG is a rough placeholder — the design handoff calls for a
    // sourced illustration in the same abstract-line-art style before ship.
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = `
      <div class="empty-state-illustration" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="50" cy="62" rx="26" ry="30" fill="currentColor"></ellipse>
          <path d="M22 40 C20 26 32 12 50 12 C68 12 82 24 78 42 C82 34 74 52 68 46 C64 42 60 38 50 40 C40 42 32 46 32 48 C30 44 24 46 22 40 Z" fill="var(--panel-3)"></path>
          <circle cx="42" cy="60" r="2" fill="var(--ink)"></circle>
          <circle cx="58" cy="60" r="2" fill="var(--ink)"></circle>
          <path d="M45 72 Q50 74 55 72" stroke="var(--ink)" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
        </svg>
      </div>
      <div class="empty-state-copy">
        <h3 class="empty-state-headline">Tenutino is waiting.</h3>
        <p class="empty-state-subcopy">Add a chord to begin!</p>
      </div>
    `;
    return el;
  }

  function syncProjectName(name) {
    // Don't overwrite while the user is actively editing.
    if (document.activeElement === projectNameInput) return;
    projectNameInput.value = name ?? '';
    projectNameInput.dataset.lastCommitted = projectNameInput.value;
  }

  return {
    render({ progression, selectedSeam, projectName }) {
      syncProjectName(projectName);
      renderMetaPills(progression.settings);
      renderProgression(progression, selectedSeam);
    },
  };
}
