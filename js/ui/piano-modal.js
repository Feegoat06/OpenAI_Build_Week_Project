/**
 * The "Shape the chord" modal.
 *
 * Two entry points:
 *   - `populateChordControls(dialog)` runs once at boot to fill the static
 *     controls (root select, quality chip row).
 *   - `openPianoModal(dialog, existingChord, onSave, timeSig, key)` opens the
 *     modal, optionally with an existing chord loaded for editing. `key` is
 *     the progression's key signature (-7..+7) and drives enharmonic
 *     spelling for every letter shown inside the modal.
 *
 * The modal edits an internal `selected` Set of MIDI notes; every interaction
 * (root change, quality chip click, key toggle, octave arrow) refreshes:
 *   - the piano key highlights
 *   - the deduped-letters readout
 *   - the mini VexFlow preview
 *   - the recognized-chord status (via `inferChordIdentity`)
 * On Save, `beats` from the duration select is converted back to `bars` using
 * the current progression's meter, so no state outside this file has to know
 * we display beats.
 */
import { QUALITIES, inferChordIdentity, noteName, notesFrom } from '../engine/chords.js';
import { playNote, playChord } from '../audio/playback.js';
import { beatsToBars, barsToBeats } from '../state.js';
import { pitchClassOf, octaveOf, spellPitchClass, vexKey } from '../util/midi.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
// Root select always shows both enharmonic spellings; the user picks a pitch
// class, not a spelling. The chord's on-screen name updates based on the
// progression's key signature.
const PITCH_CLASS_LABELS = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const QUALITY_LABELS = {
  Major: 'Major', Minor: 'Minor', Dom7: 'Dom 7', Maj7: 'Maj 7', Min7: 'Min 7',
  Dim: 'Dim', Dim7: 'Dim 7', m7b5: 'm7b5', Sus2: 'Sus2', Sus4: 'Sus4', Aug: 'Aug',
};
const BEAT_OPTIONS = [
  { beats: 0.5, label: '½ beat' },
  { beats: 1, label: '1 beat' },
  { beats: 1.5, label: '1½ beats' },
  { beats: 2, label: '2 beats' },
  { beats: 3, label: '3 beats' },
  { beats: 4, label: '4 beats' },
  { beats: 6, label: '6 beats' },
  { beats: 8, label: '8 beats' },
];

/** Detect a chord identity from raw selected notes, biased toward the bass. */
function detect(notes) {
  if (!notes.length) return null;
  const { rootPc, quality, recognised } = inferChordIdentity({ notes }, { preferBassRoot: true });
  return recognised ? { rootPc, quality } : null;
}

/**
 * Draw a single-chord VexFlow stave inside the preview panel. Intentionally
 * NOT a call into `notation/render.js::renderNotation`: that function targets
 * the main score, has a 600px minimum width, and needs measure math. This
 * mini preview is one whole note on one stave and stays under ~260px wide.
 * Clef auto-flips (bass < 60, treble ≥ 60) using median MIDI, matching the
 * score's `resolvedClef` behavior. Accidentals follow the progression's key.
 */
function renderPreview(container, notes, key) {
  const VF = window.Vex?.Flow ?? window.VexFlow;
  container.replaceChildren();
  if (!VF) { container.innerHTML = '<div class="preview-empty">Loading…</div>'; return; }
  if (!notes.length) { container.innerHTML = '<div class="preview-empty">—</div>'; return; }
  const sorted = [...notes].sort((a, b) => a - b);
  const width = Math.max(200, container.clientWidth || 220);
  const height = 140;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const median = sorted[Math.floor(sorted.length / 2)];
  const clef = median < 60 ? 'bass' : 'treble';
  const staffColor = '#7a664b';
  const noteColor = '#e6ceaa';
  const stave = new VF.Stave(6, 14, width - 12);
  stave.addClef(clef);
  stave.getModifiers().forEach((m) => m.setStyle({ fillStyle: staffColor, strokeStyle: staffColor }));
  ctx.setStrokeStyle(staffColor); ctx.setFillStyle(staffColor);
  stave.setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(ctx).draw();
  const staveNote = new VF.StaveNote({
    clef,
    keys: sorted.map((midi) => vexKey(midi, key)),
    duration: 'w',
  });
  sorted.forEach((midi, index) => {
    // Anything past the letter is an accidental ('#' or 'b'); attach it explicitly.
    const accidental = vexKey(midi, key).split('/')[0].slice(1);
    if (accidental) staveNote.addModifier(new VF.Accidental(accidental), index);
  });
  staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });
  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
  voice.addTickables([staveNote]);
  new VF.Formatter().joinVoices([voice]).format([voice], Math.max(40, width - 80));
  voice.draw(ctx, stave);
}

/**
 * Populate the duration `<select>` with beat options for the current meter.
 * If the chord being edited has a `bars` value that doesn't map to any preset,
 * we insert it as an extra option so the round-trip Edit→Save doesn't lose it.
 */
function fillBeatOptions(select, timeSig, currentBars) {
  select.replaceChildren();
  const currentBeats = currentBars != null ? Number(barsToBeats(currentBars, timeSig).toFixed(4)) : null;
  const options = [...BEAT_OPTIONS];
  const known = options.some((opt) => opt.beats === currentBeats);
  if (currentBeats != null && !known) {
    options.push({ beats: currentBeats, label: `${ currentBeats } beats` });
    options.sort((a, b) => a.beats - b.beats);
  }
  options.forEach((opt) => {
    const option = new Option(opt.label, String(opt.beats));
    if (currentBeats != null && opt.beats === currentBeats) option.selected = true;
    select.add(option);
  });
}

/**
 * Open the chord editor. Either creates a new chord or loads `existingChord`
 * for edit; on Save, calls `onSave({ notes, bars, hint? })`.
 *
 * @param {HTMLDialogElement} dialog
 * @param {Chord | null}      existingChord
 * @param {(input: {notes: number[], bars: number, hint?: object}) => void} onSave
 * @param {TimeSig}           timeSig     For the beats↔bars conversion.
 * @param {number}            key         Key signature (-7..+7). Spelling only —
 *                                        drives whether B♭ or A♯ (etc.) is shown.
 *
 * Initial `rootPc`/`quality` are picked in priority order:
 *   1. Detect them from `existingChord.notes` (notes-as-truth).
 *   2. Fall back to `existingChord.hint` if detection missed.
 *   3. Otherwise default to C Major.
 *
 * The current octave is derived from the lowest selected note on every render
 * (see `currentOctave()`) — no stored state to keep in sync.
 */
export function openPianoModal(dialog, existingChord, onSave, timeSig = { num: 4, den: 4 }, key = 0) {
  const rootSelect = dialog.querySelector('#modal-root');
  const durationSelect = dialog.querySelector('#modal-bars');
  const keys = dialog.querySelector('#piano-keys');
  const chips = dialog.querySelector('#modal-quality-chips');
  const previewSheet = dialog.querySelector('#preview-sheet');
  const previewPlay = dialog.querySelector('#preview-play');
  const octaveReadout = dialog.querySelector('#octave-readout');
  const octaveUp = dialog.querySelector('#octave-up');
  const octaveDown = dialog.querySelector('#octave-down');

  fillBeatOptions(durationSelect, timeSig, existingChord?.bars ?? 1);

  let selected = new Set(existingChord?.notes ?? notesFrom(60, 'Major'));
  const initialDetection = existingChord ? detect([...selected]) : { rootPc: 0, quality: 'Major' };
  let rootPc = initialDetection?.rootPc ?? pitchClassOf(existingChord?.hint?.rootMidi ?? 60);
  let quality = initialDetection?.quality ?? existingChord?.hint?.quality ?? 'Major';
  // Fallback used only when `selected` is empty; when notes are present the
  // octave shown is always derived from them so shifting up/down stays in sync.
  let emptyOctave = existingChord?.hint?.rootMidi != null
    ? octaveOf(existingChord.hint.rootMidi)
    : existingChord?.notes?.length
      ? octaveOf(Math.min(...existingChord.notes))
      : 4;

  rootSelect.value = String(rootPc);

  /** Octave derived from the lowest selected note, or the last-known when empty. */
  function currentOctave() {
    if (!selected.size) return emptyOctave;
    return octaveOf(Math.min(...selected));
  }
  /** MIDI number used as the "root" when building the reset voicing (e.g. after a chip click). */
  function currentRootMidi() { return rootPc + (currentOctave() + 1) * 12; }

  function renderChips() {
    [...chips.children].forEach((chip) => {
      const active = chip.dataset.quality === quality;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
  }

  function updateOctaveControls() {
    const sorted = [...selected].sort((a, b) => a - b);
    const canUp = sorted.length === 0 || sorted[sorted.length - 1] + 12 <= 108;
    const canDown = sorted.length === 0 || sorted[0] - 12 >= 21;
    octaveUp.disabled = !canUp;
    octaveDown.disabled = !canDown;
    octaveReadout.textContent = `Octave ${ currentOctave() }`;
  }

  /**
   * Re-run centralized chord detection after any change to `selected` and
   * push the result into the root select + active chip. This is the "second
   * input mode" from DATA-MODEL.md §1.2: notes are truth, the label follows.
   */
  function refreshFromSelection() {
    const sorted = [...selected].sort((a, b) => a - b);
    const detected = detect(sorted);
    if (detected) {
      rootPc = detected.rootPc;
      quality = detected.quality;
      rootSelect.value = String(rootPc);
    }
    renderChips();
    updateStatus(sorted, !!detected);
  }

  function updateStatus(sorted, recognized) {
    const letters = [...new Set(sorted.map((midi) => spellPitchClass(midi, key)))];
    dialog.querySelector('#selected-notes').textContent = letters.length ? letters.join(' · ') : 'No notes selected';
    dialog.querySelector('#voicing-status').textContent = recognized
      ? `${ spellPitchClass(rootPc, key) } ${ QUALITY_LABELS[quality] } pitch classes recognized. Octaves and doublings remain yours.`
      : sorted.length
        ? 'Custom pitch-class set: no matching chord label, but every selected note is preserved.'
        : 'Toggle any key or click a quality to begin.';
    dialog.querySelector('#modal-save').disabled = sorted.length === 0;
    previewPlay.disabled = sorted.length === 0;
  }

  /**
   * Rebuild the 88 piano keys from scratch. `replaceChildren` would reset
   * `scrollLeft` — we save + restore it so the view doesn't jump to A0 on
   * every key toggle.
   */
  function renderKeys() {
    const rootMidi = currentRootMidi();
    const qualityPcs = new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootMidi + interval)));
    const savedScroll = keys.scrollLeft;
    keys.replaceChildren();
    for (let midi = 21; midi <= 108; midi += 1) {
      const button = document.createElement('button');
      const selectedNow = selected.has(midi);
      const label = noteName(midi, key);
      button.type = 'button';
      button.className = `piano-key ${ BLACK_PITCH_CLASSES.has(midi % 12) ? 'black' : 'white' } ${ selectedNow ? 'selected' : '' } ${ qualityPcs.has(midi % 12) ? 'quality-tone' : '' }`;
      button.textContent = midi % 12 === 0 ? label : '';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(selectedNow));
      button.onclick = () => {
        if (selected.has(midi)) selected.delete(midi);
        else selected.add(midi);
        playNote(midi).catch(() => { });
        refreshFromSelection();
        updateOctaveControls();
        renderKeys();
        renderPreview(previewSheet, [...selected].sort((a, b) => a - b), key);
      };
      keys.append(button);
    }
    keys.scrollLeft = savedScroll;
    refreshFromSelection();
    updateOctaveControls();
    renderPreview(previewSheet, [...selected].sort((a, b) => a - b), key);
  }

  /**
   * Reset the selection to the default voicing of the current root+quality at
   * the current octave. Called on root change AND on any quality chip click,
   * including clicking the already-active chip — that's the "reset voicing"
   * gesture (the old "Reset quality voicing" button is now implicit).
   */
  function applyRootQuality() {
    selected = new Set(notesFrom(currentRootMidi(), quality));
    renderChips();
    renderKeys();
    const selectedButton = [...keys.children].find((button) => button.classList.contains('selected'));
    selectedButton?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /**
   * Shift the entire selected voicing by ±12 semitones. Preserves inversion,
   * doubling, and spacing. No-op if any note would leave the 21..108 MIDI
   * range (the buttons are also disabled at the edges). When nothing is
   * selected, just bumps the fallback octave so a subsequent chip click
   * builds the reset voicing at the new register.
   */
  function shiftOctave(direction) {
    const sorted = [...selected].sort((a, b) => a - b);
    if (!sorted.length) {
      emptyOctave = Math.max(0, Math.min(8, emptyOctave + direction));
      renderKeys();
      return;
    }
    const delta = direction * 12;
    if (sorted[0] + delta < 21 || sorted[sorted.length - 1] + delta > 108) return;
    selected = new Set(sorted.map((midi) => midi + delta));
    renderKeys();
    const selectedButton = [...keys.children].find((button) => button.classList.contains('selected'));
    selectedButton?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function playPreview() {
    playChord([...selected].sort((a, b) => a - b)).catch(() => { });
  }

  rootSelect.onchange = () => { rootPc = Number(rootSelect.value); applyRootQuality(); };
  chips.onclick = (event) => {
    const chip = event.target.closest('[data-quality]');
    if (!chip) return;
    quality = chip.dataset.quality;
    applyRootQuality();
  };
  octaveUp.onclick = () => shiftOctave(1);
  octaveDown.onclick = () => shiftOctave(-1);
  previewSheet.onclick = playPreview;
  previewSheet.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playPreview(); }
  };
  previewPlay.onclick = (event) => { event.stopPropagation(); playPreview(); };
  dialog.querySelector('#modal-cancel').onclick = () => dialog.close();
  dialog.querySelector('#modal-save').onclick = () => {
    const notes = [...selected].sort((a, b) => a - b);
    if (!notes.length) return;
    // Detection is what decides whether we attach a display hint: if the notes
    // resolve to a chord label, save it; otherwise the row falls back to a
    // notes-list display via chordDisplayName.
    const detected = detect(notes);
    const hint = detected
      ? { rootMidi: detected.rootPc + (octaveOf(Math.min(...notes)) + 1) * 12, quality: detected.quality }
      : undefined;
    const beats = Number(durationSelect.value);
    onSave({ notes, bars: beatsToBars(beats, timeSig), ...(hint ? { hint } : {}) });
    dialog.close();
  };

  renderChips();
  renderKeys();
  dialog.showModal();
  requestAnimationFrame(() => {
    [...keys.children].find((button) => button.classList.contains('selected'))?.scrollIntoView({ inline: 'center', block: 'nearest' });
    renderPreview(previewSheet, [...selected].sort((a, b) => a - b), key);
  });
}

/**
 * One-time boot: fill the static root select with 12 pitch-class options and
 * build a chip button for every entry in QUALITIES. `openPianoModal` toggles
 * the active chip via event delegation, so no per-open rebuild is needed.
 */
export function populateChordControls(dialog) {
  const root = dialog.querySelector('#modal-root');
  PITCH_CLASS_LABELS.forEach((label, pc) => root.add(new Option(label, String(pc))));
  const chips = dialog.querySelector('#modal-quality-chips');
  chips.replaceChildren();
  Object.keys(QUALITIES).forEach((qualityKey) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quality-chip';
    chip.dataset.quality = qualityKey;
    chip.textContent = QUALITY_LABELS[qualityKey] ?? qualityKey;
    chip.setAttribute('aria-pressed', 'false');
    chips.append(chip);
  });
}
