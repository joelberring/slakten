import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildGeoNamesReview, countPlaceUses, exactNameKey } from '../scripts/geonames-review-core.mjs';
import { runGeoNamesReview } from '../scripts/build-geonames-review.mjs';

function feature({ id, name, ascii = name, alternate = '', lat = 59.7, lon = 16.2,
  featureClass = 'P', featureCode = 'PPL', admin1 = '25', admin2 = '1907' }) {
  return [id, name, ascii, alternate, lat, lon, featureClass, featureCode, 'SE', '',
    admin1, admin2, '', '', '0', '', '-9999', 'Europe/Stockholm', '2026-01-01'].join('\t');
}

const geonames = [
  feature({ id: 1, name: 'Västmanland County', alternate: 'Västmanland,Västmanlands län',
    featureClass: 'A', featureCode: 'ADM1', admin2: '' }),
  feature({ id: 2, name: 'Surahammar Kommun', featureClass: 'A', featureCode: 'ADM2' }),
  feature({ id: 101, name: 'Ramnäs' }),
  feature({ id: 102, name: 'Ramnäs', lat: 56.5, lon: 13.9, admin1: '12', admin2: '0765' }),
  feature({ id: 103, name: 'Atorp', alternate: 'Åtorp' }),
  feature({ id: 104, name: 'Alkkula' }),
].join('\n');

const gedcom = {
  individuals: [
    { birthPlace: 'Ramnäs, Västmanland, Sverige', events: [
      { type: 'BIRT', place: 'Ramnäs, Västmanland, Sverige' },
      { type: 'RESI', place: 'Ramnäs, Västmanland, Sverige' },
      { type: 'DEAT', place: 'Åtorp, Västmanland, Sverige' },
      { type: 'RESI', place: 'Alkkula, Finland' },
      { type: 'RESI', place: 'Ramnä, Västmanland, Sverige' },
    ] },
  ],
  families: [{ marriagePlace: 'Ramnäs, Västmanland, Sverige', events: [
    { type: 'MARR', place: 'Ramnäs, Västmanland, Sverige' },
  ] }],
};

test('counts GEDCOM events once despite duplicate birth and marriage summary fields', () => {
  assert.equal(countPlaceUses(gedcom).get('Ramnäs, Västmanland, Sverige'), 3);
  const summariesOnly = countPlaceUses({
    individuals: [{ birthPlace: 'Födelseort', deathPlace: 'Dödsort' }],
    families: [{ marriagePlace: 'Vigselort' }],
  });
  assert.deepEqual([...summariesOnly].sort(), [['Dödsort', 1], ['Födelseort', 1], ['Vigselort', 1]]);
  assert.equal(exactNameKey('  RAMNÄS  '), exactNameKey('Ramnäs'));
  assert.notEqual(exactNameKey('Ramnas'), exactNameKey('Ramnäs'));
});

test('creates exact-name review candidates with region, IDs, ambiguity and country mismatch', () => {
  const result = buildGeoNamesReview({
    gedcom,
    catalogRows: [['Stockholm', { lat: 59.3, lon: 18 }]],
    geonamesText: geonames,
    admin1Text: 'SE.25\tVästmanland County\tVastmanland County\t1\n',
  });
  assert.equal(result.summary.unresolvedPlaces, 4);
  assert.equal(result.summary.placesWithCandidates, 3);
  assert.equal(result.summary.countryMismatchesWithCandidates, 1);
  assert.equal(result.places[0].place, 'Ramnäs, Västmanland, Sverige');
  assert.equal(result.places[0].eventUses, 3);
  assert.equal(result.places[0].ambiguityCount, 2);
  assert.deepEqual(result.places[0].candidates.map((candidate) => candidate.sourceId),
    ['geonames:101', 'geonames:102']);
  assert.equal(result.places[0].candidates[0].contextMatches, 1);
  assert.deepEqual(result.places[0].candidates[0].unmatchedContext, []);
  assert.deepEqual(result.places[0].candidates[1].unmatchedContext, ['Västmanland']);
  assert.equal(result.places[0].candidates[0].admin1.name, 'Västmanland County');
  assert.match(result.places[0].candidates[0].label, /Ramnäs.*Surahammar Kommun.*Västmanland County.*Sverige/);
  assert.deepEqual(result.places[0].candidates[0].coordinates, { lat: 59.7, lon: 16.2 });
  const alternate = result.places.find((row) => row.place.startsWith('Åtorp'));
  assert.deepEqual(alternate.candidates[0].matchedName, { field: 'alternateName', value: 'Åtorp' });
  const wrongCountry = result.places.find((row) => row.place === 'Alkkula, Finland');
  assert.equal(wrongCountry.countryMismatch, true);
  assert.deepEqual(wrongCountry.countryHints, ['FI']);
  assert.equal(wrongCountry.candidates[0].countryCode, 'SE');
  assert.equal(result.places.find((row) => row.place.startsWith('Ramnä,')).ambiguityCount, 0);
});

test('CLI writes only private review output and never changes the shared catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slakten-geonames-test-'));
  const paths = Object.fromEntries(['gedcom', 'catalog', 'geonames', 'admin1', 'review']
    .map((name) => [name, join(directory, `${name}.txt`)]));
  try {
    const inputGedcom = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI', '1 NAME Test /Person/',
      '1 BIRT', '2 PLAC Ramnäs, Västmanland, Sverige',
      '0 TRLR', '',
    ].join('\n');
    const originalCatalog = JSON.stringify([['Ramnäs, Västmanland, Sverige', null]]);
    await Promise.all([
      writeFile(paths.gedcom, inputGedcom),
      writeFile(paths.catalog, originalCatalog),
      writeFile(paths.geonames, geonames),
      writeFile(paths.admin1, 'SE.25\tVästmanland County\tVastmanland County\t1\n'),
    ]);
    let log = '';
    const args = ['--gedcom', paths.gedcom, '--catalog', paths.catalog,
      '--geonames', paths.geonames, '--admin1', paths.admin1, '--output', paths.review];
    const result = await runGeoNamesReview(args, { write(chunk) { log += chunk; } });
    assert.equal(result.summary.placesWithCandidates, 1);
    assert.equal(JSON.parse(await readFile(paths.review, 'utf8')).places[0].ambiguityCount, 2);
    assert.equal(await readFile(paths.catalog, 'utf8'), originalCatalog);
    assert.doesNotMatch(log, /Ramnäs|Västmanland|Test Person/);
    await assert.rejects(runGeoNamesReview(args), { code: 'EEXIST' });
    await assert.rejects(runGeoNamesReview(args.slice(0, -1).concat('public/locations.json')),
      /Granskningsfilen får inte skrivas i webbprojektet/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
