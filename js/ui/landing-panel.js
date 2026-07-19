/**
 * Landing / projects hub panel.
 *
 * The single page a user lands on when opening the app (unless the router's
 * time-guarded resume sends them straight back into the editor). Sections:
 *
 *   1. Hero               — brand + tagline; animation slot for later.
 *   2. Actions row        — New project, Import…, Export all.
 *   3. Recent projects    — user's active projects, sorted by updatedAt desc.
 *   4. Demo projects      — read from js/data/demo-projects.js; opening one
 *                            clones it into localStorage as a new project.
 *   5. Trash              — collapsible; Restore / Delete permanently.
 *
 * DOM lives here. The view module wires callbacks up to the store.
 */
import { escapeHtml } from '../util/html.js';

const TEMPLATE = `
<div class="landing-shell">
  <header class="landing-header">
    <div class="landing-brand">
      <img class="brand-mark" src="/assets/brand/legato-icon.png" alt="" draggable="false">
      <span class="brand">LEGATO</span>
    </div>
    <span class="landing-tagline">Composition workspace</span>
  </header>

  <section class="landing-hero">
    <p class="kicker">Progression coach</p>
    <h1>Build the space<br><em>between chords.</em></h1>
    <p class="landing-lede">Pick up a demo, open a recent project, or start something new. Everything is saved to this browser and can be exported at any time.</p>
  </section>

  <div class="landing-scroll">
    <div id="landing-notice" class="landing-notice" hidden></div>

    <section class="landing-section" aria-labelledby="landing-recent-title">
      <div class="landing-section-head">
        <h2 id="landing-recent-title">Recent projects</h2>
        <span id="landing-recent-count" class="landing-count"></span>
        <div class="landing-section-utilities">
          <button id="landing-import" class="landing-secondary" type="button">Import…</button>
          <button id="landing-export-all" class="landing-secondary" type="button">Export all</button>
          <input id="landing-import-file" type="file" accept="application/json,.json" hidden />
        </div>
        <div class="landing-section-actions">
          <button id="landing-new" class="landing-primary" type="button">+ New Project</button>
        </div>
      </div>
      <div id="landing-recent-grid" class="landing-grid landing-grid-rail"></div>
    </section>

    <section class="landing-section" aria-labelledby="landing-demos-title">
      <div class="landing-section-head">
        <h2 id="landing-demos-title">Demos</h2>
        <span class="landing-count">curated by the LEGATO team</span>
      </div>
      <div id="landing-demos-grid" class="landing-grid landing-grid-rail"></div>
    </section>

    <section class="landing-section landing-trash" aria-labelledby="landing-trash-title">
      <div class="landing-trash-header">
        <button id="landing-trash-toggle" class="landing-section-head landing-trash-toggle" type="button" aria-expanded="false" aria-controls="landing-trash-grid">
          <h2 id="landing-trash-title">Trash</h2>
          <span id="landing-trash-count" class="landing-count">Empty</span>
          <span class="landing-trash-caret" aria-hidden="true">▾</span>
        </button>
        <button id="landing-trash-empty" class="landing-trash-empty" type="button" hidden>Empty trash</button>
      </div>
      <div id="landing-trash-grid" class="landing-grid landing-trash-grid" hidden></div>
    </section>

    <footer class="landing-footer">
      <p>Projects are stored on this device. Use Export to back them up or move them to another browser.</p>
    </footer>
  </div>
</div>
`;

export function mountLandingPanel({ container, callbacks }) {
  container.insertAdjacentHTML('beforeend', TEMPLATE);
  const shell = container.querySelector('.landing-shell');

  const newBtn = shell.querySelector('#landing-new');
  const importBtn = shell.querySelector('#landing-import');
  const importInput = shell.querySelector('#landing-import-file');
  const exportAllBtn = shell.querySelector('#landing-export-all');
  const noticeEl = shell.querySelector('#landing-notice');
  const recentGrid = shell.querySelector('#landing-recent-grid');
  const recentCount = shell.querySelector('#landing-recent-count');
  const demosGrid = shell.querySelector('#landing-demos-grid');
  const trashToggle = shell.querySelector('#landing-trash-toggle');
  const trashEmptyBtn = shell.querySelector('#landing-trash-empty');
  const trashGrid = shell.querySelector('#landing-trash-grid');
  const trashCount = shell.querySelector('#landing-trash-count');

  let trashOpen = false;

  newBtn.onclick = () => callbacks.onNewProject();
  importBtn.onclick = () => importInput.click();
  exportAllBtn.onclick = () => callbacks.onExportAll();
  importInput.onchange = async (event) => {
    const file = event.target.files?.[0];
    importInput.value = '';
    if (!file) return;
    const text = await file.text();
    callbacks.onImport(text);
  };
  trashToggle.onclick = () => {
    trashOpen = !trashOpen;
    trashToggle.setAttribute('aria-expanded', String(trashOpen));
    trashGrid.hidden = !trashOpen;
  };
  trashEmptyBtn.onclick = () => callbacks.onEmptyTrash();

  function renderCards(gridEl, cards, kind) {
    gridEl.replaceChildren();
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'landing-empty';
      empty.textContent = emptyMessage(kind);
      gridEl.append(empty);
      return;
    }
    for (const card of cards) gridEl.append(renderCard(card, kind, callbacks));
  }

  return {
    render({ recent, demos, trashed }) {
      renderCards(recentGrid, recent, 'recent');
      renderCards(demosGrid, demos, 'demo');
      renderCards(trashGrid, trashed, 'trashed');
      recentCount.textContent = recent.length === 1 ? '1 project' : `${ recent.length } projects`;
      trashCount.textContent = trashed.length ? `${ trashed.length } item${ trashed.length === 1 ? '' : 's' }` : 'Empty';
      trashEmptyBtn.hidden = !trashed.length;
    },
    showNotice({ message, level = 'info' }) {
      noticeEl.textContent = message;
      noticeEl.dataset.level = level;
      noticeEl.hidden = false;
    },
    hideNotice() {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
    },
  };
}

function emptyMessage(kind) {
  if (kind === 'recent') return 'No projects yet. Start a new one or open a demo below.';
  if (kind === 'trashed') return 'Nothing in the trash.';
  return 'No demos.';
}

// Simple 1.5-stroke line icons matching the editor's icon-button style.
const ICONS = {
  rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  duplicate: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M10 11v7M14 11v7"/></svg>',
};

function iconButton({ icon, label, action, dangerous = false }) {
  return `<button type="button" class="landing-card-icon${ dangerous ? ' danger' : '' }" data-action="${ action }" title="${ label }" aria-label="${ label }">${ ICONS[icon] }</button>`;
}

function renderCard(project, kind, callbacks) {
  const chordCount = project.progression?.chords?.length ?? 0;
  const seamCount = project.progression?.seams?.filter(Boolean).length ?? 0;
  const meta = kind === 'demo'
    ? escapeHtml(project.blurb ?? `${ chordCount } chord${ chordCount === 1 ? '' : 's' }`)
    : `${ chordCount } chord${ chordCount === 1 ? '' : 's' } · ${ seamCount } transition${ seamCount === 1 ? '' : 's' }`;

  // Demo cards are one big clickable target that opens a copy — no separate
  // primary button, no ambiguity about what a click does. Recent + trashed
  // cards keep the two-region layout (body + actions).
  if (kind === 'demo') {
    const card = document.createElement('button');
    card.className = `landing-card landing-card-demo`;
    card.dataset.projectId = project.id;
    card.type = 'button';
    card.innerHTML = `
      <span class="landing-card-badge">Demo · click to open a copy</span>
      <span class="landing-card-name">${ escapeHtml(project.name) }</span>
      <span class="landing-card-meta">${ meta }</span>
    `;
    card.onclick = () => callbacks.onOpenDemo(project.id);
    return card;
  }

  const card = document.createElement('article');
  card.className = `landing-card landing-card-${ kind }`;
  card.dataset.projectId = project.id;

  const iconRow = kind === 'recent'
    ? [
        iconButton({ icon: 'rename', label: 'Rename', action: 'rename' }),
        iconButton({ icon: 'duplicate', label: 'Duplicate', action: 'duplicate' }),
        iconButton({ icon: 'export', label: 'Export', action: 'export' }),
        iconButton({ icon: 'trash', label: 'Move to trash', action: 'trash', dangerous: true }),
      ].join('')
    : '';

  const updatedAt = project.updatedAt ? `<span class="landing-card-updated">${ formatRelative(project.updatedAt) }</span>` : '';
  const primaryAction = kind === 'trashed'
    ? '<button class="landing-card-primary" type="button">Restore</button>'
    : '';
  const bodyTag = kind === 'recent' ? 'button' : 'div';
  const bodyAttrs = kind === 'recent' ? 'type="button"' : '';

  card.innerHTML = `
    <${ bodyTag } class="landing-card-body" ${ bodyAttrs }>
      <div class="landing-card-title-row">
        <span class="landing-card-name">${ escapeHtml(project.name) }</span>
        ${ updatedAt }
      </div>
      <span class="landing-card-meta">${ meta }</span>
    </${ bodyTag }>
    <div class="landing-card-actions">
      ${ primaryAction }
      ${ iconRow }
      ${ kind === 'trashed' ? iconButton({ icon: 'trash', label: 'Delete permanently', action: 'delete', dangerous: true }) : '' }
    </div>
  `;

  const primaryBtn = card.querySelector('.landing-card-primary');

  if (kind === 'recent') {
    const open = () => callbacks.onOpenProject(project.id);
    card.querySelector('.landing-card-body').onclick = open;
    card.querySelector('.landing-card-actions').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      event.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'rename') {
        const next = prompt('Rename project', project.name);
        if (next && next.trim()) callbacks.onRenameProject(project.id, next.trim());
      } else if (action === 'duplicate') {
        callbacks.onDuplicateProject(project.id);
      } else if (action === 'export') {
        callbacks.onExportProject(project.id);
      } else if (action === 'trash') {
        callbacks.onTrashProject(project.id);
      }
    });
  } else {
    primaryBtn.onclick = () => callbacks.onRestoreProject(project.id);
    card.querySelector('.landing-card-actions').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="delete"]');
      if (!btn) return;
      event.stopPropagation();
      if (confirm(`Permanently delete "${ project.name }"? This can't be undone.`)) {
        callbacks.onDeleteProject(project.id);
      }
    });
  }

  return card;
}

function formatRelative(iso) {
  if (!iso) return 'just now';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${ Math.floor(seconds / 60) } min ago`;
  if (seconds < 86400) return `${ Math.floor(seconds / 3600) } hr ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${ days } day${ days === 1 ? '' : 's' } ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
