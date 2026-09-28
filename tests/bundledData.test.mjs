import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseGedcomData } from '../src/utils/gedcomParser.ts';
import { buildDataReview } from '../src/utils/dataReview.ts';
import { collectGedcomPlaces, readCatalogRows } from '../scripts/location-cache-core.mjs';

const gedcom = readFileSync(new URL('../public/berring_messing-cleaned.ged', import.meta.url), 'utf8');
const rootMirror = readFileSync(new URL('../Berring_Messings Släktträd-cleaned.ged', import.meta.url), 'utf8');
const { individuals, families } = parseGedcomData(gedcom);
const catalog = readCatalogRows(JSON.parse(readFileSync(new URL('../public/locations.json', import.meta.url), 'utf8')));

test('the bundled GEDCOM copies agree and all family people exist', () => {
  assert.equal(gedcom, rootMirror);
  assert.equal(individuals.length, 2379);
  assert.equal(families.length, 1340);
  const people = new Set(individuals.map(person => person.id));
  assert.equal(people.size, individuals.length);
  assert.equal(new Set(families.map(family => family.id)).size, families.length);
  for (const family of families) {
    for (const id of [family.husb, family.wife, ...family.children]) {
      if (id) assert.ok(people.has(id), `${family.id} points to absent person ${id}`);
    }
  }
  const relationships = families.map(family => JSON.stringify([
    family.husb ?? null, family.wife ?? null, [...family.children].sort(),
  ]));
  assert.equal(new Set(relationships).size, relationships.length);
});

test('the two confirmed people are merged without hiding uncertain candidates', () => {
  const people = new Set(individuals.map(person => person.id));
  assert.ok(people.has('@I262744864953@'));
  assert.ok(people.has('@I262744714665@'));
  assert.equal(people.has('@I262744865581@'), false);
  assert.equal(people.has('@I262744889570@'), false);
  assert.match(gedcom, /Sammanförd med ursprunglig personpost @I262744865581@/);
  assert.match(gedcom, /Sammanförd med ursprunglig personpost @I262744889570@/);
  const suggestions = buildDataReview(individuals).duplicateSuggestions;
  assert.deepEqual(suggestions.map(group => group.name), [
    'Clara Hammarbäck', 'Karin Ersdotter', 'Karin Matsdotter', 'Mats Matsson', 'Walba Larsdotter Hansas',
  ]);
});

test('the shared place catalog covers each exact GEDCOM string and preserves reviewed points', () => {
  const places = collectGedcomPlaces({ individuals, families });
  for (const place of places) assert.ok(catalog.has(place), `Missing catalog entry: ${place}`);
  assert.ok(places.filter(place => catalog.get(place)).length >= 2550);
  assert.deepEqual(catalog.get('Alt-Schwedendorf, Kherson, Kherson, Russia'),
    { lat: 46.8586525, lon: 33.5646464 });
  assert.deepEqual(catalog.get('Hiiumaa (Dagö), Estonia'), { lat: 58.89608, lon: 22.64856 });
  assert.equal(catalog.get('Gammalsvenskby, Gotland, Sverige'), null);
});

test('approximate location metadata only labels actual shared points', () => {
  const precision = JSON.parse(readFileSync(new URL('../public/location-precision.json', import.meta.url), 'utf8'));
  const seen = new Set();
  for (const row of precision) {
    assert.equal(row.length, 2);
    const [place, value] = row;
    assert.equal(value, 'approximate');
    assert.equal(seen.has(place), false, `Repeated precision entry: ${place}`);
    seen.add(place);
    assert.ok(catalog.get(place), `Approximate label without a shared point: ${place}`);
  }
  assert.ok(seen.has('Hiiumaa (Dagö), Estonia'));
  assert.ok(seen.has('Skogsryd backagård Linneryd, Kronoberg, Sverige'));
  assert.equal(seen.has('Gammalsvenskby, Gotland, Sverige'), false);
});
