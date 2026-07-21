/**
 * Right-side Tutor drawer shared by Tenutino's three actions, plus a
 * persistent semi-transparent edge opener on the right of the viewport.
 * Conversation state stays local to the browser and is restored per project.
 */
import { escapeHtml } from '../util/html.js';
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
  lesson: {
    eyebrow: 'Listening challenge',
    title: 'Train your ear',
    empty: 'Make a musical edit and I will look for one useful thing to practise.',
    placeholder: 'Ask a follow-up about this comparison...',
  },
};

const MAX_HISTORY = 40;

function validHistoryEntry(entry) {
  if (!entry || !['user', 'assistant'].includes(entry.role)) return false;
  if (typeof entry.content === 'string') return true;
  const resultKeys = ['whatYouHear', 'whyItWorks', 'tryThis', 'reflect'];
  return entry.content && typeof entry.content === 'object'
    && resultKeys.every((key) => typeof entry.content[key] === 'string');
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
        <section class="tutor-lesson" aria-labelledby="tutor-lesson-title" hidden>
          <header class="tutor-lesson-header">
            <div>
              <span>Active listening</span>
              <h3 id="tutor-lesson-title">A voice-leading challenge</h3>
            </div>
            <button class="tutor-lesson-dismiss" type="button" aria-label="Dismiss listening challenge">Later</button>
          </header>
          <p class="tutor-lesson-observation"></p>
          <div class="tutor-lesson-predict">
            <p class="tutor-lesson-question"></p>
            <div class="tutor-lesson-choices" role="group" aria-label="Choose your prediction">
              <button type="button" data-lesson-prediction="original">Original</button>
              <button type="button" data-lesson-prediction="candidate">Version B</button>
              <button type="button" data-lesson-prediction="same">About the same</button>
            </div>
          </div>
          <div class="tutor-lesson-result" hidden>
            <p class="tutor-lesson-feedback" role="status"></p>
            <div class="tutor-lesson-motion">
              <span>Original <strong data-lesson-motion="original"></strong></span>
              <span>Version B <strong data-lesson-motion="candidate"></strong></span>
            </div>
            <div class="tutor-lesson-playback" role="group" aria-label="Compare the two versions">
              <button type="button" data-lesson-play="original">Play original</button>
              <button type="button" data-lesson-play="candidate">Play version B</button>
            </div>
            <p class="tutor-lesson-caveat">Closer motion is not automatically better. Listen for the change, then choose the effect you prefer.</p>
            <div class="tutor-lesson-actions">
              <button type="button" data-lesson-decision="adopted">Use version B</button>
              <button type="button" data-lesson-decision="kept-original">Keep original</button>
              <button type="button" data-lesson-explain>Explain why</button>
            </div>
            <p class="tutor-lesson-progress"></p>
          </div>
        </section>
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
  const lessonEl = container.querySelector('.tutor-lesson');
  const lessonObservationEl = lessonEl.querySelector('.tutor-lesson-observation');
  const lessonQuestionEl = lessonEl.querySelector('.tutor-lesson-question');
  const lessonPredictEl = lessonEl.querySelector('.tutor-lesson-predict');
  const lessonResultEl = lessonEl.querySelector('.tutor-lesson-result');
  const lessonFeedbackEl = lessonEl.querySelector('.tutor-lesson-feedback');
  const lessonProgressEl = lessonEl.querySelector('.tutor-lesson-progress');
  const emptyEl = container.querySelector('.tutor-chat-empty');
  const form = container.querySelector('.tutor-chat-composer');
  const input = container.querySelector('#tutor-chat-input');
  const closeButton = container.querySelector('.tutor-chat-close');

  let mode = 'ask';
  let history = readHistory(storageKey);
  let playbackActive = false;
  let loadingEl = null;
  let errorEl = null;
  let lesson = null;
  let lessonPlaying = null;
  let lessonCompleted = false;

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(history.slice(-MAX_HISTORY))); }
    catch { /* Local persistence is best-effort. */ }
  }

  function scrollToLatest() {
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  function renderEntry(entry) {
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
  }

  function syncEmptyState() {
    emptyEl.hidden = history.length > 0 || Boolean(lesson);
    emptyEl.textContent = MODES[mode].empty;
  }

  function renderLessonPlayback() {
    lessonEl.querySelectorAll('[data-lesson-play]').forEach((button) => {
      const variant = button.dataset.lessonPlay;
      button.disabled = Boolean(lessonPlaying);
      button.textContent = lessonPlaying === variant
        ? 'Playing…'
        : variant === 'candidate' ? 'Play version B' : 'Play original';
    });
  }

  function renderLesson(nextLesson, progress = null) {
    lesson = nextLesson;
    lessonCompleted = false;
    lessonPlaying = null;
    lessonEl.hidden = false;
    lessonObservationEl.textContent = lesson.observation;
    lessonQuestionEl.textContent = lesson.prompt;
    lessonPredictEl.hidden = false;
    lessonResultEl.hidden = true;
    lessonProgressEl.textContent = progress?.attempts
      ? `Top-voice listening practice: ${ progress.correct } of ${ progress.attempts } predictions supported by the note evidence.`
      : 'Your first top-voice listening exercise.';
    lessonEl.querySelector('[data-lesson-motion="original"]').textContent = `${ Math.abs(lesson.originalMotion) } semitones`;
    lessonEl.querySelector('[data-lesson-motion="candidate"]').textContent = `${ Math.abs(lesson.candidateMotion) } semitones`;
    lessonEl.querySelectorAll('[data-lesson-decision]').forEach((button) => { button.disabled = false; });
    renderLessonPlayback();
    syncEmptyState();
  }

  function handleLessonClick(event) {
    if (!lesson) return;
    const prediction = event.target.closest('[data-lesson-prediction]')?.dataset.lessonPrediction;
    if (prediction) {
      const correct = prediction === lesson.correctPrediction;
      lessonPredictEl.hidden = true;
      lessonResultEl.hidden = false;
      lessonFeedbackEl.textContent = correct
        ? 'Your prediction matches the notes: version B keeps the top voice closer.'
        : 'Now test that prediction by ear. Version B has the smaller measured top-voice motion.';
      callbacks.onLessonPrediction?.({ lesson, prediction, correct });
      scrollToLatest();
      return;
    }

    const variant = event.target.closest('[data-lesson-play]')?.dataset.lessonPlay;
    if (variant && !lessonPlaying) {
      callbacks.onLessonPlay?.({ lesson, variant });
      return;
    }

    const decision = event.target.closest('[data-lesson-decision]')?.dataset.lessonDecision;
    if (decision && !lessonCompleted) callbacks.onLessonDecision?.({ lesson, decision });
    if (event.target.closest('[data-lesson-explain]')) callbacks.onLessonExplain?.({ lesson });
  }

  function dismissLesson() {
    if (!lesson) return;
    const dismissed = lesson;
    lesson = null;
    lessonPlaying = null;
    lessonEl.hidden = true;
    callbacks.onLessonDismiss?.({ lesson: dismissed });
    syncEmptyState();
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

  function append(role, content) {
    clearTransient();
    const entry = { role, content, mode, createdAt: Date.now() };
    history.push(entry);
    history = history.slice(-MAX_HISTORY);
    renderEntry(entry);
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
  lessonEl.addEventListener('click', handleLessonClick);
  lessonEl.querySelector('.tutor-lesson-dismiss').addEventListener('click', dismissLesson);

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
    appendAssistant(message) { append('assistant', message); },
    setLoading() {
      clearTransient();
      loadingEl = document.createElement('div');
      loadingEl.className = 'tutor-chat-loading';
      loadingEl.innerHTML = '<span class="spinner"></span><p>Tracing the exact voices and generated notes...</p>';
      messagesEl.append(loadingEl);
      scrollToLatest();
    },
    setResult(result) { append('assistant', result); },
    offerLesson(nextLesson, { progress = null } = {}) {
      if (!nextLesson || (lesson?.id === nextLesson.id && !lessonCompleted)) return;
      renderLesson(nextLesson, progress);
      open('lesson', { context: 'A prediction, two playable versions, and evidence from your exact notes.' });
      scrollToLatest();
    },
    setLessonPlaying(variant) {
      lessonPlaying = variant || null;
      renderLessonPlayback();
    },
    setLessonProgress(progress) {
      if (!lesson || !progress) return;
      lessonProgressEl.textContent = `Top-voice listening practice: ${ progress.correct } of ${ progress.attempts } predictions supported by the note evidence.`;
    },
    completeLesson(decision) {
      if (!lesson) return;
      lessonCompleted = true;
      lessonPlaying = null;
      renderLessonPlayback();
      lessonFeedbackEl.textContent = decision === 'adopted'
        ? 'Version B is now in your progression. Your original was changed only after your choice.'
        : 'Your original voicing stays in the progression. The comparison is saved in your learning record.';
      lessonEl.querySelectorAll('[data-lesson-decision]').forEach((button) => { button.disabled = true; });
    },
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
      closeButton.removeEventListener('click', close);
      opener.removeEventListener('click', openFromOpener);
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
      form.removeEventListener('submit', submitMessage);
      lessonEl.removeEventListener('click', handleLessonClick);
      container.replaceChildren();
    },
  };
}
