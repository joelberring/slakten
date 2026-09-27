import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPersonSearch, normalizePersonSearch } from '../src/utils/personSearch.ts';

test('GEDCOM name spacing, case and Swedish accents do not break multiword search', () => {
  assert.equal(normalizePersonSearch('  John  Ivar   Messing '), 'john ivar messing');
  assert.equal(matchesPersonSearch('John  Ivar Messing', 'John Ivar'), true);
  assert.equal(matchesPersonSearch('John  Ivar Messing', 'john ivar messing'), true);
  assert.equal(matchesPersonSearch('Åsa  Öster', 'asa oster'), true);
  assert.equal(matchesPersonSearch('John Ivar Messing', 'John Erik'), false);
});
