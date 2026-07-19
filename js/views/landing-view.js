/**
 * Landing view — mounts the projects hub and wires its actions to the store.
 *
 * Owns the "read from store, render panel, react to callbacks, re-render"
 * loop. Navigation lives here: opening/cloning a project pushes an editor
 * route via the router.
 */
import { mountLandingPanel } from '../ui/landing-panel.js';
import { navigate, editorHash } from '../router.js';
import { openProjectSettingsModal } from '../ui/project-settings-modal.js';
import { makeProgression, makeSettings } from '../state.js';

export function createLandingView({ store, projectSettingsDialog }) {
  return {
    async mount(root) {
      const panel = mountLandingPanel({
        container: root,
        callbacks: {
          onNewProject: () => {
            openProjectSettingsModal(projectSettingsDialog, {
              mode: 'create',
              initial: { name: 'Untitled project', settings: makeSettings() },
              onSubmit: async ({ name, settings }) => {
                const progression = makeProgression({ settings });
                const project = await tryStore(() => store.createProject({ name, progression }));
                if (project) navigate(editorHash(project.id));
              },
            });
          },
          onImport: async (text) => {
            panel.hideNotice();
            try {
              const { added, warnings, error } = await store.importProjects(text);
              if (error) { panel.showNotice({ message: error, level: 'error' }); return; }
              const parts = [`Imported ${ added.length } project${ added.length === 1 ? '' : 's' }.`];
              if (warnings.length) parts.push(warnings.slice(0, 3).join(' '));
              if (warnings.length > 3) parts.push(`(+${ warnings.length - 3 } more warnings)`);
              panel.showNotice({ message: parts.join(' '), level: warnings.length ? 'warn' : 'info' });
              await refresh();
            } catch (error) {
              panel.showNotice({ message: error.message, level: 'error' });
            }
          },
          onExportAll: async () => {
            try {
              const { blob, filename, count } = await store.exportProjects();
              if (!count) { panel.showNotice({ message: 'No projects to export.', level: 'warn' }); return; }
              downloadBlob(blob, filename);
            } catch (error) {
              panel.showNotice({ message: error.message, level: 'error' });
            }
          },
          onExportProject: async (id) => {
            try {
              const { blob, filename } = await store.exportProjects([id]);
              downloadBlob(blob, filename);
            } catch (error) {
              panel.showNotice({ message: error.message, level: 'error' });
            }
          },
          onOpenProject: (id) => {
            navigate(editorHash(id));
          },
          onOpenDemo: async (demoId) => {
            const clone = await tryStore(() => store.cloneDemo(demoId));
            if (clone) navigate(editorHash(clone.id));
          },
          onRenameProject: async (id, name) => {
            await tryStore(() => store.renameProject(id, name));
            await refresh();
          },
          onDuplicateProject: async (id) => {
            await tryStore(() => store.duplicateProject(id));
            await refresh();
          },
          onTrashProject: async (id) => {
            await tryStore(() => store.trashProject(id));
            await refresh();
          },
          onRestoreProject: async (id) => {
            await tryStore(() => store.restoreProject(id));
            await refresh();
          },
          onDeleteProject: async (id) => {
            await tryStore(() => store.deleteProject(id));
            await refresh();
          },
          onEmptyTrash: async () => {
            const trashed = await store.listTrashed();
            if (!trashed.length) return;
            const label = trashed.length === 1 ? '1 project' : `${ trashed.length } projects`;
            if (!confirm(`Permanently delete ${ label } in the trash? This can't be undone.`)) return;
            for (const project of trashed) {
              await tryStore(() => store.deleteProject(project.id));
            }
            await refresh();
          },
        },
      });

      async function refresh() {
        const [recent, demos, trashed] = await Promise.all([
          store.listProjects(),
          store.listDemos(),
          store.listTrashed(),
        ]);
        panel.render({ recent, demos, trashed });
      }

      async function tryStore(fn) {
        try {
          return await fn();
        } catch (error) {
          panel.showNotice({ message: error.message, level: 'error' });
          return null;
        }
      }

      await refresh();

      return {
        async unmount() {
          root.replaceChildren();
        },
      };
    },
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
