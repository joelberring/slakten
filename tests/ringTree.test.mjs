import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRingTree, getBirthCentury } from '../src/utils/ringTree.ts';

const person = (id, more = {}) => ({ id, name: id, ...more });
const family = (id, child, husb, wife) => ({
  id, children: [child], husb, wife,
});

test('fixed ancestor slots preserve father and mother sides in every generation', () => {
  const individuals = ['A', 'F', 'M', 'FF', 'FM', 'MF', 'MM'].map((id) => person(id));
  const families = [
    family('parents', 'A', 'F', 'M'),
    family('father-parents', 'F', 'FF', 'FM'),
    family('mother-parents', 'M', 'MF', 'MM'),
  ];
  const result = buildRingTree(individuals, families, 'A', 3);

  assert.equal(result.requestedGenerations, 3);
  assert.equal(result.renderedGenerations, 3);
  assert.equal(result.uniquePeopleCount, 7);
  assert.deepEqual(result.nodes.map((node) => [node.generation, node.slot, node.personId]), [
    [1, 0, 'A'],
    [2, 0, 'F'], [2, 1, 'M'],
    [3, 0, 'FF'], [3, 1, 'FM'], [3, 2, 'MF'], [3, 3, 'MM'],
  ]);
  assert.deepEqual(result.nodes.map((node) => [node.startAngle, node.endAngle]), [
    [-90, 270], [-90, 90], [90, 270],
    [-90, 0], [0, 90], [90, 180], [180, 270],
  ]);
  assert.deepEqual(result.nodes.slice(1).map((node) => node.relation), [
    'father', 'mother', 'father', 'mother', 'father', 'mother',
  ]);
});

test('missing parents occupy their slot once and do not grow phantom branches', () => {
  const result = buildRingTree(
    [person('A'), person('F')],
    [family('a-parents', 'A', 'F', null)],
    'A', 8,
  );
  assert.deepEqual(result.nodes.map((node) => [node.key, node.kind, node.personId]), [
    ['1:0', 'person', 'A'],
    ['2:0', 'person', 'F'],
    ['2:1', 'unknown', null],
    ['3:0', 'unknown', null],
    ['3:1', 'unknown', null],
  ]);
  assert.equal(result.renderedGenerations, 3);
  assert.equal(result.truncated, false);
});

test('pedigree collapse keeps repeated people in each path and expands both noncyclic paths', () => {
  const individuals = ['A', 'F', 'M', 'Shared', 'FM', 'MM', 'GreatF', 'GreatM']
    .map((id) => person(id));
  const families = [
    family('a', 'A', 'F', 'M'),
    family('b', 'F', 'Shared', 'FM'),
    family('c', 'M', 'Shared', 'MM'),
    family('d', 'Shared', 'GreatF', 'GreatM'),
  ];
  const result = buildRingTree(individuals, families, 'A', 4);
  const shared = result.nodes.filter((node) => node.personId === 'Shared');
  const greatF = result.nodes.filter((node) => node.personId === 'GreatF');
  assert.deepEqual(shared.map((node) => [node.slot, node.repeated]), [[0, false], [2, true]]);
  assert.deepEqual(greatF.map((node) => node.slot), [0, 4]);
  assert.equal(result.uniquePeopleCount, 8);
});

test('a parent cycle is marked and stops along that path', () => {
  const result = buildRingTree(
    [person('A'), person('B')],
    [family('a', 'A', 'B', null), family('b', 'B', 'A', null)],
    'A', 12,
  );
  const cycle = result.nodes.find((node) => node.personId === 'A' && node.generation > 1);
  assert.equal(cycle?.kind, 'cycle');
  assert.equal(cycle?.repeated, true);
  assert.equal(cycle?.hasMore, false);
  assert.equal(result.nodes.length, 5);
});

test('bounded node budget marks omitted branches without exceeding the cap', () => {
  const result = buildRingTree(
    [person('A'), person('F'), person('M')],
    [family('a', 'A', 'F', 'M')],
    'A', 12, { maxNodes: 3 },
  );
  assert.equal(result.nodes.length, 3);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.nodes.map((node) => node.personId), ['A', 'F', 'M']);
  assert.equal(result.nodes[1].hasMore, true);
  assert.equal(result.nodes[2].hasMore, true);
});

test('person details expose residence, partner and children without changing ring geometry', () => {
  const individuals = [
    person('A', {
      birthDate: '14 JUN 1890', birthPlace: 'Göteborg', deathDate: '1960',
      events: [{ type: 'RESI', date: '1910', place: 'Lund' }, { type: 'OCCU', place: 'Skåne' }],
    }),
    person('P'), person('C'), person('F'), person('M'), person('OtherF'),
  ];
  const families = [
    { id: 'z-child', husb: 'A', wife: 'P', children: ['C'] },
    family('a-parent', 'A', 'F', 'M'),
    family('z-parent', 'A', 'OtherF', null),
  ];
  const result = buildRingTree(individuals, families, 'A', 3);
  const root = result.nodes[0];
  assert.deepEqual(root.residences, [{ date: '1910', place: 'Lund' }]);
  assert.deepEqual(root.children, [{ id: 'C', name: 'C' }]);
  assert.deepEqual(root.partners, [{ id: 'P', name: 'P' }]);
  assert.equal(root.birthPlace, 'Göteborg');
  assert.equal(root.century, 1800);
  assert.equal(root.alternateParentFamilies, 1);
  assert.equal(result.nodes[1].personId, 'F');
});

test('duplicate FAM records for the same ordered parents make one selectable parent set', () => {
  const individuals = ['A', 'F', 'M', 'X', 'Y'].map((id) => person(id));
  const families = [
    family('a-original', 'A', 'F', 'M'),
    family('b-duplicate', 'A', 'F', 'M'),
    family('c-alternative', 'A', 'X', 'Y'),
  ];
  const defaultChart = buildRingTree(individuals, families, 'A', 3);
  const root = defaultChart.nodes[0];
  assert.deepEqual(root.parentChoices, [
    { familyId: 'a-original', father: { id: 'F', name: 'F' }, mother: { id: 'M', name: 'M' } },
    { familyId: 'c-alternative', father: { id: 'X', name: 'X' }, mother: { id: 'Y', name: 'Y' } },
  ]);
  assert.equal(root.selectedParentFamilyId, 'a-original');
  assert.equal(root.alternateParentFamilies, 1);
  assert.deepEqual(defaultChart.nodes.slice(1, 3).map((node) => node.personId), ['F', 'M']);

  // An override naming a duplicate FAM still resolves to its visible parent set.
  const alias = buildRingTree(individuals, families, 'A', 3, {
    parentFamilyChoices: { A: 'b-duplicate' },
  });
  assert.equal(alias.nodes[0].selectedParentFamilyId, 'a-original');
  assert.deepEqual(alias.nodes.slice(1, 3).map((node) => node.personId), ['F', 'M']);
  const invalid = buildRingTree(individuals, families, 'A', 3, {
    parentFamilyChoices: { A: 'not-a-family' },
  });
  assert.equal(invalid.nodes[0].selectedParentFamilyId, 'a-original');
});

test('choosing a different parent set changes outer rings through the generation limit', () => {
  const individuals = ['A', 'F', 'M', 'X', 'Y', 'XF', 'XM', 'XFF', 'XFM', 'OlderF']
    .map((id) => person(id));
  const families = [
    family('a-default', 'A', 'F', 'M'),
    family('b-choice', 'A', 'X', 'Y'),
    family('c-x', 'X', 'XF', 'XM'),
    family('d-xf', 'XF', 'XFF', 'XFM'),
    family('e-xff', 'XFF', 'OlderF', null),
  ];
  const standard = buildRingTree(individuals, families, 'A', 4);
  assert.equal(standard.nodes.some((node) => node.personId === 'XFF'), false);

  const selected = buildRingTree(individuals, families, 'A', 4, {
    parentFamilyChoices: { A: 'b-choice' },
  });
  assert.equal(selected.nodes[0].selectedParentFamilyId, 'b-choice');
  assert.deepEqual(selected.nodes.slice(1, 3).map((node) => node.personId), ['X', 'Y']);
  assert.equal(selected.nodes.find((node) => node.personId === 'XF')?.generation, 3);
  const olderBranch = selected.nodes.find((node) => node.personId === 'XFF');
  assert.equal(olderBranch?.generation, 4);
  assert.equal(olderBranch?.hasMore, true);
  assert.equal(selected.truncated, false);
});

test('birth-century classification refuses ranges and qualifiers that cross centuries', () => {
  assert.equal(getBirthCentury('14 JUN 1682'), 1600);
  assert.equal(getBirthCentury('BET 1650 AND 1660'), 1600);
  assert.equal(getBirthCentury('BET 1890 AND 1910'), null);
  assert.equal(getBirthCentury('BEF 1900'), null);
  assert.equal(getBirthCentury('AFT 1900'), null);
  assert.equal(getBirthCentury('ABT 1890'), 1800);
  assert.equal(getBirthCentury('ABT 1898'), null);
  assert.equal(getBirthCentury('999'), null);
  assert.equal(getBirthCentury('2100'), null);
  assert.equal(getBirthCentury(''), null);
});

test('invalid roots and generation limits are handled deterministically', () => {
  const individuals = [person('A')];
  const missing = buildRingTree(individuals, [], 'X', 2);
  assert.deepEqual(missing.nodes, []);
  assert.equal(missing.requestedGenerations, 3);

  const result = buildRingTree(individuals, [], 'A', 99);
  assert.equal(result.requestedGenerations, 24);
  assert.deepEqual(result.nodes.map((node) => node.kind), ['person', 'unknown', 'unknown']);
});

test('a sparse twenty-generation known chain stays visible below the node budget', () => {
  const individuals = Array.from({ length: 20 }, (_, index) => person(`P${index + 1}`));
  const families = Array.from({ length: 19 }, (_, index) =>
    family(`F${index + 1}`, `P${index + 1}`, `P${index + 2}`, null));
  const result = buildRingTree(individuals, families, 'P1', 24);

  assert.equal(result.requestedGenerations, 24);
  assert.equal(result.uniquePeopleCount, 20);
  assert.equal(result.nodes.filter((node) => node.personId !== null).length, 20);
  assert.equal(Math.max(...result.nodes.filter((node) => node.personId !== null).map((node) => node.generation)), 20);
  assert.equal(result.renderedGenerations, 21); // The final known person has two unknown-parent sectors.
  assert.equal(result.nodes.length, 41);
  assert.equal(result.truncated, false);
  assert.ok(result.nodes.every((node) => Number.isFinite(node.startAngle) && Number.isFinite(node.endAngle)));

  const limited = buildRingTree(individuals, families, 'P1', 19);
  assert.equal(limited.nodes.find((node) => node.personId === 'P19')?.hasMore, true);
  assert.equal(limited.truncated, false); // A chosen generation limit is distinct from the safety cap.
});

test('requesting twenty-four generations never exceeds the 4095-node budget', () => {
  const individuals = Array.from({ length: 8191 }, (_, index) => person(String(index + 1)));
  const families = Array.from({ length: 4095 }, (_, index) => {
    const child = index + 1;
    return family(`f-${child}`, String(child), String(child * 2), String(child * 2 + 1));
  });
  const result = buildRingTree(individuals, families, '1', 24, { maxNodes: 10000 });

  assert.equal(result.requestedGenerations, 24);
  assert.equal(result.nodes.length, 4095);
  assert.equal(result.renderedGenerations, 12);
  assert.equal(result.truncated, true);
  assert.ok(result.nodes.some((node) => node.generation === 12 && node.hasMore));
  assert.ok(result.nodes.every((node) => Number.isFinite(node.startAngle) && Number.isFinite(node.endAngle)));
});

test('twelve complete generations fit the safety cap with finite arc positions', () => {
  const individuals = Array.from({ length: 4095 }, (_, index) => person(String(index + 1)));
  const families = Array.from({ length: 2047 }, (_, index) => {
    const child = index + 1;
    return family(`f-${child}`, String(child), String(child * 2), String(child * 2 + 1));
  });
  const result = buildRingTree(individuals, families, '1', 12);
  assert.equal(result.nodes.length, 4095);
  assert.equal(result.renderedGenerations, 12);
  assert.equal(result.uniquePeopleCount, 4095);
  assert.equal(result.truncated, false);
  assert.equal(result.nodes.at(-1).generation, 12);
  assert.ok(result.nodes.every((node) => Number.isFinite(node.startAngle) && Number.isFinite(node.endAngle)));
});
