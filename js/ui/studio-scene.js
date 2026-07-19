/**
 * Layered Edit/Review/Play studio shell. Scenic assets never own application
 * state: this module exposes mount points and small visual setters only.
 */

const EDIT_CHARACTER = '/assets/studio/legato-edit-chroma.png';
const PLAY_CHARACTER = '/assets/studio/legato-play-chroma.png';

const TEMPLATE = `
<section class="studio-workspace" data-mode="edit" aria-label="LEGATO project studio">
  <div class="studio-room-layer" aria-hidden="true"></div>
  <div class="studio-window-mask" aria-hidden="true"><canvas class="studio-stars"></canvas></div>

  <header class="studio-toolbar">
    <button class="studio-brand" type="button" aria-label="Save and return to projects">
      <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
      <span><strong>LEGATO</strong><small>Studio session</small></span>
    </button>
    <div class="studio-project-copy">
      <span class="kicker">Current project</span>
      <input class="studio-project-name" aria-label="Project name" spellcheck="false" autocomplete="off">
    </div>
    <output class="studio-status" aria-live="polite">Ready to compose</output>
    <button class="studio-proceed" type="button"><span>Proceed</span><small>Ask LEGATO to review</small></button>
  </header>

  <div class="studio-score-frame">
    <div id="studio-score-mount"></div>
  </div>

  <button class="studio-settings-engraving" type="button" aria-haspopup="dialog">
    <span>Score settings</span><output>100 BPM · 4/4 · C · AUTO</output>
  </button>

  <div class="studio-keyboard" aria-hidden="true"></div>

  <button class="studio-legato-hit" type="button" aria-label="Ask LEGATO a question">
    <canvas class="studio-legato studio-legato-edit" aria-hidden="true"></canvas>
    <canvas class="studio-legato studio-legato-play" aria-hidden="true"></canvas>
  </button>

  <aside id="studio-inspector-mount" class="studio-inspector" aria-label="Chord and transition inspector"></aside>
  <div id="studio-agent-mount" class="studio-agent-mount"></div>
  <div id="studio-review-mount" class="studio-review-mount"></div>
  <div id="studio-play-controls-mount" class="studio-play-controls-mount"></div>
  <div class="studio-particle-progress" aria-hidden="true"><span></span></div>
</section>`;

export function mountStudioScene({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const root = container.querySelector('.studio-workspace');
  const editCanvas = root.querySelector('.studio-legato-edit');
  const playCanvas = root.querySelector('.studio-legato-play');
  const starCanvas = root.querySelector('.studio-stars');
  const keyboard = root.querySelector('.studio-keyboard');
  const progress = root.querySelector('.studio-particle-progress span');
  const projectName = root.querySelector('.studio-project-name');
  const status = root.querySelector('.studio-status');
  const proceed = root.querySelector('.studio-proceed');
  const settingsButton = root.querySelector('.studio-settings-engraving');
  const settingsSummary = settingsButton.querySelector('output');
  const keyRefs = new Map();
  let currentMode = 'edit';

  root.querySelector('.studio-brand').onclick = () => callbacks.onGoHome();
  proceed.onclick = () => callbacks.onProceed();
  settingsButton.onclick = () => callbacks.onOpenSettings();
  root.querySelector('.studio-legato-hit').onclick = () => callbacks.onAskLegato();
  projectName.onchange = () => callbacks.onRenameProject(projectName.value);
  projectName.onkeydown = (event) => {
    if (event.key === 'Enter') projectName.blur();
    if (event.key === 'Escape') { projectName.value = projectName.dataset.committed ?? ''; projectName.blur(); }
  };

  createKeyboard(keyboard);
  drawChromaCharacter(editCanvas, EDIT_CHARACTER);
  drawChromaCharacter(playCanvas, PLAY_CHARACTER);
  const stars = createStarField(starCanvas, root);

  return {
    root,
    scoreMount: root.querySelector('#studio-score-mount'),
    inspectorMount: root.querySelector('#studio-inspector-mount'),
    agentMount: root.querySelector('#studio-agent-mount'),
    reviewMount: root.querySelector('#studio-review-mount'),
    playControlsMount: root.querySelector('#studio-play-controls-mount'),
    settingsButton,
    setMode(mode) {
      currentMode = mode;
      root.dataset.mode = mode;
      stars.setPlaying(['playing', 'paused', 'complete', 'transition'].includes(mode));
      root.classList.toggle('is-paused', mode === 'paused');
      proceed.disabled = mode !== 'edit';
    },
    getMode() { return currentMode; },
    setProjectName(name) {
      if (document.activeElement === projectName) return;
      projectName.value = name;
      projectName.dataset.committed = name;
    },
    setSettingsSummary(text) { settingsSummary.value = text; },
    setStatus(text) { status.value = text; },
    setProceedEnabled(enabled) { proceed.disabled = !enabled || currentMode !== 'edit'; },
    setProgress(value) {
      const normalized = Math.max(0, Math.min(1, Number(value) || 0));
      progress.style.width = `${ normalized * 100 }%`;
      stars.setEnergy(normalized);
    },
    setTempo(value) { stars.setTempo(value); },
    highlightKeys(midis, active = true) {
      for (const midi of midis ?? []) {
        const key = keyboard.querySelector(`[data-midi="${ midi }"]`);
        if (!key) continue;
        const count = Math.max(0, (keyRefs.get(midi) ?? 0) + (active ? 1 : -1));
        keyRefs.set(midi, count);
        key.classList.toggle('is-sounding', count > 0);
      }
    },
    clearKeys() {
      keyRefs.clear();
      keyboard.querySelectorAll('.is-sounding').forEach((key) => key.classList.remove('is-sounding'));
    },
    launchNotes(midis, onArrive) {
      const scoreRect = root.querySelector('.studio-score-frame').getBoundingClientRect();
      let launched = 0;
      for (const midi of midis ?? []) {
        const key = keyboard.querySelector(`[data-midi="${ midi }"]`);
        if (!key) continue;
        const from = key.getBoundingClientRect();
        const note = document.createElement('span');
        note.className = 'studio-flying-note';
        note.textContent = '♪';
        const startX = from.left + from.width / 2;
        const startY = from.top;
        const pitch = (midi - 21) / 87;
        const targetX = scoreRect.left + scoreRect.width * (.2 + .62 * pseudo(midi * 5.17));
        const targetY = scoreRect.top + scoreRect.height * (.8 - pitch * .58);
        note.style.left = `${ startX }px`;
        note.style.top = `${ startY }px`;
        note.style.setProperty('--flight-x', `${ targetX - startX }px`);
        note.style.setProperty('--flight-y', `${ targetY - startY }px`);
        root.append(note);
        launched += 1;
        note.addEventListener('animationend', () => note.remove(), { once: true });
      }
      setTimeout(() => onArrive?.(), launched ? 720 : 0);
    },
    destroy() {
      stars.destroy();
      container.replaceChildren();
    },
  };
}

function createKeyboard(container) {
  const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
  for (let midi = 21; midi <= 108; midi += 1) {
    const key = document.createElement('span');
    key.dataset.midi = String(midi);
    key.className = `studio-key ${ blackPitchClasses.has(midi % 12) ? 'is-black' : 'is-white' }`;
    key.style.setProperty('--key-index', String(midi - 21));
    container.append(key);
  }
}

function drawChromaCharacter(canvas, src) {
  const image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const greenDominance = g - Math.max(r, b);
      if (g > 78 && greenDominance > 22) {
        const alpha = Math.max(0, 255 - (greenDominance - 18) * 4.8);
        data[i + 3] = Math.min(data[i + 3], alpha);
        if (alpha > 0) {
          data[i + 1] = Math.min(g, Math.max(r, b) + 8);
        }
      }
    }
    context.putImageData(frame, 0, 0);
  };
  image.src = src;
}

function createStarField(canvas, root) {
  const context = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({ length: 150 }, (_, index) => ({
    x: pseudo(index * 13.17),
    y: pseudo(index * 31.73),
    radius: .45 + pseudo(index * 7.91) * 1.35,
    phase: pseudo(index * 19.41) * Math.PI * 2,
  }));
  let frame = 0;
  let playing = false;
  let energy = 0;
  let tempo = 100;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function draw(now = 0) {
    resize();
    context.clearRect(0, 0, canvas.width, canvas.height);
    const speed = playing && !reduceMotion.matches ? now * .001 : 0;
    for (const star of stars) {
      const pulse = .45 + .55 * Math.sin(star.phase + speed * (1.2 + energy * 2));
      context.beginPath();
      context.fillStyle = `rgba(${ 195 + Math.round(energy * 35) }, ${ 211 + Math.round(energy * 24) }, 255, ${ .16 + pulse * .55 })`;
      context.arc(star.x * canvas.width, star.y * canvas.height, star.radius * (1 + energy * .45), 0, Math.PI * 2);
      context.fill();
    }
    if (playing) drawParticleStaff(context, canvas, speed * (tempo / 100), energy);
    if (playing && !reduceMotion.matches) frame = requestAnimationFrame(draw);
    else frame = 0;
  }

  const observer = new ResizeObserver(() => { if (!frame) draw(); });
  observer.observe(root);
  draw();
  return {
    setPlaying(value) { playing = value; if (!frame) frame = requestAnimationFrame(draw); },
    setEnergy(value) { energy = value; },
    setTempo(value) { tempo = Math.max(40, Math.min(180, Number(value) || 100)); },
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); },
  };
}

function drawParticleStaff(context, canvas, time, energy) {
  const startX = canvas.width * .06;
  const endX = canvas.width * .94;
  const centerY = canvas.height * .47;
  const gap = Math.max(10, canvas.height * .035);
  for (let line = -2; line <= 2; line += 1) {
    const yBase = centerY + line * gap;
    for (let step = 0; step <= 120; step += 1) {
      const t = step / 120;
      const wave = Math.sin(t * Math.PI * 2.2 + time * .7 + line * .4) * canvas.height * .012 * Math.sin(t * Math.PI);
      const x = startX + (endX - startX) * t;
      const y = yBase + wave;
      context.beginPath();
      context.fillStyle = `rgba(228, 172, 88, ${ .16 + .35 * (1 - Math.abs(t - energy)) })`;
      context.arc(x, y, step % 4 === 0 ? 1.25 : .65, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function pseudo(value) {
  const x = Math.sin(value) * 43758.5453;
  return x - Math.floor(x);
}
