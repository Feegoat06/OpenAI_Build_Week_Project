/**
 * Right-side sheet music surface: header (title), VexFlow SVG with a compact
 * corner zoom control, and the transport row (play/stop plus session-only
 * tempo/clef overrides).
 *
 * Tempo and clef controls here are session-only overrides: they never mutate
 * the project's persistent settings. When the persistent tempo/clef change
 * externally (via project settings), the override is cleared so the panel
 * reflects the new source of truth.
 *
 * The transport and coach panels are siblings inside <main class="sheet-
 * music-pane"> — this module mounts them via the exposed `transportMount` /
 * `coachMount` refs so editor-view can wire them separately.
 */
import { renderNotation } from '../sheet-music/render.js';
import { createSheetMusicParticles } from '../sheet-music/particles.js';
import { TEMPO_MIN, TEMPO_MAX } from '../state.js';

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
// Continuous wheel zoom. One wheel notch (~100 units of deltaY on most mice
// under DOM_DELTA_PIXEL) moves the zoom ~2%, so five notches = one 10% step.
const WHEEL_ZOOM_FACTOR = 0.0005;
const WHEEL_DELTA_LINE_PX = 16;
const WHEEL_DELTA_PAGE_PX = 800;

const TEMPLATE = `
<header class="sheet-music-header">
  <div class="sheet-music-title">
    <p class="kicker">Compiled sheet music</p>
    <h2>Your Progression!</h2>
  </div>
</header>

<section class="notation-stage" aria-label="Progression notation">
  <div class="sheet-music-zoom-control" role="group" aria-label="Zoom">
    <button id="sheet-music-zoom-out" type="button" aria-label="Zoom out">−</button>
    <output id="sheet-music-zoom-value" aria-live="polite">100%</output>
    <button id="sheet-music-zoom-in" type="button" aria-label="Zoom in">+</button>
  </div>
  <div class="staff-glow" aria-hidden="true"></div>
  <div id="sheet-music-layer" class="sheet-music-layer">
    <div id="sheet-music" class="sheet-music"></div>
    <canvas id="sheet-music-particles" class="sheet-music-particles" aria-hidden="true"></canvas>
  </div>
  <div class="sheet-music-progress-rail" aria-hidden="true"><span></span></div>
</section>

<div class="transport-row">
  <div id="transport-mount"></div>
  <div class="sheet-music-controls">
    <label class="tempo-control">
      <span>Tempo</span>
      <input id="sheet-music-tempo-slider" type="range" min="${ TEMPO_MIN }" max="${ TEMPO_MAX }" step="1" />
      <span class="tempo-value">
        <input id="sheet-music-tempo-input" type="number" min="${ TEMPO_MIN }" max="${ TEMPO_MAX }" step="1" inputmode="numeric" />
        <small>BPM</small>
      </span>
    </label>
    <label class="clef-control">
      <span>Clef</span>
      <select id="sheet-music-clef">
        <option value="auto">Auto</option>
        <option value="treble">Treble</option>
        <option value="bass">Bass</option>
      </select>
    </label>
  </div>
</div>
<div id="coach-mount"></div>
`;

export function mountSheetMusicPanel({ container, callbacks = {} }) {
  container.classList.add('sheet-music-pane');
  container.innerHTML = TEMPLATE;

  const sheetMusicEl = container.querySelector('#sheet-music');
  const zoomValueEl = container.querySelector('#sheet-music-zoom-value');
  const zoomOutBtn = container.querySelector('#sheet-music-zoom-out');
  const zoomInBtn = container.querySelector('#sheet-music-zoom-in');
  const layerEl = container.querySelector('#sheet-music-layer');
  const notationStageEl = container.querySelector('.notation-stage');
  const particlesCanvas = container.querySelector('#sheet-music-particles');
  const particles = createSheetMusicParticles(particlesCanvas);
  const tempoSliderEl = container.querySelector('#sheet-music-tempo-slider');
  const tempoInputEl = container.querySelector('#sheet-music-tempo-input');
  const clefSelectEl = container.querySelector('#sheet-music-clef');

  let zoom = 1;
  let resizeFrame = 0;
  let currentSegments = [];
  let baseSettings = null;
  let effectiveSettings = null;
  let currentChords = [];
  let activeMeasure = null;
  let overrideTempo = null;
  let overrideClef = null;

  function computeEffectiveSettings() {
    if (!baseSettings) return null;
    return {
      ...baseSettings,
      tempo: overrideTempo ?? baseSettings.tempo,
      clef: overrideClef ?? baseSettings.clef,
    };
  }

  function applyActiveMeasureClasses() {
    container.querySelectorAll('.measure-group').forEach((measure) => {
      measure.classList.toggle('is-playing', Number(measure.dataset.measure) === activeMeasure);
    });
  }

  function drawSheetMusic() {
    if (!effectiveSettings) return { measureCount: 0, layout: [] };
    const result = renderNotation(sheetMusicEl, currentSegments, effectiveSettings, currentChords);
    particles.setSheetMusic(sheetMusicEl.querySelector('svg'), result.layout);
    applyActiveMeasureClasses();
    return result;
  }

  function scheduleRerender() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(drawSheetMusic);
  }

  function clampZoom(value) {
    // Fine 0.1% precision so trackpad microdeltas accumulate visibly. The
    // displayed readout still rounds to integer percent, and the +/- buttons
    // move by 0.1, so both interactions read as clean 10% marks.
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(value * 1000) / 1000));
  }

  function setZoom(nextZoom) {
    zoom = clampZoom(nextZoom);
    layerEl.style.width = `${ 100 / zoom }%`;
    layerEl.style.zoom = String(zoom);
    zoomValueEl.textContent = `${ Math.round(zoom * 100) }%`;
    zoomOutBtn.disabled = zoom <= ZOOM_MIN + 1e-6;
    zoomInBtn.disabled = zoom >= ZOOM_MAX - 1e-6;
    scheduleRerender();
  }

  zoomOutBtn.onclick = () => setZoom(zoom - ZOOM_STEP);
  zoomInBtn.onclick = () => setZoom(zoom + ZOOM_STEP);

  // Wheel-to-zoom. Every event moves the zoom immediately (responsive),
  // but by a small fraction of the deltaY so a single mouse-wheel notch
  // is a 2% nudge rather than the old 10% jump. Trackpad users get finer
  // deltas and correspondingly smoother motion.
  function normalizeWheelDelta(event) {
    if (event.deltaMode === 1) return event.deltaY * WHEEL_DELTA_LINE_PX;
    if (event.deltaMode === 2) return event.deltaY * WHEEL_DELTA_PAGE_PX;
    return event.deltaY;
  }
  notationStageEl.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    setZoom(zoom - normalizeWheelDelta(event) * WHEEL_ZOOM_FACTOR);
  }, { passive: false });
  window.addEventListener('resize', scheduleRerender);

  setZoom(zoom);

  // ── Tempo override ────────────────────────────────────────────────
  function syncTempoInputs(tempo) {
    if (document.activeElement !== tempoSliderEl) tempoSliderEl.value = String(tempo);
    if (document.activeElement !== tempoInputEl) tempoInputEl.value = String(tempo);
  }

  function applyTempo(tempo) {
    const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(tempo)));
    overrideTempo = clamped;
    effectiveSettings = computeEffectiveSettings();
    syncTempoInputs(clamped);
    // Tempo affects only playback timing, not the notation itself. Skip the
    // re-render so scrubbing the slider doesn't thrash VexFlow.
    callbacks.onEffectiveSettingsChange?.(effectiveSettings);
  }

  tempoSliderEl.addEventListener('input', (event) => {
    applyTempo(Number(event.target.value));
  });
  tempoInputEl.addEventListener('input', (event) => {
    const parsed = Number(event.target.value);
    if (!Number.isFinite(parsed)) return;
    applyTempo(parsed);
  });
  tempoInputEl.addEventListener('blur', () => {
    if (overrideTempo != null) syncTempoInputs(overrideTempo);
  });

  // ── Clef override ─────────────────────────────────────────────────
  clefSelectEl.addEventListener('change', (event) => {
    overrideClef = event.target.value;
    effectiveSettings = computeEffectiveSettings();
    drawSheetMusic();
    callbacks.onEffectiveSettingsChange?.(effectiveSettings);
  });

  return {
    transportMount: container.querySelector('#transport-mount'),
    coachMount: container.querySelector('#coach-mount'),
    particles,
    render(segments, settings, chords = []) {
      currentSegments = segments;
      currentChords = chords;
      // Reset overrides when the persistent tempo/clef changes so the panel
      // never disagrees with the source of truth after project settings edits.
      if (baseSettings && baseSettings.tempo !== settings.tempo) overrideTempo = null;
      if (baseSettings && baseSettings.clef !== settings.clef) overrideClef = null;
      baseSettings = settings;
      effectiveSettings = computeEffectiveSettings();
      syncTempoInputs(effectiveSettings.tempo);
      clefSelectEl.value = effectiveSettings.clef;
      drawSheetMusic();
    },
    setActiveMeasure(index) {
      activeMeasure = index;
      applyActiveMeasureClasses();
    },
    /** Effective (override-aware) settings used for playback and rendering. */
    getEffectiveSettings() {
      return effectiveSettings ?? baseSettings;
    },
  };
}
