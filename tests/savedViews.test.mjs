import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { deleteSavedView, readSavedViews, renameSavedView, saveView } from '../src/utils/savedViews.ts';

const entries = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
  },
};

beforeEach(() => entries.clear());

const ring = {
  rootPersonId: 'I1',
  generations: 14,
  colorMode: 'residence',
  zoom: 2.5,
  pan: { x: 38, y: -12 },
  visible: { dates: true, residence: true, children: false, partners: false, places: true },
  parentFamilyChoices: { I1: 'F3' },
};

test('saved view round trips presentation state and can be renamed or deleted', () => {
  const saved = saveView('gedcom-a', '  Mormors anor  ', {
    viewMode: 'rings', personId: 'I1', branchMode: 'ancestors', ring,
  }, 'Mormor');
  assert.ok(saved);
  assert.equal(saved.name, 'Mormors anor');
  assert.deepEqual(readSavedViews('gedcom-a')[0].ring, ring);
  assert.equal(renameSavedView('gedcom-a', saved.id, 'Nytt namn'), true);
  assert.equal(readSavedViews('gedcom-a')[0].name, 'Nytt namn');
  assert.equal(deleteSavedView('gedcom-a', saved.id), true);
  assert.deepEqual(readSavedViews('gedcom-a'), []);
});

test('GEDCOM datasets stay separate and malformed local data is ignored', () => {
  saveView('gedcom-a', 'A', { viewMode: 'tree', personId: 'I1', branchMode: 'all' }, 'A');
  saveView('gedcom-b', 'B', { viewMode: 'review', personId: null, branchMode: 'all' }, null);
  assert.equal(readSavedViews('gedcom-a')[0].name, 'A');
  assert.equal(readSavedViews('gedcom-b')[0].name, 'B');

  entries.set('slakten_saved_views_v1:gedcom-a', JSON.stringify({
    version: 1,
    items: [{ id: 'bad', name: '<script>', datasetKey: 'gedcom-a', savedAt: 'bad', viewMode: 'rings' }],
  }));
  assert.deepEqual(readSavedViews('gedcom-a'), []);
  assert.equal(readSavedViews('gedcom-b')[0].name, 'B');
});

test('storage limit does not silently discard an older view', () => {
  for (let index = 0; index < 30; index += 1) {
    assert.ok(saveView('gedcom-a', `Vy ${index}`, {
      viewMode: 'map', personId: null, branchMode: 'all',
    }, null));
  }
  assert.equal(saveView('gedcom-a', '31', {
    viewMode: 'map', personId: null, branchMode: 'all',
  }, null), null);
  assert.equal(readSavedViews('gedcom-a').length, 30);
});
