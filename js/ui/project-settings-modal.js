/**
 * The "Project settings" modal — shared by the create-project flow on the
 * landing page and the edit flow on the editor page.
 *
 * Two entry points:
 *   - `mountProjectSettingsModal({ container })` injects the dialog template
 *     into a mount div and returns the <dialog> element.
 *   - `openProjectSettingsModal(dialog, { mode, initial, onSubmit })` opens
 *     the dialog with either "Create new project" or "Edit project settings"
 *     chrome. On submit, calls `onSubmit({ name, settings })` with freshly-
 *     built values; the caller decides whether to createProject or to mutate
 *     an existing progression's settings.
 *
 * The modal is presentation-only: it never touches the store, the router, or
 * progression.chords/seams. The full -7..+7 range of circle-of-fifths key
 * signatures is offered via a 12-wedge dial plus enharmonic chips; the engine
 * already supports the full range.
 */
import { installBackdropDismissal } from './dialog.js';
import { TEMPO_MIN, TEMPO_MAX, TEMPO_DEFAULT } from '../state.js';

// 12 clock positions around the dial, going clockwise from 12 o'clock. Each
// wedge stores its canonical circle-of-fifths integer. The enharmonic zones
// (positions 5, 6, 7) default to the fewer-accidental spelling; the three
// alternates (7♭, 6♭, 7♯) are reachable via the chip row below the dial.
const WEDGES = [
  { key: 0, major: 'C', minor: 'Am' },
  { key: 1, major: 'G', minor: 'Em' },
  { key: 2, major: 'D', minor: 'Bm' },
  { key: 3, major: 'A', minor: 'F♯m' },
  { key: 4, major: 'E', minor: 'C♯m' },
  { key: 5, major: 'B', minor: 'G♯m' },
  { key: 6, major: 'F♯', minor: 'D♯m' },
  { key: -5, major: 'D♭', minor: 'B♭m' },
  { key: -4, major: 'A♭', minor: 'Fm' },
  { key: -3, major: 'E♭', minor: 'Cm' },
  { key: -2, major: 'B♭', minor: 'Gm' },
  { key: -1, major: 'F', minor: 'Dm' },
];

const ENHARMONIC_ALTS = [
  { key: -7, label: 'C♭ · 7♭' },
  { key: -6, label: 'G♭ · 6♭' },
  { key: 7, label: 'C♯ · 7♯' },
];

// Maps a raw key value to the wedge index that should visually light up.
// Enharmonics fall onto their sibling wedge.
const ENHARMONIC_TO_WEDGE = { [-7]: 5, [-6]: 6, [7]: 7 };

const KEY_LABELS = {
  '-7': 'C♭ major / A♭ minor · 7 flats',
  '-6': 'G♭ major / E♭ minor · 6 flats',
  '-5': 'D♭ major / B♭ minor · 5 flats',
  '-4': 'A♭ major / F minor · 4 flats',
  '-3': 'E♭ major / C minor · 3 flats',
  '-2': 'B♭ major / G minor · 2 flats',
  '-1': 'F major / D minor · 1 flat',
  '0': 'C major / A minor · no accidentals',
  '1': 'G major / E minor · 1 sharp',
  '2': 'D major / B minor · 2 sharps',
  '3': 'A major / F♯ minor · 3 sharps',
  '4': 'E major / C♯ minor · 4 sharps',
  '5': 'B major / G♯ minor · 5 sharps',
  '6': 'F♯ major / D♯ minor · 6 sharps',
  '7': 'C♯ major / A♯ minor · 7 sharps',
};

const TIME_SIG_OPTIONS = ['3/4', '4/4', '5/4', '7/4', '6/8'];

const TEMPO_INPUT_ATTRS = `min="${ TEMPO_MIN }" max="${ TEMPO_MAX }" step="1" inputmode="numeric"`;

const DIAL_SIZE = 260;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_OUTER_RADIUS = 122;
const DIAL_MINOR_RADIUS = 78;
const DIAL_INNER_RADIUS = 44;

const DIALOG_TEMPLATE = `
<dialog id="project-settings-dialog">
  <form method="dialog" class="dialog-shell project-settings-shell" onsubmit="return false">
    <header class="dialog-header">
      <div>
        <p class="kicker" id="project-settings-kicker">Project</p>
        <h2 id="project-settings-title">Create new project</h2>
        <p id="project-settings-lede">Name your project and choose the score settings you'd like to start with.</p>
      </div>
      <button id="project-settings-cancel" class="close-button" type="button" aria-label="Close project settings">×</button>
    </header>
    <div class="project-settings-body">
      <label class="project-settings-name">
        <span>Project name</span>
        <input id="project-settings-name-input" type="text" spellcheck="false" autocomplete="off" maxlength="120" />
      </label>
      <div class="settings-grid">
        <label><span>Tempo</span>
          <div class="tempo-input-row">
            <input id="project-settings-tempo" type="number" ${ TEMPO_INPUT_ATTRS } />
            <small>BPM</small>
          </div>
        </label>
        <label><span>Meter</span>
          <select id="project-settings-meter"></select>
        </label>
        <label><span>Clef</span>
          <select id="project-settings-clef">
            <option value="auto">Auto</option>
            <option value="treble">Treble</option>
            <option value="bass">Bass</option>
          </select>
        </label>
      </div>
      <fieldset class="key-signature-fieldset">
        <legend>Key signature</legend>
        <div class="key-dial-container">
          <div id="project-settings-key-dial" class="key-dial" role="radiogroup" aria-label="Key signature"></div>
          <div class="key-dial-readout">
            <p class="kicker">Selected</p>
            <strong id="project-settings-key-label">C major / A minor</strong>
            <small id="project-settings-key-sub">No accidentals</small>
          </div>
        </div>
        <div class="key-enharmonics" id="project-settings-key-enharmonics" aria-label="Enharmonic alternatives"></div>
        <p class="field-note">Key signature only changes how the sheet music is spelled; it never alters the actual notes of any chord.</p>
      </fieldset>
    </div>
    <footer class="dialog-footer">
      <p id="project-settings-hint">Everything here can be changed later from the project title.</p>
      <button id="project-settings-submit" class="save-button" type="button">Create <span>→</span></button>
    </footer>
  </form>
</dialog>
`;

/** Inject the dialog HTML into `container` and return the <dialog> element. */
export function mountProjectSettingsModal({ container }) {
  container.innerHTML = DIALOG_TEMPLATE;
  const dialog = container.querySelector('#project-settings-dialog');
  populateStaticOptions(dialog);
  renderKeyDial(dialog);
  renderEnharmonicChips(dialog);
  return dialog;
}

function populateStaticOptions(dialog) {
  const meterSelect = dialog.querySelector('#project-settings-meter');
  TIME_SIG_OPTIONS.forEach((label) => meterSelect.add(new Option(label, label)));
}

function polar(angleRad, radius) {
  return {
    x: DIAL_CENTER + radius * Math.sin(angleRad),
    y: DIAL_CENTER - radius * Math.cos(angleRad),
  };
}

function renderKeyDial(dialog) {
  const container = dialog.querySelector('#project-settings-key-dial');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ DIAL_SIZE } ${ DIAL_SIZE }`);
  svg.setAttribute('class', 'key-dial-svg');
  svg.setAttribute('role', 'presentation');

  const wedgeGap = (Math.PI * 2) / WEDGES.length;
  WEDGES.forEach((wedge, index) => {
    const midAngle = index * wedgeGap;
    const startAngle = midAngle - wedgeGap / 2;
    const endAngle = midAngle + wedgeGap / 2;
    const p1 = polar(startAngle, DIAL_OUTER_RADIUS);
    const p2 = polar(endAngle, DIAL_OUTER_RADIUS);
    const p3 = polar(endAngle, DIAL_INNER_RADIUS);
    const p4 = polar(startAngle, DIAL_INNER_RADIUS);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', [
      `M ${ p1.x } ${ p1.y }`,
      `A ${ DIAL_OUTER_RADIUS } ${ DIAL_OUTER_RADIUS } 0 0 1 ${ p2.x } ${ p2.y }`,
      `L ${ p3.x } ${ p3.y }`,
      `A ${ DIAL_INNER_RADIUS } ${ DIAL_INNER_RADIUS } 0 0 0 ${ p4.x } ${ p4.y }`,
      'Z',
    ].join(' '));
    path.setAttribute('class', 'key-wedge');
    path.setAttribute('data-key', String(wedge.key));
    path.setAttribute('data-wedge-index', String(index));
    path.setAttribute('role', 'radio');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `${ wedge.major } major or ${ wedge.minor }`);
    svg.appendChild(path);

    // Divider between major and minor rings.
    const rDivider = (DIAL_MINOR_RADIUS + (DIAL_MINOR_RADIUS - 6));
    const divPStart = polar(startAngle, DIAL_MINOR_RADIUS);
    const divPEnd = polar(endAngle, DIAL_MINOR_RADIUS);
    void rDivider; void divPStart; void divPEnd; // (kept for future; no divider drawn now)

    // Major label — outer ring.
    const majorLabelPos = polar(midAngle, (DIAL_OUTER_RADIUS + DIAL_MINOR_RADIUS) / 2);
    const majorText = document.createElementNS(svgNS, 'text');
    majorText.setAttribute('x', String(majorLabelPos.x));
    majorText.setAttribute('y', String(majorLabelPos.y));
    majorText.setAttribute('text-anchor', 'middle');
    majorText.setAttribute('dominant-baseline', 'central');
    majorText.setAttribute('class', 'key-wedge-major');
    majorText.textContent = wedge.major;
    svg.appendChild(majorText);

    // Minor label — inner ring.
    const minorLabelPos = polar(midAngle, (DIAL_MINOR_RADIUS + DIAL_INNER_RADIUS) / 2);
    const minorText = document.createElementNS(svgNS, 'text');
    minorText.setAttribute('x', String(minorLabelPos.x));
    minorText.setAttribute('y', String(minorLabelPos.y));
    minorText.setAttribute('text-anchor', 'middle');
    minorText.setAttribute('dominant-baseline', 'central');
    minorText.setAttribute('class', 'key-wedge-minor');
    minorText.textContent = wedge.minor;
    svg.appendChild(minorText);
  });

  // Separator ring between major and minor labels.
  const ring = document.createElementNS(svgNS, 'circle');
  ring.setAttribute('cx', String(DIAL_CENTER));
  ring.setAttribute('cy', String(DIAL_CENTER));
  ring.setAttribute('r', String(DIAL_MINOR_RADIUS));
  ring.setAttribute('class', 'key-dial-ring');
  ring.setAttribute('fill', 'none');
  svg.appendChild(ring);

  container.replaceChildren(svg);
}

function renderEnharmonicChips(dialog) {
  const container = dialog.querySelector('#project-settings-key-enharmonics');
  container.replaceChildren();
  const heading = document.createElement('span');
  heading.className = 'key-enharmonics-label';
  heading.textContent = 'Enharmonic:';
  container.appendChild(heading);
  ENHARMONIC_ALTS.forEach((alt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'key-enharmonic-chip';
    btn.dataset.key = String(alt.key);
    btn.textContent = alt.label;
    container.appendChild(btn);
  });
}

/**
 * Open the modal.
 *
 * @param {HTMLDialogElement} dialog
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: { name: string, settings: { tempo: number, timeSig: {num:number, den:number}, key: number, clef: 'auto'|'treble'|'bass' } },
 *   onSubmit: (result: { name: string, settings: { tempo: number, timeSig: {num:number, den:number}, key: number, clef: 'auto'|'treble'|'bass' } }) => void
 * }} options
 */
export function openProjectSettingsModal(dialog, { mode, initial, onSubmit }) {
  const title = dialog.querySelector('#project-settings-title');
  const kicker = dialog.querySelector('#project-settings-kicker');
  const lede = dialog.querySelector('#project-settings-lede');
  const nameInput = dialog.querySelector('#project-settings-name-input');
  const tempoInput = dialog.querySelector('#project-settings-tempo');
  const meterSelect = dialog.querySelector('#project-settings-meter');
  const clefSelect = dialog.querySelector('#project-settings-clef');
  const cancelBtn = dialog.querySelector('#project-settings-cancel');
  const submitBtn = dialog.querySelector('#project-settings-submit');
  const hint = dialog.querySelector('#project-settings-hint');
  const dial = dialog.querySelector('#project-settings-key-dial');
  const enharmonics = dialog.querySelector('#project-settings-key-enharmonics');
  const keyLabel = dialog.querySelector('#project-settings-key-label');
  const keySubLabel = dialog.querySelector('#project-settings-key-sub');

  const isCreate = mode === 'create';
  kicker.textContent = isCreate ? 'New project' : 'Edit project';
  title.textContent = isCreate ? 'Create new project' : 'Edit project settings';
  lede.textContent = isCreate
    ? "Name your project and choose the score settings you'd like to start with."
    : 'Update the name or score settings for this project.';
  submitBtn.innerHTML = isCreate ? 'Create <span>→</span>' : 'Save <span>→</span>';
  hint.textContent = isCreate
    ? 'Everything here can be changed later from the project title.'
    : 'Changes apply immediately; cancel to discard.';

  nameInput.value = initial.name ?? '';
  tempoInput.value = String(initial.settings.tempo);
  meterSelect.value = `${ initial.settings.timeSig.num }/${ initial.settings.timeSig.den }`;
  clefSelect.value = initial.settings.clef;

  let currentKey = initial.settings.key;
  syncKeyUI();

  function syncKeyUI() {
    const canonical = ENHARMONIC_TO_WEDGE[currentKey] ?? null;
    const wedgeIndex = canonical != null
      ? canonical
      : WEDGES.findIndex((w) => w.key === currentKey);
    dial.querySelectorAll('.key-wedge').forEach((el) => {
      const idx = Number(el.dataset.wedgeIndex);
      const active = idx === wedgeIndex;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-checked', String(active));
    });
    enharmonics.querySelectorAll('.key-enharmonic-chip').forEach((el) => {
      const active = Number(el.dataset.key) === currentKey;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    const [main, sub] = (KEY_LABELS[String(currentKey)] ?? '').split(' · ');
    keyLabel.textContent = main ?? '';
    keySubLabel.textContent = sub ?? '';
  }

  dial.onclick = (event) => {
    const wedge = event.target.closest('.key-wedge');
    if (!wedge) return;
    currentKey = Number(wedge.dataset.key);
    syncKeyUI();
  };
  dial.onkeydown = (event) => {
    const wedge = event.target.closest('.key-wedge');
    if (!wedge) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      currentKey = Number(wedge.dataset.key);
      syncKeyUI();
    }
  };
  enharmonics.onclick = (event) => {
    const chip = event.target.closest('.key-enharmonic-chip');
    if (!chip) return;
    currentKey = Number(chip.dataset.key);
    syncKeyUI();
  };

  const close = () => dialog.close();
  cancelBtn.onclick = close;
  installBackdropDismissal(dialog, close);

  function commit() {
    const cleanName = (nameInput.value || '').trim() || 'Untitled project';
    const [num, den] = meterSelect.value.split('/').map(Number);
    const parsedTempo = Number(tempoInput.value);
    const tempo = Number.isFinite(parsedTempo) ? Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(parsedTempo))) : TEMPO_DEFAULT;
    onSubmit({
      name: cleanName,
      settings: {
        tempo,
        timeSig: { num, den },
        key: currentKey,
        clef: clefSelect.value,
      },
    });
    dialog.close();
  }

  submitBtn.onclick = commit;

  // Enter submits from anywhere in the form (except the number spinner, where
  // Enter is the browser's own "commit value" gesture we want to allow). Esc
  // still cancels via <dialog>'s default.
  dialog.onkeydown = (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target?.tagName === 'TEXTAREA') return;
    event.preventDefault();
    commit();
  };

  dialog.showModal();
  requestAnimationFrame(() => {
    nameInput.focus();
    if (isCreate) nameInput.select();
  });
}
