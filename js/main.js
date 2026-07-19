/**
 * Application bootstrap.
 *
 * Two views (landing, editor) and one router. Everything else — progression
 * state, sheet music rendering, audio, coach — lives inside the editor view
 * so navigating away and back gives a clean slate.
 *
 *   #/           → landing view
 *   #/project/:id → project workspace (Edit / Review / Play)
 *   #/edit/:id    → legacy-compatible project workspace route
 *
 * The piano modal is mounted once here (shared across sessions) because it
 * is stateful DOM the editor opens and closes many times per session; a per-
 * mount rebuild would slow chord edits down for no gain.
 */
import { mountPianoModal } from './ui/piano-modal.js';
import { createProjectStore } from './persistence.js';
import { createRouter, makeEditorResumePolicy, parseEditorHash, LANDING_HASH } from './router.js';
import { createLandingView } from './views/landing-view.js';
import { createEditorView } from './views/editor-view.js';
import { makeDefaultProgression } from './data/demo-projects.js';

const appRoot = document.querySelector('#app-root');
const pianoDialog = mountPianoModal({
  container: document.querySelector('#piano-modal-mount'),
});

const store = createProjectStore();
const landingView = createLandingView({ store });
const editorView = createEditorView({
  store,
  pianoDialog,
  exampleProgressionFactory: makeDefaultProgression,
});

const router = createRouter({
  root: appRoot,
  routes: [
    { match: (hash) => (hash === LANDING_HASH ? {} : null), view: landingView },
    { match: (hash) => parseEditorHash(hash), view: editorView },
  ],
  notFound: landingView,
  resume: makeEditorResumePolicy(store),
});

router.start();
