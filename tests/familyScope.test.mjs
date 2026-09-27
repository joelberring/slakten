import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBranchPersonIds } from '../src/utils/familyScope.ts';

const families = [
  { husb: 'grandfather', wife: 'grandmother', children: ['father'] },
  { husb: 'father', wife: 'mother', children: ['person', 'sibling'] },
  { husb: 'person', wife: 'partner', children: ['child'] },
  { husb: 'child', children: ['grandchild'] },
];

test('ancestor and descendant scopes follow only the selected direction', () => {
  assert.deepEqual([...collectBranchPersonIds(families, 'person', 'ancestors')].sort(),
    ['father', 'grandfather', 'grandmother', 'mother', 'person']);
  assert.deepEqual([...collectBranchPersonIds(families, 'person', 'descendants')].sort(),
    ['child', 'grandchild', 'person']);
  assert.equal(collectBranchPersonIds(families, 'person', 'all'), null);
});

test('a cycle and repeated family references do not duplicate or loop', () => {
  const cyclic = [...families, { husb: 'grandchild', children: ['person', 'person'] }];
  assert.deepEqual([...collectBranchPersonIds(cyclic, 'person', 'descendants')].sort(),
    ['child', 'grandchild', 'person']);
  assert.deepEqual([...collectBranchPersonIds([], 'isolated', 'ancestors')], ['isolated']);
});
