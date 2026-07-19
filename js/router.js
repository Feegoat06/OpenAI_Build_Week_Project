/**
 * Tiny hash router.
 *
 * A view is `{ mount(root, params) -> Promise<{ unmount() }>, ... }`. Routes
 * are matched top-to-bottom; the first match wins. If none match, the
 * `notFound` view is mounted.
 *
 * Boot behavior:
 * - When the URL has no hash and the user was recently in an editor route,
 *   redirect to that editor before the first mount. See resumeIfFresh().
 *
 * Every successful mount stamps `legato.lastRoute` and `legato.lastRouteAt`
 * so the next boot has something to check against.
 */

const LAST_ROUTE_KEY = 'legato.lastRoute';
const LAST_ROUTE_AT_KEY = 'legato.lastRouteAt';

/** 6 hours must pass before the user gets redirected to the Home page instead of their last recent project */
export const RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

export function createRouter({ root, routes, notFound, resume }) {
  let current = null;

  async function handle() {
    const hash = normalizeHash(location.hash);
    const match = findMatch(routes, hash);
    if (current?.unmount) {
      try { await current.unmount(); } catch (error) { console.error('View unmount failed:', error); }
    }
    root.replaceChildren();
    try {
      current = match
        ? await match.route.view.mount(root, match.params)
        : await notFound.mount(root, {});
      stampLastRoute(hash);
    } catch (error) {
      console.error('View mount failed:', error);
      current = null;
      root.textContent = 'Something went wrong loading this view. Reload to try again.';
    }
  }

  async function start() {
    if (!location.hash) {
      const resumeHash = await resume?.(readLastRoute());
      if (resumeHash) {
        // Setting the hash normally triggers hashchange; but since the
        // listener fires asynchronously we let it drive handle() there.
        location.hash = resumeHash;
        return;
      }
    }
    await handle();
  }

  window.addEventListener('hashchange', () => { handle(); });
  return { start };
}

/** Programmatic navigation. Views should use this rather than touching location. */
export function navigate(hash) {
  const normalized = hash.startsWith('#') ? hash : `#${ hash }`;
  if (location.hash === normalized) return;
  location.hash = normalized;
}

/**
 * Default resume policy: honor the last editor route if it was written within
 * RESUME_WINDOW_MS AND the target project still exists in the store.
 *
 * @param {{ getProject: (id: string) => Promise<any> }} store
 */
export function makeEditorResumePolicy(store) {
  return async (last) => {
    if (!last) return null;
    const parsed = parseEditorHash(last.route);
    if (!parsed) return null;
    if (!Number.isFinite(last.atMs) || Date.now() - last.atMs >= RESUME_WINDOW_MS) return null;
    const project = await store.getProject(parsed.id);
    if (!project || project.deletedAt) return null;
    return last.route;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeHash(hash) {
  if (!hash || hash === '#') return '#/';
  return hash;
}

function findMatch(routes, hash) {
  for (const route of routes) {
    const params = route.match(hash);
    if (params) return { route, params };
  }
  return null;
}

function stampLastRoute(hash) {
  try {
    localStorage.setItem(LAST_ROUTE_KEY, hash);
    localStorage.setItem(LAST_ROUTE_AT_KEY, new Date().toISOString());
  } catch {
    // Ignore — quota errors on this key are harmless.
  }
}

function readLastRoute() {
  try {
    const route = localStorage.getItem(LAST_ROUTE_KEY);
    const at = localStorage.getItem(LAST_ROUTE_AT_KEY);
    if (!route || !at) return null;
    const atMs = Date.parse(at);
    return { route, atMs };
  } catch {
    return null;
  }
}

const EDITOR_HASH = /^#\/edit\/(.+)$/;
const PROJECT_HASH = /^#\/project\/(.+)$/;

export function parseEditorHash(hash) {
  const match = PROJECT_HASH.exec(hash) ?? EDITOR_HASH.exec(hash);
  return match ? { id: decodeURIComponent(match[1]), legacy: EDITOR_HASH.test(hash) } : null;
}

export function editorHash(id) {
  return `#/project/${ encodeURIComponent(id) }`;
}

export const LANDING_HASH = '#/';
