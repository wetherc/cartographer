import test from 'node:test';
import assert from 'node:assert/strict';

import { wireEntityList } from '../src/app/entityList.js';

/**
 * A stand-in AppContext holding one list, plus a dirty counter so the tests can
 * assert which paths mark the campaign changed.
 * @param {{ id: string, title: string }[]} quests
 */
function fakeApp(quests = []) {
  const app = {
    state: { quests },
    dirty: 0,
    actions: {
      markDirty: () => {
        app.dirty += 1;
      },
    },
  };
  return app;
}

/**
 * @param {ReturnType<typeof fakeApp>} app
 * @param {{ values?: Record<string, string> | null, confirm?: boolean }} dialogs
 */
function wire(app, dialogs = {}) {
  /** @type {{ title: string, fields: any[], options: any }[]} */
  const prompts = [];
  /** @type {string[]} */
  const confirms = [];
  const handlers = wireEntityList(/** @type {any} */ (app), {
    key: 'quests',
    noun: 'quest',
    fields: (quest) => [
      { name: 'title', label: 'Title', value: quest?.title ?? '' },
      { name: 'notes', label: 'Notes', value: '' },
    ],
    create: (id, title, values) => ({ id, title, notes: values.notes }),
    patch: (quest, title, values) => ({ ...quest, title, notes: values.notes }),
    prompt: async (title, fields, options) => {
      prompts.push({ title, fields, options });
      return dialogs.values === undefined ? { title: 'Fresh Quest', notes: 'go' } : dialogs.values;
    },
    confirm: async (name) => {
      confirms.push(name);
      return dialogs.confirm ?? true;
    },
  });
  return { handlers, prompts, confirms };
}

test('adding appends an entry with an id slugged from its title', async () => {
  const app = fakeApp();
  const { handlers, prompts } = wire(app);
  const created = await handlers.onAdd();
  assert.deepEqual(created, { id: 'fresh-quest', title: 'Fresh Quest', notes: 'go' });
  assert.deepEqual(app.state.quests, [created]);
  assert.equal(app.dirty, 1);
  assert.equal(prompts[0].title, 'New quest', 'the noun names the add dialog');
  assert.equal(prompts[0].fields[0].value, '', 'the add dialog starts empty');
  assert.equal(prompts[0].options, undefined, 'no edit options reach the add dialog');
});

test('an added id avoids colliding with the ids already in the list', async () => {
  const app = fakeApp([{ id: 'fresh-quest', title: 'Fresh Quest' }]);
  const { handlers } = wire(app);
  const created = await handlers.onAdd();
  assert.equal(created?.id, 'fresh-quest-2');
  assert.equal(app.state.quests.length, 2);
});

test('a dismissed or blank-titled add dialog changes nothing', async () => {
  for (const values of [null, { title: '   ', notes: 'go' }]) {
    const app = fakeApp();
    const { handlers } = wire(app, { values });
    assert.equal(await handlers.onAdd(), null);
    assert.deepEqual(app.state.quests, []);
    assert.equal(app.dirty, 0);
  }
});

test('editing replaces the entry in place and trims its title', async () => {
  const app = fakeApp([
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
  ]);
  const { handlers, prompts } = wire(app, { values: { title: '  Bee  ', notes: 'noted' } });
  assert.equal(await handlers.onEdit(/** @type {any} */ (app.state.quests[1])), true);
  assert.deepEqual(app.state.quests, [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'Bee', notes: 'noted' },
  ]);
  assert.equal(app.dirty, 1);
  assert.equal(prompts[0].title, 'Edit quest');
  assert.equal(prompts[0].fields[0].value, 'B', 'the edit dialog is prefilled from the entry');
});

test('the edit dialog gets the spec edit options and keeps the entry id', async () => {
  const app = fakeApp([{ id: 'a', title: 'A' }]);
  const handlers = wireEntityList(/** @type {any} */ (app), {
    key: 'quests',
    noun: 'handout',
    fields: () => [],
    create: (id, title) => ({ id, title }),
    patch: (entry, title) => ({ ...entry, title }),
    editOptions: { submitLabel: 'Save' },
    prompt: async (title, fields, options) => {
      assert.deepEqual(options, { submitLabel: 'Save' });
      return { title: 'Renamed' };
    },
    confirm: async () => true,
  });
  assert.equal(await handlers.onEdit(/** @type {any} */ (app.state.quests[0])), true);
  assert.deepEqual(app.state.quests, [{ id: 'a', title: 'Renamed' }]);
});

test('a dismissed or blank-titled edit dialog leaves the entry alone', async () => {
  for (const values of [null, { title: '', notes: 'x' }]) {
    const app = fakeApp([{ id: 'a', title: 'A' }]);
    const { handlers } = wire(app, { values });
    assert.equal(await handlers.onEdit(/** @type {any} */ (app.state.quests[0])), false);
    assert.deepEqual(app.state.quests, [{ id: 'a', title: 'A' }]);
    assert.equal(app.dirty, 0);
  }
});

test('deleting confirms by title, then removes the entry', async () => {
  const app = fakeApp([
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
  ]);
  const { handlers, confirms } = wire(app);
  assert.equal(await handlers.onDelete('a'), true);
  assert.deepEqual(confirms, ['A']);
  assert.deepEqual(app.state.quests, [{ id: 'b', title: 'B' }]);
  assert.equal(app.dirty, 1);
});

test('a declined delete keeps the entry and leaves the campaign clean', async () => {
  const app = fakeApp([{ id: 'a', title: 'A' }]);
  const { handlers } = wire(app, { confirm: false });
  assert.equal(await handlers.onDelete('a'), false);
  assert.deepEqual(app.state.quests, [{ id: 'a', title: 'A' }]);
  assert.equal(app.dirty, 0);
});

test('deleting an id that is gone asks nothing and reports failure', async () => {
  const app = fakeApp([{ id: 'a', title: 'A' }]);
  const { handlers, confirms } = wire(app);
  assert.equal(await handlers.onDelete('missing'), false);
  assert.deepEqual(confirms, []);
  assert.equal(app.dirty, 0);
});

test('a list keyed on another title field slugs and confirms against it', async () => {
  const app = { state: { quests: [] }, actions: { markDirty: () => {} } };
  const handlers = wireEntityList(/** @type {any} */ (app), {
    key: 'quests',
    noun: 'feat',
    titleKey: 'name',
    fields: () => [{ name: 'name', label: 'Name' }],
    create: (id, title) => ({ id, name: title }),
    patch: (entry, title) => ({ ...entry, name: title }),
    prompt: async () => ({ name: 'Great Weapon Master' }),
    confirm: async (name) => {
      assert.equal(name, 'Great Weapon Master');
      return true;
    },
  });
  const created = await handlers.onAdd();
  assert.deepEqual(created, { id: 'great-weapon-master', name: 'Great Weapon Master' });
  assert.equal(await handlers.onDelete('great-weapon-master'), true);
  assert.deepEqual(app.state.quests, []);
});
