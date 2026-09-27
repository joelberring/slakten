import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeCoverage, buildLocationCatalog, collectGedcomPlaces, normalizePlace, readCatalogRows } from '../scripts/location-cache-core.mjs';
import { runLocationCache } from '../scripts/build-location-cache.mjs';

const stockholm = { lat: 59.325, lon: 18.071 };
const parish = { lat: 58.1, lon: 14.2 };

test('collects each geocodable GEDCOM place exactly once', () => {
  const result = collectGedcomPlaces({
    individuals: [{ birthPlace: 'Stockholm', deathPlace: 'Stockholm', events: [{ place: 'Lund' }, { place: '' }] }],
    families: [{ marriagePlace: 'Göteborg', events: [{ place: 'Lund' }] }],
  });
  assert.deepEqual(result, ['Göteborg', 'Lund', 'Stockholm']);
});

test('merges reviewed coordinates deterministically and keeps unresolved places explicit', () => {
  const result = buildLocationCatalog(
    ['Nya orten', 'Stockholm', 'Saknad', 'Stockholm'],
    [['Stockholm', stockholm], ['Nya orten', null], ['Äldre ort', parish]],
    [['Nya orten', parish], ['Saknad', null]],
  );
  assert.deepEqual(result.rows, [
    ['Nya orten', parish], ['Saknad', null], ['Stockholm', stockholm], ['Äldre ort', parish],
  ]);
  assert.deepEqual(result.stats, { gedcomPlaces: 3, resolved: 2, unresolved: 1, catalogEntries: 4, ignoredImported: 0 });
});

test('does not publish place names imported from a private uploaded GEDCOM', () => {
  const result = buildLocationCatalog(
    ['Stockholm', 'Saknad'],
    [['Stockholm', stockholm], ['Äldre offentlig ort', null]],
    [['Saknad', parish], ['Äldre offentlig ort', parish], ['Privat adress', { lat: 60, lon: 17 }]],
  );
  assert.equal(result.rows.some(([place]) => place === 'Privat adress'), false);
  assert.deepEqual(result.rows, [
    ['Saknad', parish], ['Stockholm', stockholm], ['Äldre offentlig ort', parish],
  ]);
  assert.deepEqual(result.stats, { gedcomPlaces: 2, resolved: 2, unresolved: 0, catalogEntries: 3, ignoredImported: 1 });
});

test('never silently replaces a reviewed coordinate or accepts malformed data', () => {
  assert.throws(() => buildLocationCatalog(['Stockholm'], [['Stockholm', stockholm]], [['Stockholm', parish]]), /krockar/);
  assert.throws(() => readCatalogRows([['Ort', stockholm], ['Ort', stockholm]]), /dubbla/);
  assert.throws(() => readCatalogRows([['Ort', { lat: 91, lon: 15 }]]), /ogiltiga koordinater/);
  assert.throws(() => readCatalogRows([['Ort', { lat: Number.NaN, lon: 15 }]]), /ogiltiga koordinater/);
});

test('reports conservative normalized matches and approximate suffix candidates separately', () => {
  const catalog = [
    ['Stockholm, Sweden', stockholm],
    ['Gränna (F), Småland', parish],
    ['Parish, County', parish],
  ];
  const places = [
    'Stockholm, Sweden',
    '  STOCKHOLM,  Sweden ',
    'Gränna, Småland',
    'Hamlet, Parish, County',
    'Unknown',
  ];
  assert.equal(normalizePlace(' Gränna (F),   Småland '), 'gränna, småland');
  assert.deepEqual(analyzeCoverage(places, catalog), {
    exact: 1, normalized: 2, suffixCandidate: 1, ambiguous: 0, unresolved: 1,
  });
  // An approximate parent-place candidate must not become a point in the catalog.
  assert.deepEqual(buildLocationCatalog(places, catalog).rows.find(([place]) => place === 'Hamlet, Parish, County'),
    ['Hamlet, Parish, County', null]);
});

test('flags conflicting normalized coordinates as ambiguous', () => {
  const catalog = [
    ['Town (AB), Sweden', stockholm],
    ['town, sweden', parish],
  ];
  assert.deepEqual(analyzeCoverage(['Town, Sweden'], catalog), {
    exact: 0, normalized: 0, suffixCandidate: 0, ambiguous: 1, unresolved: 0,
  });
});

test('CLI only writes on explicit output and logs aggregate counts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'slakten-locations-test-'));
  const gedcom = join(dir, 'sample.ged');
  const existing = join(dir, 'existing.json');
  const imported = join(dir, 'imported.json');
  const output = join(dir, 'out.json');
  try {
    await writeFile(gedcom, [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Test /Person/',
      '1 BIRT',
      '2 PLAC Stockholm',
      '1 RESI',
      '2 PLAC Hemligtorp',
      '0 TRLR',
      '',
    ].join('\n'));
    await writeFile(existing, JSON.stringify([['Stockholm', stockholm]]));
    await writeFile(imported, JSON.stringify([['Hemligtorp', parish], ['Privat adress', parish]]));
    let log = '';
    const writer = { write(value) { log += value; } };
    const first = await runLocationCache(['--gedcom', gedcom, '--existing', existing], writer);
    assert.equal(first.stats.resolved, 1);
    await assert.rejects(readFile(output, 'utf8'));
    const second = await runLocationCache(['--gedcom', gedcom, '--existing', existing, '--import', imported, '--output', output], writer);
    assert.equal(second.stats.resolved, 2);
    assert.equal(second.stats.ignoredImported, 1);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), [['Hemligtorp', parish], ['Stockholm', stockholm]]);
    assert.doesNotMatch(log, /Stockholm|Hemligtorp|Privat adress|Test Person/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
