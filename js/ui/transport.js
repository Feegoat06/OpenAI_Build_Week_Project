/**
 * Playback controls (play/pause toggle, stop) plus the status pulse and text.
 *
 * The module doesn't drive audio itself — it exposes callbacks that editor-
 * view hooks into playSegments/pausePlayback/resumePlayback/stopPlayback.
 * The setters (setPlayEnabled, setPlayMode, setStatus, setPulseActive) let
 * the caller reflect playback state back into the button/pulse/status.
 */

const TEMPLATE = `
<section class="transport" aria-label="Playback controls">
  <div class="transport-buttons">
    <button id="play" class="play-button" type="button">
      <span class="play-icon" aria-hidden="true">▶</span>
      <span class="play-copy"><strong>Play</strong><small>Play progression</small></span>
    </button>
    <button id="stop" class="stop-button" type="button">■ Stop</button>
  </div>
  <div class="transport-status">
    <span id="playback-pulse"></span>
    <output id="playback-status">Ready to listen</output>
  </div>
</section>
`;

export function mountTransport({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const playBtn = container.querySelector('#play');
  const stopBtn = container.querySelector('#stop');
  const playIconEl = playBtn.querySelector('.play-icon');
  const playStrongEl = playBtn.querySelector('.play-copy strong');
  const playSmallEl = playBtn.querySelector('.play-copy small');
  const pulseEl = container.querySelector('#playback-pulse');
  const statusEl = container.querySelector('#playback-status');

  playBtn.onclick = () => callbacks.onPlayToggle();
  stopBtn.onclick = () => callbacks.onStop();

  return {
    setPlayEnabled(enabled) { playBtn.disabled = !enabled; },
    setPulseActive(active) { pulseEl.classList.toggle('active', active); },
    setStatus(text) { statusEl.value = text; },
    /**
     * @param {'play' | 'pause' | 'resume'} mode
     * `play`   — from idle: start progression from the beginning
     * `pause`  — currently playing: freeze at cursor
     * `resume` — paused: continue from cursor
     */
    setPlayMode(mode) {
      if (mode === 'pause') {
        playIconEl.textContent = '⏸';
        playStrongEl.textContent = 'Pause';
        playSmallEl.textContent = 'Pause playback';
        playBtn.setAttribute('aria-label', 'Pause playback');
      } else if (mode === 'resume') {
        playIconEl.textContent = '▶';
        playStrongEl.textContent = 'Resume';
        playSmallEl.textContent = 'Continue from cursor';
        playBtn.setAttribute('aria-label', 'Resume playback');
      } else {
        playIconEl.textContent = '▶';
        playStrongEl.textContent = 'Play';
        playSmallEl.textContent = 'Play progression';
        playBtn.setAttribute('aria-label', 'Play progression');
      }
    },
  };
}
