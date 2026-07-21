/**
 * Right-side Tutor drawer shared by Tenutino's three actions, plus a
 * persistent semi-transparent edge opener on the right of the viewport.
 * Conversation state stays local to the browser and is restored per project.
 */
import { escapeHtml } from '../util/html.js';
import {
  isAnswerResponse,
  isExplanationResponse,
  isSuggestionResponse,
} from '../coach/coach.js';
import { icon } from './icons.js';

const MODES = {
  explain: {
    eyebrow: 'Explanation',
    title: 'Understand the transition',
    empty: 'Choose a transition and I will trace the exact voices and generated notes.',
    placeholder: 'Ask a follow-up about this transition...',
  },
  suggest: {
    eyebrow: 'Suggestions',
    title: 'Explore another direction',
    empty: 'I can suggest a concrete listening or playing experiment for this transition.',
    placeholder: 'What kind of alternative would you like?',
  },
  ask: {
    eyebrow: 'Ask Tenutino',
    title: 'Let us look at the music',
    empty: 'Ask about the last chord or transition you edited.',
    placeholder: 'Ask Tenutino something...',
  },
};

const MAX_HISTORY = 40;

function validHistoryEntry(entry) {
  if (!entry || !['user', 'assistant'].includes(entry.role)) return false;
  if (typeof entry.content === 'string') return true;
  if (isExplanationResponse(entry.content)
    || isSuggestionResponse(entry.content)
    || isAnswerResponse(entry.content)) return true;
  const legacyExplanationKeys = ['whatYouHear', 'whyItWorks', 'tryThis', 'reflect'];
  return entry.content && typeof entry.content === 'object'
    && legacyExplanationKeys.every((key) => typeof entry.content[key] === 'string');
}

function readHistory(storageKey) {
  if (!storageKey) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(validHistoryEntry).slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function resultMarkup(result) {
  if (result.type === 'suggestion') {
    return `
      <div class="tutor-result-section"><span>Try this</span><p>${ escapeHtml(result.suggestion) }</p></div>
      <div class="tutor-result-section"><span>Why</span><p>${ escapeHtml(result.reason) }</p></div>
    `;
  }
  if (result.type === 'answer') {
    return `<p class="tutor-answer">${ escapeHtml(result.answer) }</p>`;
  }
  return `
    <div class="tutor-result-section"><span>What you hear</span><p>${ escapeHtml(result.whatYouHear) }</p></div>
    <div class="tutor-result-section"><span>Why it works</span><p>${ escapeHtml(result.whyItWorks) }</p></div>
    <div class="tutor-result-section"><span>Try this</span><p>${ escapeHtml(result.tryThis) }</p></div>
    <div class="tutor-result-section tutor-reflect"><span>Reflect</span><p>${ escapeHtml(result.reflect) }</p></div>
  `;
}

export function mountTutorChat({ container, callbacks = {}, storageKey = '' }) {
  container.innerHTML = `
    <button class="tutor-chat-opener" type="button" aria-label="Open Tutor chat" title="Ask Tenutino">
      ${ icon('chevronLeft') }
    </button>
    <aside class="tutor-chat-drawer" aria-labelledby="tutor-chat-title" aria-hidden="true">
      <header class="tutor-chat-header">
        <div class="tutor-chat-identity">
          <img src="/assets/tenutino/tenutino.png" alt="" draggable="false">
          <div>
            <p class="kicker" id="tutor-chat-mode">Ask Tenutino</p>
            <h2 id="tutor-chat-title">Let us look at the music</h2>
          </div>
        </div>
        <button class="tutor-chat-close close-button" type="button" aria-label="Close Tutor chat">&times;</button>
      </header>
      <p class="tutor-chat-context"></p>
      <div class="tutor-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
        <div class="tutor-chat-empty"></div>
      </div>
      <form class="tutor-chat-composer">
        <label class="sr-only" for="tutor-chat-input">Message Tenutino</label>
        <textarea id="tutor-chat-input" rows="2" maxlength="600"></textarea>
        <button class="tutor-chat-send primary-action" type="submit" aria-label="Send message">Send</button>
      </form>
    </aside>
  `;

  const drawer = container.querySelector('.tutor-chat-drawer');
  const opener = container.querySelector('.tutor-chat-opener');
  const modeEl = container.querySelector('#tutor-chat-mode');
  const titleEl = container.querySelector('#tutor-chat-title');
  const contextEl = container.querySelector('.tutor-chat-context');
  const messagesEl = container.querySelector('.tutor-chat-messages');
  const emptyEl = container.querySelector('.tutor-chat-empty');
  const form = container.querySelector('.tutor-chat-composer');
  const input = container.querySelector('#tutor-chat-input');
  const closeButton = container.querySelector('.tutor-chat-close');

  let mode = 'ask';
  let history = readHistory(storageKey);
  let playbackActive = false;
  let loadingEl = null;
  let errorEl = null;
  let stopTyping = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Reveal a freshly appended assistant bubble one character at a time, walking
   * its text-bearing paragraphs in order. The responses arrive as complete JSON
   * (not streamed), so this is a purely cosmetic "typing" effect. Any reveal in
   * progress finishes instantly before a new one starts, and reduced-motion
   * users get the full text immediately.
   */
  function typewriterReveal(article) {
    const segments = [...article.querySelectorAll('p')]
      .map((el) => ({ el, text: el.textContent }))
      .filter((seg) => seg.text.length > 0);
    if (!segments.length) return;
    if (stopTyping) stopTyping();
    if (reducedMotion) return;

    segments.forEach((seg) => { seg.el.textContent = ''; });
    article.classList.add('is-typing');
    let seg = 0;
    let chars = 0;
    let timer = null;

    const finish = () => {
      if (timer) clearInterval(timer);
      segments.forEach((entry) => { entry.el.textContent = entry.text; });
      segments[segments.length - 1].el.classList.remove('is-typing-line');
      article.classList.remove('is-typing');
      stopTyping = null;
    };

    segments[0].el.classList.add('is-typing-line');
    timer = setInterval(() => {
      const current = segments[seg];
      chars += 3;
      current.el.textContent = current.text.slice(0, chars);
      if (chars >= current.text.length) {
        current.el.textContent = current.text;
        current.el.classList.remove('is-typing-line');
        seg += 1;
        chars = 0;
        if (seg >= segments.length) { finish(); return; }
        segments[seg].el.classList.add('is-typing-line');
      }
      scrollToLatest();
    }, 18);

    stopTyping = finish;
  }

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(history.slice(-MAX_HISTORY))); }
    catch { /* Local persistence is best-effort. */ }
  }

  function scrollToLatest() {
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  function renderEntry(entry, { animate = false } = {}) {
    const article = document.createElement('article');
    article.className = `tutor-message is-${ entry.role }`;
    if (entry.role === 'user') {
      article.innerHTML = `<span>You</span><p>${ escapeHtml(entry.content) }</p>`;
    } else if (typeof entry.content === 'string') {
      article.innerHTML = `<span>Tenutino</span><p>${ escapeHtml(entry.content) }</p>`;
    } else {
      article.innerHTML = `<span>Tenutino</span>${ resultMarkup(entry.content) }`;
    }
    messagesEl.append(article);
    if (animate && entry.role === 'assistant') typewriterReveal(article);
    return article;
  }

  function syncEmptyState() {
    emptyEl.hidden = history.length > 0;
    emptyEl.textContent = MODES[mode].empty;
  }

  function renderHistory() {
    messagesEl.querySelectorAll('.tutor-message').forEach((entry) => entry.remove());
    history.forEach(renderEntry);
    syncEmptyState();
    scrollToLatest();
  }

  function clearTransient() {
    loadingEl?.remove();
    errorEl?.remove();
    loadingEl = null;
    errorEl = null;
  }

  function append(role, content, { animate = false } = {}) {
    if (stopTyping) stopTyping();
    clearTransient();
    const entry = { role, content, mode, createdAt: Date.now() };
    history.push(entry);
    history = history.slice(-MAX_HISTORY);
    renderEntry(entry, { animate });
    syncEmptyState();
    persist();
    scrollToLatest();
  }

  function open(nextMode = 'ask', { context, focusComposer = false } = {}) {
    if (playbackActive) return;
    mode = MODES[nextMode] ? nextMode : 'ask';
    const copy = MODES[mode];
    modeEl.textContent = copy.eyebrow;
    titleEl.textContent = copy.title;
    input.placeholder = copy.placeholder;
    if (context != null) contextEl.textContent = context;
    syncEmptyState();
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    opener.classList.add('is-hidden');
    if (focusComposer) requestAnimationFrame(() => input.focus());
  }

  function close() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (!playbackActive) opener.classList.remove('is-hidden');
  }

  function openFromOpener() {
    open('ask', { focusComposer: true });
  }

  function closeOnOutsidePointerDown(event) {
    if (!drawer.classList.contains('is-open') || container.contains(event.target)) return;
    close();
  }

  function submitMessage(event) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    append('user', message);
    callbacks.onSubmit?.({ message, mode });
  }

  closeButton.addEventListener('click', close);
  opener.addEventListener('click', openFromOpener);
  document.addEventListener('pointerdown', closeOnOutsidePointerDown);
  form.addEventListener('submit', submitMessage);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  renderHistory();

  return {
    open,
    close,
    setPlaybackActive(active) {
      playbackActive = Boolean(active);
      if (playbackActive) close();
      opener.classList.toggle('is-hidden', playbackActive || drawer.classList.contains('is-open'));
    },
    setContext(text) { contextEl.textContent = text; },
    clearTransient,
    appendAssistant(message) { append('assistant', message, { animate: true }); },
    setLoading() {
      clearTransient();
      loadingEl = document.createElement('div');
      loadingEl.className = 'tutor-chat-loading';
      const loadingCopy = mode === 'suggest'
        ? 'Finding one practical change to try'
        : mode === 'ask'
          ? 'Thinking about your question'
          : 'Tracing the exact voices and generated notes';
      loadingEl.innerHTML = `<p>${ loadingCopy }<span class="tutor-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>`;
      messagesEl.append(loadingEl);
      scrollToLatest();
    },
    setResult(result) { append('assistant', result, { animate: true }); },
    setError(message, retryContext) {
      clearTransient();
      errorEl = document.createElement('div');
      errorEl.className = 'tutor-chat-error';
      errorEl.innerHTML = `<p>${ escapeHtml(message) }</p><button class="tutor-chat-retry" type="button">Retry</button>`;
      errorEl.querySelector('button').onclick = () => callbacks.onRetry?.(retryContext);
      messagesEl.append(errorEl);
      scrollToLatest();
    },
    getHistory() { return history.map((entry) => ({ ...entry })); },
    getMode() { return mode; },
    destroy() {
      if (stopTyping) stopTyping();
      closeButton.removeEventListener('click', close);
      opener.removeEventListener('click', openFromOpener);
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
      form.removeEventListener('submit', submitMessage);
      container.replaceChildren();
    },
  };
}
