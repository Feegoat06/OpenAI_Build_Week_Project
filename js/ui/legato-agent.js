import { escapeHtml } from '../util/html.js';

const TEMPLATE = `
<section class="legato-agent" aria-label="Conversation with LEGATO">
  <div class="legato-bubble" aria-live="polite">
    <span class="legato-name">LEGATO</span>
    <p class="legato-reaction">Shape the progression, then let me listen before we play.</p>
    <div class="legato-bubble-actions">
      <button class="legato-open" type="button">Ask me</button>
      <select class="legato-activity" aria-label="LEGATO feedback frequency">
        <option value="proactive">Proactive</option>
        <option value="important">Important only</option>
        <option value="ask-only">Ask only</option>
      </select>
    </div>
  </div>
  <div class="legato-conversation" hidden>
    <header><div><span class="kicker">Your pianist companion</span><h2>Talk with LEGATO</h2></div><button class="legato-close" type="button" aria-label="Close conversation">×</button></header>
    <div class="legato-messages" role="log" aria-live="polite"></div>
    <form class="legato-form">
      <label for="legato-question">Ask about the score, a voicing, or a transition</label>
      <div><textarea id="legato-question" rows="2" maxlength="600" placeholder="What should I listen for here?"></textarea><button type="submit">Ask</button></div>
    </form>
  </div>
</section>`;

export function mountLegatoAgent({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const root = container.querySelector('.legato-agent');
  const bubble = root.querySelector('.legato-bubble');
  const reaction = root.querySelector('.legato-reaction');
  const conversation = root.querySelector('.legato-conversation');
  const messages = root.querySelector('.legato-messages');
  const form = root.querySelector('.legato-form');
  const input = root.querySelector('textarea');
  const activity = root.querySelector('.legato-activity');
  let context = null;

  try { activity.value = localStorage.getItem('legato.coachActivity') || 'proactive'; } catch { /* Storage is optional. */ }
  activity.onchange = () => {
    try { localStorage.setItem('legato.coachActivity', activity.value); } catch { /* Storage is optional. */ }
    callbacks.onActivityModeChange?.(activity.value);
  };

  root.querySelector('.legato-open').onclick = () => open();
  root.querySelector('.legato-close').onclick = () => close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    appendMessage({ role: 'user', text: question });
    input.value = '';
    callbacks.onQuestion(question, context);
  };

  function open({ prefill = '', nextContext = context } = {}) {
    context = nextContext;
    conversation.hidden = false;
    bubble.classList.add('is-quiet');
    if (prefill) input.value = prefill;
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    conversation.hidden = true;
    bubble.classList.remove('is-quiet');
  }

  function appendMessage({ role, text, structured }) {
    const article = document.createElement('article');
    article.className = `legato-message is-${ role }`;
    if (structured) {
      article.innerHTML = `<strong>${ role === 'assistant' ? 'LEGATO' : 'You' }</strong><div class="legato-structured"><p><span>What you hear</span>${ escapeHtml(structured.whatYouHear) }</p><p><span>Why it works</span>${ escapeHtml(structured.whyItWorks) }</p><p><span>Try this</span>${ escapeHtml(structured.tryThis) }</p><p><span>Reflect</span>${ escapeHtml(structured.reflect) }</p></div>`;
    } else {
      article.innerHTML = `<strong>${ role === 'assistant' ? 'LEGATO' : 'You' }</strong><p>${ escapeHtml(text) }</p>`;
    }
    messages.append(article);
    messages.scrollTop = messages.scrollHeight;
  }

  return {
    openComposer({ prefill = '', context: nextContext = null } = {}) { open({ prefill, nextContext }); },
    close,
    getActivityMode() { return activity.value; },
    setContext(next) { context = next; },
    setReaction(text) { reaction.textContent = text; bubble.classList.remove('is-thinking'); },
    setThinking(thinking) {
      bubble.classList.toggle('is-thinking', thinking);
      if (thinking) reaction.textContent = 'I’m tracing the voices and the shape of your piece…';
    },
    showNudge(text) { reaction.textContent = text; bubble.classList.add('is-nudge'); },
    appendMessage,
    setError(message) {
      appendMessage({ role: 'assistant', text: message });
      reaction.textContent = 'We can keep composing even when my connection is quiet.';
    },
  };
}
