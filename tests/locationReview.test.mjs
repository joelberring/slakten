import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocationReviewRows, collectPlaceUses } from '../src/utils/locationReview.ts';

function byPlace(rows, place) {
  const row = rows.find(candidate => candidate.place === place);
  assert.ok(row, `Missing review row for ${place}`);
  return row;
}

function flagCodes(row) {
  return row.flags.map(flag => flag.code);
}

test('place use counts include real events but not their duplicated summary fields', () => {
  const uses = collectPlaceUses([
    {
      birthPlace: 'Smedberget, Sverige',
      deathPlace: 'Lindesberg, Sverige',
      events: [
        { type: 'BIRT', place: 'Smedberget, Sverige' },
        { type: 'RESI', place: 'Smedberget, Sverige' },
        { type: 'DEAT', place: 'Lindesberg, Sverige' },
      ],
    },
    { birthPlace: 'Smedberget, Sverige', deathPlace: '  ', events: [] },
    { birthPlace: 'A, Sverige', events: [{ type: 'BIRT', place: 'B, Sverige' }] },
  ], [
    {
      marriagePlace: 'Lindesberg, Sverige',
      events: [{ type: 'MARR', place: 'Lindesberg, Sverige' }, { type: 'DIV', place: 'Lindesberg, Sverige' }],
    },
  ]);

  assert.deepEqual(uses, [
    { place: 'A, Sverige', uses: 1 },
    { place: 'B, Sverige', uses: 1 },
    { place: 'Lindesberg, Sverige', uses: 3 },
    { place: 'Smedberget, Sverige', uses: 3 },
  ]);
});

test('different first localities at one exact coordinate become review suggestions', () => {
  const same = { lat: 59.8, lon: 15.2 };
  const names = [
    'L Smedberget, Ljusnarsberg, Sverige',
    'Ljusnarsberg, Sverige',
    'L Smedberget, Örebro, Sverige',
  ];
  const rows = buildLocationReviewRows(
    names.map(place => ({ place, uses: 1 })),
    new Map(names.map(place => [place, same])),
    new Map(names.map(place => [place, 'shared'])),
  );

  const first = byPlace(rows, names[0]);
  const second = byPlace(rows, names[1]);
  const third = byPlace(rows, names[2]);
  assert.ok(flagCodes(first).includes('identical-coordinate-different-locality'));
  assert.ok(flagCodes(second).includes('identical-coordinate-different-locality'));
  assert.ok(flagCodes(third).includes('identical-coordinate-different-locality'));
  assert.deepEqual(first.flags.find(flag => flag.code === 'identical-coordinate-different-locality').relatedPlaces,
    [names[1]]);
  assert.deepEqual(second.flags.find(flag => flag.code === 'identical-coordinate-different-locality').relatedCount, 2);
  assert.equal(first.priority, 2);
});

test('explicit country mismatch only flags conspicuously distant coordinates', () => {
  const uses = [
    { place: 'Storvik, Sverige', uses: 4 },
    { place: 'Storvik', uses: 3 },
    { place: 'Rödeby, Sverige', uses: 2 },
    { place: 'Kiruna, Sverige', uses: 1 },
  ];
  const rows = buildLocationReviewRows(uses, new Map([
    ['Storvik, Sverige', { lat: 40.7, lon: -74 }],
    ['Storvik', { lat: 40.7, lon: -74 }],
    ['Rödeby, Sverige', { lat: 55.7, lon: 13.5 }],
    ['Kiruna, Sverige', { lat: 69, lon: 20 }],
  ]), new Map(uses.map(entry => [entry.place, 'shared'])));

  assert.ok(flagCodes(byPlace(rows, 'Storvik, Sverige')).includes('far-from-explicit-country'));
  assert.ok(!flagCodes(byPlace(rows, 'Storvik')).includes('far-from-explicit-country'));
  assert.deepEqual(flagCodes(byPlace(rows, 'Rödeby, Sverige')), []);
  assert.deepEqual(flagCodes(byPlace(rows, 'Kiruna, Sverige')), []);
  assert.equal(rows[0].place, 'Storvik, Sverige');
});

test('a country-name match abroad and contradictory country labels are review prompts', () => {
  const uses = [
    { place: 'Belgium', uses: 1 },
    { place: 'Näs, Suède, France', uses: 1 },
  ];
  const rows = buildLocationReviewRows(uses, new Map([
    ['Belgium', { lat: 40, lon: -87 }],
    ['Näs, Suède, France', { lat: 48.6, lon: 2.6 }],
  ]), new Map(uses.map(entry => [entry.place, 'legacy'])));
  assert.ok(flagCodes(byPlace(rows, 'Belgium')).includes('far-from-explicit-country'));
  assert.ok(flagCodes(byPlace(rows, 'Näs, Suède, France')).includes('conflicting-country-labels'));
  assert.equal(byPlace(rows, 'Näs, Suède, France').priority, 1);
});

test('missing, legacy, manual and malformed coordinates remain distinguishable without claiming certainty', () => {
  const rows = buildLocationReviewRows([
    { place: 'Manual', uses: 2 },
    { place: 'Legacy', uses: 2 },
    { place: 'Missing', uses: 8 },
    { place: 'Broken', uses: 1 },
  ], new Map([
    ['Manual', { lat: 60, lon: 18 }],
    ['Legacy', { lat: 61, lon: 19 }],
    ['Missing', null],
    ['Broken', { lat: 120, lon: 0 }],
  ]), new Map([
    ['Manual', 'manual'],
    ['Legacy', 'legacy'],
    ['Missing', 'missing'],
    ['Broken', 'shared'],
  ]));

  assert.deepEqual(flagCodes(byPlace(rows, 'Manual')), []);
  assert.deepEqual(flagCodes(byPlace(rows, 'Legacy')), ['legacy-unreviewed']);
  assert.deepEqual(flagCodes(byPlace(rows, 'Missing')), ['missing-coordinate']);
  assert.deepEqual(flagCodes(byPlace(rows, 'Broken')), ['invalid-coordinate']);
  assert.equal(byPlace(rows, 'Broken').coordinates, null);
  assert.deepEqual(rows.map(row => row.place), ['Broken', 'Legacy', 'Missing', 'Manual']);
});

test('external audit notes match exact shared names and stop applying after a local correction', () => {
  const uses = [
    { place: 'Old farm, Sverige', uses: 2 },
    { place: 'Old farm', uses: 1 },
  ];
  const coordinates = new Map(uses.map(entry => [entry.place, { lat: 60, lon: 18 }]));
  const audit = new Map([['Old farm, Sverige', ['Historisk ort med tvetydig geokodning – granska']]]);
  const shared = buildLocationReviewRows(uses, coordinates, new Map(uses.map(entry => [entry.place, 'shared'])), audit);
  assert.ok(flagCodes(byPlace(shared, 'Old farm, Sverige')).includes('predefined-shared-review'));
  assert.ok(!flagCodes(byPlace(shared, 'Old farm')).includes('predefined-shared-review'));

  const corrected = buildLocationReviewRows(uses, coordinates, new Map([
    ['Old farm, Sverige', 'manual'],
    ['Old farm', 'shared'],
  ]), audit);
  assert.ok(!flagCodes(byPlace(corrected, 'Old farm, Sverige')).includes('predefined-shared-review'));
});

test('a removed bad shared point remains a high-priority review item until locally corrected', () => {
  const place = 'Linneryd (Smalland), Sweden';
  const uses = [{ place, uses: 1 }];
  const audit = new Map([[place, ['Tidigare landspunkt bortvald']]]);
  const missing = buildLocationReviewRows(uses, new Map([[place, null]]), new Map([[place, 'missing']]), audit);
  assert.deepEqual(flagCodes(missing[0]), ['predefined-shared-review', 'missing-coordinate']);
  assert.equal(missing[0].priority, 0);
  const corrected = buildLocationReviewRows(uses, new Map([[place, { lat: 56.6, lon: 15.1 }]]),
    new Map([[place, 'manual']]), audit);
  assert.ok(!flagCodes(corrected[0]).includes('predefined-shared-review'));
});
