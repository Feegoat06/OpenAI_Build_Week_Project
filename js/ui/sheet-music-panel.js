/**
 * Readable music-stand score with paging, zoom, semantic selection, and a
 * performance reveal mode.
 *
 * Owns rendering the compiled progression as sheet music, the particle
 * playback effect, and CSS-zoom on wheel/resize. The transport and coach
 * panels are siblings inside <main class="sheet-music-pane"> — this module
 * mounts them via the exposed `transportMount` / `coachMount` refs so
 * main.js can wire them separately.
 */
import { renderNotation } from '../sheet-music/render.js';
const TEMPLATE = `
<section class="notation-stage" aria-label="Progression notation" tabindex="0">
  <header class="sheet-music-stage-meta"><span>Live score</span><output id="sheet-music-summary">0 measures</output><div><button data-action="zoom-out" aria-label="Zoom out">−</button><output id="sheet-music-zoom-value">100%</output><button data-action="zoom-in" aria-label="Zoom in">+</button><button data-action="maximize">Expand</button></div></header>
  <div id="sheet-music-layer" class="sheet-music-layer">
    <div id="sheet-music" class="sheet-music"></div>
  </div>
</section>
`;

export function mountSheetMusicPanel({ container, callbacks = {} }) {
  container.classList.add('sheet-music-pane');
  container.innerHTML = TEMPLATE;

  const sheetMusicEl = container.querySelector('#sheet-music');
  const summaryEl = container.querySelector('#sheet-music-summary');
  const zoomValueEl = container.querySelector('#sheet-music-zoom-value');
  const layerEl = container.querySelector('#sheet-music-layer');
  const notationStageEl = container.querySelector('.notation-stage');

  let zoom = 1;
  let resizeFrame = 0;
  let currentSegments = [];
  let currentSettings = null;
  let activeMeasure = null;

  function applyActiveMeasureClasses() {
    container.querySelectorAll('.measure-group').forEach((measure) => {
      measure.classList.toggle('is-playing', Number(measure.dataset.measure) === activeMeasure);
    });
  }

  function drawSheetMusic() {
    if (!currentSettings) return { measureCount: 0, layout: [] };
    const result = renderNotation(sheetMusicEl, currentSegments, currentSettings);
    wireSemanticNotes();
    applyActiveMeasureClasses();
    return result;
  }

  function scheduleRerender() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(drawSheetMusic);
  }

  function setZoom(nextZoom) {
    zoom = Math.max(0.7, Math.min(1.5, Math.round(nextZoom * 10) / 10));
    layerEl.style.width = `${ 100 / zoom }%`;
    layerEl.style.zoom = String(zoom);
    zoomValueEl.textContent = `${ Math.round(zoom * 100) }% · scroll sheet music to zoom`;
    scheduleRerender();
  }

  container.querySelector('[data-action="zoom-out"]').onclick = () => setZoom(zoom - .1);
  container.querySelector('[data-action="zoom-in"]').onclick = () => setZoom(zoom + .1);
  container.querySelector('[data-action="maximize"]').onclick = () => notationStageEl.classList.toggle('is-maximized');
  window.addEventListener('resize', scheduleRerender);

  setZoom(zoom);

  function wireSemanticNotes() {
    sheetMusicEl.querySelectorAll('[data-source-id]').forEach((note) => {
      const activate = () => {
        const seam = note.dataset.seamIndex;
        if (seam !== '') callbacks.onSelectSeam?.(Number(seam));
        else callbacks.onSelectChord?.(note.dataset.sourceId);
      };
      note.onclick = activate;
      note.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } };
    });
  }

  return {
    render(segments, settings) {
      currentSegments = segments;
      currentSettings = settings;
      const { measureCount } = drawSheetMusic();
      summaryEl.textContent = `${ measureCount } measure${ measureCount === 1 ? '' : 's' } · ${ segments.length } event${ segments.length === 1 ? '' : 's' }`;
    },
    setActiveMeasure(index) {
      activeMeasure = index;
      applyActiveMeasureClasses();
      if (index != null) container.querySelector(`[data-measure="${ index }"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    selectChord(chordId) {
      sheetMusicEl.querySelectorAll('[data-source-id]').forEach((note) => note.classList.toggle('is-selected', note.dataset.sourceId === chordId));
    },
    selectSeam(index) {
      sheetMusicEl.querySelectorAll('[data-seam-index]').forEach((note) => note.classList.toggle('is-selected', note.dataset.seamIndex === String(index)));
    },
    setPerformanceMode(active) {
      notationStageEl.classList.toggle('is-performance-score', active);
      if (active) sheetMusicEl.querySelectorAll('[data-source-id]').forEach((note) => note.classList.add('is-awaiting'));
      else sheetMusicEl.querySelectorAll('.is-awaiting').forEach((note) => note.classList.remove('is-awaiting'));
    },
    revealSource(sourceId, seamIndex = null) {
      const selector = seamIndex == null ? `[data-source-id="${ CSS.escape(sourceId) }"]` : `[data-seam-index="${ seamIndex }"]`;
      sheetMusicEl.querySelectorAll(selector).forEach((note) => note.classList.remove('is-awaiting'));
    },
  };
}
