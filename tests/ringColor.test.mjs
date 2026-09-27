import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRingColorScale,
  getApproximateLifespan,
  getResidenceRegion,
} from '../src/utils/ringColor.ts';

const node = (key, personId, more = {}) => ({
  key, personId, kind: personId === null ? 'unknown' : 'person',
  name: personId ?? 'Okänd förälder', century: null,
  birthDate: '', deathDate: '', residences: [],
  ...more,
});

test('century mode maps historical sectors and missing dates to an explicit legend', () => {
  const scale = buildRingColorScale([
    node('1:0', 'A', { century: 1900 }),
    node('2:0', 'B', { century: 1800 }),
    node('2:1', 'C', { century: 1900 }),
    node('3:0', null),
  ], 'century');
  assert.equal(scale.assignments.get('1:0').categoryKey, 'century:1900');
  assert.equal(scale.assignments.get('3:0').known, false);
  assert.deepEqual(scale.legend.map(({ label, count }) => [label, count]), [
    ['1900-tal', 2], ['1800-tal', 1], ['Födelseårhundrade saknas', 1],
  ]);
  assert.equal(scale.assignments.get('1:0').palette.length, 3);
});

test('residence groups explicitly recorded Swedish places and ignores birthplace', () => {
  assert.equal(getResidenceRegion('Lund, Skåne, Sverige'), 'Skåne');
  assert.equal(getResidenceRegion('Malmö, Skåne län, Sweden'), 'Skåne');
  assert.equal(getResidenceRegion('Stockholms län, Sverige'), 'Stockholm');
  assert.equal(getResidenceRegion('Uppsala'), 'Uppsala');
  assert.equal(getResidenceRegion('Sverige'), null);

  const scale = buildRingColorScale([
    node('1:0', 'A', { birthPlace: 'Skåne', residences: [] }),
    node('2:0', 'B', { residences: [{ place: 'Lund, Skåne, Sverige' }] }),
    node('2:1', 'C', { residences: [{ place: 'Malmö, skåne, Sweden' }] }),
    node('3:0', 'D', { residences: [
      { place: 'Karlstad, Värmland, Sverige' },
      { place: 'Uppsala, Uppsala län, Sverige' },
    ] }),
  ], 'residence');
  assert.equal(scale.assignments.get('1:0').categoryKey, 'unknown');
  assert.equal(scale.assignments.get('2:0').categoryKey, 'residence:skåne');
  assert.equal(scale.assignments.get('2:1').categoryKey, 'residence:skåne');
  assert.equal(scale.assignments.get('3:0').categoryKey, 'residence:uppsala');
  assert.equal(scale.legend.find((item) => item.categoryKey === 'residence:skåne').count, 2);
});

test('birth-region mode uses birthplace and stays independent of RESI', () => {
  const nodes = [
    node('1:0', 'A', {
      birthPlace: 'Lund, Skåne, Sverige',
      residences: [{ place: 'Uppsala, Uppsala län, Sverige' }],
    }),
    node('2:0', 'B', { birthPlace: 'Malmö, Skåne län, Sverige' }),
    node('2:1', 'C', { residences: [{ place: 'Lund, Skåne, Sverige' }] }),
    node('3:0', null),
  ];
  const birth = buildRingColorScale(nodes, 'birthRegion');
  const residence = buildRingColorScale(nodes, 'residence');
  assert.equal(birth.assignments.get('1:0').categoryKey, 'birthRegion:skåne');
  assert.equal(birth.assignments.get('2:0').categoryKey, 'birthRegion:skåne');
  assert.equal(birth.assignments.get('2:1').categoryKey, 'unknown');
  assert.equal(birth.assignments.get('3:0').label, 'Födelseregion saknas');
  assert.equal(birth.legend.find((item) => item.categoryKey === 'birthRegion:skåne').count, 2);
  assert.equal(residence.assignments.get('1:0').categoryKey, 'residence:uppsala');
  assert.equal(residence.assignments.get('2:0').categoryKey, 'unknown');
});

test('lifespan is a conservative approximate year difference in five bins', () => {
  const ages = [29, 30, 50, 70, 90].map((age, index) =>
    node(`${index}`, `P${index}`, { birthDate: '1 JAN 1800', deathDate: `1 JAN ${1800 + age}` }));
  assert.deepEqual(ages.map(getApproximateLifespan), [29, 30, 50, 70, 90]);
  const scale = buildRingColorScale(ages, 'lifespan');
  assert.deepEqual(scale.legend.map((item) => item.label), [
    'Under 30 år', '30–49 år', '50–69 år', '70–89 år', '90 år eller mer',
  ]);
  assert.deepEqual([...scale.assignments.values()].map((item) => item.categoryKey), [
    'lifespan:under-30', 'lifespan:30-49', 'lifespan:50-69',
    'lifespan:70-89', 'lifespan:90-plus',
  ]);
});

test('lifespan rejects missing, ranged, qualified and impossible dates', () => {
  const invalid = [
    { birthDate: 'BET 1800 AND 1810', deathDate: '1880' },
    { birthDate: 'ABT 1800', deathDate: '1880' },
    { birthDate: '1800', deathDate: 'BEF 1880' },
    { birthDate: '1900', deathDate: '1899' },
    { birthDate: '1700', deathDate: '1830' },
    { birthDate: '999', deathDate: '1050' },
    { birthDate: '1900', deathDate: '' },
  ];
  assert.deepEqual(invalid.map(getApproximateLifespan), Array(invalid.length).fill(null));
  const scale = buildRingColorScale(invalid.map((item, index) =>
    node(`${index}`, `P${index}`, item)), 'lifespan');
  assert.deepEqual(scale.legend.map((item) => [item.label, item.count]), [['Livslängd saknas', 7]]);
});

test('overlap mode colors every occurrence of a repeated person identically', () => {
  const nodes = [
    node('1:0', 'A'), node('2:0', 'B'), node('2:1', 'C'),
    node('3:0', 'B'), node('3:2', 'B'), node('3:1', null),
  ];
  const scale = buildRingColorScale(nodes, 'overlap');
  const first = scale.assignments.get('2:0');
  assert.equal(first.categoryKey, 'overlap:person:B');
  assert.equal(scale.assignments.get('3:0').categoryKey, first.categoryKey);
  assert.equal(scale.assignments.get('3:2').categoryKey, first.categoryKey);
  assert.deepEqual(scale.assignments.get('3:0').palette, first.palette);
  assert.equal(scale.assignments.get('1:0').categoryKey, 'overlap:unique');
  assert.notDeepEqual(scale.assignments.get('1:0').palette, first.palette);
  assert.equal(scale.legend.find((item) => item.categoryKey === 'overlap:person:B').count, 3);
  assert.equal(scale.legend.find((item) => item.categoryKey === 'overlap:unique').count, 2);
  assert.equal(scale.assignments.get('3:1').known, false);

  const reversed = buildRingColorScale([...nodes].reverse(), 'overlap');
  assert.deepEqual(reversed.assignments.get('2:0').palette, first.palette);
});
