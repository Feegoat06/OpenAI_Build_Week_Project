/**
 * Bottom-of-right-pane coach panel. Owns the four explanation cards and the
 * empty / loading / result / error state DOM.
 *
 * The panel doesn't call the coach API itself — main.js orchestrates the
 * fetch and drives this panel through the returned setters.
 */
import { escapeHtml } from '../util/html.js';

const TEMPLATE = `
<section class="coach-panel" aria-labelledby="coach-title">
  <div class="coach-heading">
    <div>
      <p class="kicker">04 · AI tutor</p>
      <h2 id="coach-title">Understand the transition</h2>
    </div>
    <p id="coach-context">Select a seam, then ask LEGATO to explain the exact notes you hear.</p>
  </div>
  <div id="coach-output" class="coach-output">
    <div class="coach-empty"><span>∿</span>
      <p>Your grounded explanation will appear here.</p>
    </div>
  </div>
</section>
`;

const EMPTY_HTML = '<div class="coach-empty"><span>∿</span><p>Your grounded explanation will appear here.</p></div>';

export function mountCoachPanel({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const contextEl = container.querySelector('#coach-context');
  const outputEl = container.querySelector('#coach-output');

  return {
    setContext(text) { contextEl.textContent = text; },
    setEmpty() { outputEl.innerHTML = EMPTY_HTML; },
    setLoading() {
      outputEl.innerHTML = '<div class="coach-loading"><span class="spinner"></span>Tracing the exact voices and generated notes…</div>';
    },
    setResult(result) {
      outputEl.innerHTML = `<div class="coach-grid"><article class="coach-card"><span>What you hear</span><p>${ escapeHtml(result.whatYouHear) }</p></article><article class="coach-card"><span>Why it works</span><p>${ escapeHtml(result.whyItWorks) }</p></article><article class="coach-card"><span>Try this</span><p>${ escapeHtml(result.tryThis) }</p></article><article class="coach-card reflect"><span>Reflect</span><p>${ escapeHtml(result.reflect) }</p></article></div>`;
    },
    setError(message, retryContext) {
      outputEl.innerHTML = `<div class="coach-error"><span>${ escapeHtml(message) }</span><button id="retry-coach">Retry explanation</button></div>`;
      outputEl.querySelector('#retry-coach').onclick = () => callbacks.onRetry(retryContext);
    },
  };
}
