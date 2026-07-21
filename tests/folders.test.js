import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../js/persistence.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function makeStore() {
  return createProjectStore({ storage: memoryStorage() });
}

test('folders can be created, listed, and renamed with unique names', async () => {
  const store = makeStore();
  const jazz = await store.createFolder('Jazz studies');
  assert.equal(jazz.name, 'Jazz studies');

  const dupe = await store.createFolder('Jazz studies');
  assert.equal(dupe.name, 'Jazz studies (2)');

  const renamed = await store.renameFolder(dupe.id, 'Classical');
  assert.equal(renamed.name, 'Classical');

  const folders = await store.listFolders();
  assert.deepEqual(folders.map((f) => f.name), ['Jazz studies', 'Classical']);

  // Renaming into an existing name de-duplicates instead of colliding.
  const collided = await store.renameFolder(dupe.id, 'Jazz studies');
  assert.equal(collided.name, 'Jazz studies (2)');
});

test('assignToFolder files and un-files projects without touching updatedAt', async () => {
  const store = makeStore();
  const folder = await store.createFolder('Sketches');
  const a = await store.createProject({ name: 'A' });
  const b = await store.createProject({ name: 'B' });

  const moved = await store.assignToFolder([a.id, b.id], folder.id);
  assert.deepEqual(moved.map((p) => p.id).sort(), [a.id, b.id].sort());

  const after = await store.listProjects();
  for (const project of after) {
    assert.equal(project.folderId, folder.id);
    const before = project.id === a.id ? a : b;
    assert.equal(project.updatedAt, before.updatedAt, 'filing must not reshuffle recency ordering');
  }

  // null un-files back to All projects.
  await store.assignToFolder([a.id], null);
  const refetched = await store.getProject(a.id);
  assert.equal(refetched.folderId, null);
});

test('assigning to a nonexistent folder is a no-op', async () => {
  const store = makeStore();
  const project = await store.createProject({ name: 'A' });
  const moved = await store.assignToFolder([project.id], 'f_missing');
  assert.deepEqual(moved, []);
  assert.equal((await store.getProject(project.id)).folderId ?? null, null);
});

test('deleting a folder keeps its projects and releases them to All', async () => {
  const store = makeStore();
  const folder = await store.createFolder('Doomed');
  const project = await store.createProject({ name: 'Survivor' });
  await store.assignToFolder([project.id], folder.id);

  assert.equal(await store.deleteFolder(folder.id), true);
  assert.deepEqual(await store.listFolders(), []);

  const survivor = await store.getProject(project.id);
  assert.ok(survivor, 'project must survive folder deletion');
  assert.equal(survivor.folderId, null);
});

test('trash and restore preserve folder membership', async () => {
  const store = makeStore();
  const folder = await store.createFolder('Keep');
  const project = await store.createProject({ name: 'A' });
  await store.assignToFolder([project.id], folder.id);

  await store.trashProject(project.id);
  assert.equal((await store.getProject(project.id)).folderId, folder.id);

  await store.restoreProject(project.id);
  assert.equal((await store.getProject(project.id)).folderId, folder.id);
});

test('duplicating a filed project keeps the copy in the same folder', async () => {
  const store = makeStore();
  const folder = await store.createFolder('Album');
  const original = await store.createProject({ name: 'Track' });
  await store.assignToFolder([original.id], folder.id);

  const copy = await store.duplicateProject(original.id);
  assert.equal(copy.folderId, folder.id);
});

test('export strips folderId and import lands projects outside any folder', async () => {
  const store = makeStore();
  const folder = await store.createFolder('Local only');
  const project = await store.createProject({ name: 'A' });
  await store.assignToFolder([project.id], folder.id);

  const { blob } = await store.exportProjects([project.id]);
  const payload = JSON.parse(await blob.text());
  assert.equal(payload.projects.length, 1);
  assert.ok(!('folderId' in payload.projects[0]), 'export must not leak device-local folder assignment');
  assert.ok(!('deletedAt' in payload.projects[0]));

  const target = makeStore();
  const { added, error } = await target.importProjects(JSON.stringify(payload));
  assert.equal(error, undefined);
  assert.equal(added.length, 1);
  assert.equal(added[0].folderId, null);
});
