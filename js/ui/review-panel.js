import { escapeHtml } from '../util/html.js';

export function mountReviewPanel({ container, callbacks }) {
  container.innerHTML = `<section class="review-panel" hidden><header><div><p class="kicker">LEGATO’s review</p><h2>Before we play</h2></div><button class="review-close" aria-label="Return to editing">×</button></header><div class="review-body"></div></section>`;
  const panel = container.querySelector('.review-panel');
  const body = panel.querySelector('.review-body');
  panel.querySelector('.review-close').onclick = () => callbacks.onReturn();

  return {
    showLoading() {
      panel.hidden = false;
      body.innerHTML = '<div class="review-loading"><span class="spinner"></span><p>Listening through the complete progression…</p><button class="review-return">Return to editing</button></div>';
      body.querySelector('.review-return').onclick = () => callbacks.onReturn();
    },
    showResult(review, previews) {
      panel.hidden = false;
      body.innerHTML = `<p class="review-overview">${ escapeHtml(review.overview) }</p><div class="review-suggestions">${ review.suggestions.map((suggestion, index) => `<label class="review-suggestion"><input type="checkbox" data-index="${ index }" checked><span><strong>${ escapeHtml(suggestion.title) }</strong><small>${ escapeHtml(suggestion.rationale) }</small><em>${ escapeHtml(previews[index] ?? 'A grounded musical experiment') }</em></span></label>`).join('') || '<p class="review-empty">The progression is coherent as written. I have no safe changes to suggest.</p>' }</div><footer><button class="review-secondary review-return">Return to editing</button><button class="review-secondary review-ignore">Ignore all & play</button><button class="review-primary review-apply">Apply selected</button></footer>`;
      body.querySelector('.review-return').onclick = () => callbacks.onReturn();
      body.querySelector('.review-ignore').onclick = () => callbacks.onIgnore();
      body.querySelector('.review-apply').onclick = () => {
        const selected = [...body.querySelectorAll('input:checked')].map((input) => Number(input.dataset.index));
        callbacks.onApply(selected);
      };
    },
    showError(message) {
      panel.hidden = false;
      body.innerHTML = `<div class="review-error"><p>${ escapeHtml(message) }</p><div><button class="review-secondary review-return">Return to editing</button><button class="review-secondary review-retry">Retry</button><button class="review-primary review-ignore">Play anyway</button></div></div>`;
      body.querySelector('.review-return').onclick = () => callbacks.onReturn();
      body.querySelector('.review-retry').onclick = () => callbacks.onRetry();
      body.querySelector('.review-ignore').onclick = () => callbacks.onIgnore();
    },
    hide() { panel.hidden = true; },
  };
}
