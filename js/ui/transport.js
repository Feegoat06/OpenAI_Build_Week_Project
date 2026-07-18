/**
 * Playback controls (play / stop / reset) plus the status pulse and text.
 *
 * The module doesn't drive audio itself — it exposes callbacks that main.js
 * hooks into playSegments/stopPlayback. The setters (setPlayEnabled, etc.)
 * let main.js reflect playback state back into the button/pulse/status.
 */

const TEMPLATE = `
<section class="transport" aria-label="Playback controls">
  <div class="transport-buttons">
    <button id="play" class="play-button">
      <span class="play-icon">▶</span>
      <span class="play-copy"><strong>Play progression</strong><small>Assemble in time</small></span>
    </button>
    <button id="stop" class="stop-button">■ Stop</button>
  </div>
  <div class="transport-status">
    <span id="playback-pulse"></span>
    <output id="playback-status">Ready to listen</output>
  </div>
  <button id="reset-example" class="reset-button">↺ Reload example</button>
</section>
`;

export function mountTransport({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const playBtn = container.querySelector('#play');
  const stopBtn = container.querySelector('#stop');
  const resetBtn = container.querySelector('#reset-example');
  const pulseEl = container.querySelector('#playback-pulse');
  const statusEl = container.querySelector('#playback-status');

  playBtn.onclick = () => callbacks.onPlay();
  stopBtn.onclick = () => callbacks.onStop();
  resetBtn.onclick = () => callbacks.onReset();

  return {
    setPlayEnabled(enabled) { playBtn.disabled = !enabled; },
    setPulseActive(active) { pulseEl.classList.toggle('active', active); },
    setStatus(text) { statusEl.value = text; },
  };
}
