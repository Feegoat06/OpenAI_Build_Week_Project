/**
 * Right-side sheet music surface: header (with zoom readout), VexFlow SVG,
 * particle overlay, and the transport + coach mount points.
 *
 * Owns rendering the compiled progression as sheet music, the particle
 * playback effect, and CSS-zoom on wheel/resize. The transport and coach
 * panels are siblings inside <main class="sheet-music-pane"> — this module
 * mounts them via the exposed `transportMount` / `coachMount` refs so
 * main.js can wire them separately.
 */
import { renderNotation } from '../sheet-music/render.js';
import { createSheetMusicParticles } from '../sheet-music/particles.js';

const TEMPLATE = `
<header class="sheet-music-header">
  <div>
    <p class="kicker">Compiled sheet music</p>
    <h2>Your Progression!</h2>
  </div>
  <div class="sheet-music-meta">
    <span><i class="user-dot"></i>User voicing</span>
    <span><i class="technique-dot"></i>Technique</span>
    <span id="sheet-music-summary">0 measures</span>
    <output id="sheet-music-zoom-value" class="sheet-music-zoom" aria-live="polite">100% · scroll sheet music to zoom</output>
  </div>
</header>

<section class="notation-stage" aria-label="Progression notation">
  <div class="sheet-music-stage-meta" aria-hidden="true">
    <span>Particle sheet music</span>
    <span id="sheet-music-fx-state">Sheet music breathing</span>
  </div>
  <div class="staff-glow" aria-hidden="true"></div>
  <div id="sheet-music-layer" class="sheet-music-layer">
    <div id="sheet-music" class="sheet-music"></div>
    <canvas id="sheet-music-particles" class="sheet-music-particles" aria-hidden="true"></canvas>
  </div>
  <div class="sheet-music-progress-rail" aria-hidden="true"><span></span></div>
</section>

<div id="transport-mount"></div>
<div id="coach-mount"></div>
`;

export function mountSheetMusicPanel({ container }) {
  container.classList.add('sheet-music-pane');
  container.innerHTML = TEMPLATE;

  const sheetMusicEl = container.querySelector('#sheet-music');
  const summaryEl = container.querySelector('#sheet-music-summary');
  const zoomValueEl = container.querySelector('#sheet-music-zoom-value');
  const layerEl = container.querySelector('#sheet-music-layer');
  const notationStageEl = container.querySelector('.notation-stage');
  const particlesCanvas = container.querySelector('#sheet-music-particles');
  const particles = createSheetMusicParticles(particlesCanvas);

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
    particles.setSheetMusic(sheetMusicEl.querySelector('svg'), result.layout);
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

  notationStageEl.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });
  window.addEventListener('resize', scheduleRerender);

  setZoom(zoom);

  return {
    transportMount: container.querySelector('#transport-mount'),
    coachMount: container.querySelector('#coach-mount'),
    particles,
    render(segments, settings) {
      currentSegments = segments;
      currentSettings = settings;
      const { measureCount } = drawSheetMusic();
      summaryEl.textContent = `${ measureCount } measure${ measureCount === 1 ? '' : 's' } · ${ segments.length } event${ segments.length === 1 ? '' : 's' }`;
    },
    setActiveMeasure(index) {
      activeMeasure = index;
      applyActiveMeasureClasses();
    },
  };
}
