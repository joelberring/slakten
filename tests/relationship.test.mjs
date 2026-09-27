import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeBloodRelationship,
  findAllCousinMarriages,
  findRelationshipPath,
  getPathEdges,
} from '../src/utils/relationship.ts';

const family = (id, children, husb, wife) => ({ id, children, husb, wife });
const cousinFamilies = [
  family('A-parents', ['A'], 'PA', 'MA'),
  family('B-parents', ['B'], 'PB', 'MB'),
  family('PA-parents', ['PA'], 'G1', 'G2'),
  family('PB-parents', ['PB'], 'G1', 'G2'),
  family('couple-1', [], 'A', 'B'),
  family('couple-2', [], 'B', 'A'),
];

test('blood analysis counts people, not family nodes, when naming cousins', () => {
  const result = analyzeBloodRelationship(cousinFamilies, 'A', 'B');
  assert.equal(result?.label, 'Kusiner');
  assert.equal(result?.generationsFromA, 2);
  assert.equal(result?.generationsFromB, 2);
  assert.ok(['G1', 'G2'].includes(result?.commonAncestorId));
  assert.ok(result?.path.includes('A-parents'));
  assert.ok(result?.path.includes('B-parents'));
  const edges = getPathEdges(result.path);
  assert.ok(edges.has('e-A-A-parents'));
  assert.ok(edges.has('e-B-parents-B'));
});

test('direct ancestors, siblings, self and disconnected people are explicit', () => {
  const families = [family('parents', ['A', 'B'], 'F', 'M')];
  assert.equal(analyzeBloodRelationship(families, 'A', 'B')?.label, 'Syskon');
  assert.equal(analyzeBloodRelationship(families, 'A', 'F')?.label, 'Förälder och barn');
  assert.deepEqual(findRelationshipPath(families, 'A', 'A', true), ['A']);
  assert.equal(analyzeBloodRelationship(families, 'A', 'unrelated'), null);
});

test('spouse route is available without asserting blood ancestry', () => {
  const families = [family('marriage', [], 'A', 'B')];
  assert.equal(analyzeBloodRelationship(families, 'A', 'B'), null);
  assert.deepEqual(findRelationshipPath(families, 'A', 'B', false), ['A', 'marriage', 'B']);
});

test('pair scan classifies correctly and combines repeat family records by person ids', () => {
  const results = findAllCousinMarriages(cousinFamilies);
  const couple = results.find(result => [result.husb, result.wife].sort().join(':') === 'A:B');
  assert.equal(couple?.relationType, 'Kusiner');
  assert.equal(couple?.generationsFromHusb, 2);
  assert.equal(couple?.generationsFromWife, 2);
  assert.deepEqual(couple?.familyIds, ['couple-1', 'couple-2']);
  assert.deepEqual(new Set(couple?.sharedAncestors), new Set(['G1', 'G2']));
});

test('cyclic parent records terminate without repeating nodes forever', () => {
  const families = [family('a-parents', ['A'], 'B'), family('b-parents', ['B'], 'A')];
  const result = analyzeBloodRelationship(families, 'A', 'B');
  assert.equal(result?.label, 'Förälder och barn');
  assert.ok(result.path.length <= 3);
});
