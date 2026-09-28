/** One-off, guarded normalization of exact duplicate FAM records in the reviewed GEDCOM. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGedcomData } from '../src/utils/gedcomParser.ts';
import { extractSourceEvidence } from '../src/utils/sourceEvidence.ts';

const root = resolve(import.meta.dirname, '..');
const publicPath = resolve(root, 'public/berring_messing-cleaned.ged');
const mirrorName = readdirSync(root).find(name => name.startsWith('Berring_Messings ') && name.endsWith('-cleaned.ged'));
assert.ok(mirrorName, 'Missing root GEDCOM mirror');
const mirrorPath = resolve(root, mirrorName);
const expectedSha256 = '0ced4b5c33ffe4e75e695bd7e7a765b67860f3018f5abea57eadafe6def30e8b';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const original = readFileSync(publicPath, 'utf8');
assert.equal(original, readFileSync(mirrorPath, 'utf8'), 'GEDCOM copies differ');
assert.equal(sha256(original), expectedSha256, 'Input is not the reviewed person-merged GEDCOM');
assert.equal(original.includes('\r'), false, 'Unexpected GEDCOM line ending');

function parseRecords(text) {
  const records = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (/^0 /.test(line)) {
      if (current) records.push(current);
      current = { lines: [line] };
    } else {
      assert.ok(current, 'Text before HEAD');
      current.lines.push(line);
    }
  }
  if (current) records.push(current);
  return records;
}

const records = parseRecords(original);
const families = records.flatMap((record, index) => {
  const match = /^0 (@F[^@\s]+@) FAM$/.exec(record.lines[0]);
  return match ? [{ id: match[1], index, record, body: record.lines.slice(1).join('\n') }] : [];
});
const familyById = new Map(families.map(family => [family.id, family]));
assert.equal(familyById.size, families.length, 'Repeated FAM ID');

const groupsByBody = new Map();
for (const family of families) {
  const group = groupsByBody.get(family.body) ?? [];
  group.push(family);
  groupsByBody.set(family.body, group);
}
const duplicateGroups = [...groupsByBody.values()].filter(group => group.length > 1);
const candidateIds = new Set(duplicateGroups.flatMap(group => group.map(family => family.id)));
const refs = new Map([...candidateIds].map(id => [id, []]));

for (const record of records) {
  const person = /^0 (@I[^@\s]+@) INDI$/.exec(record.lines[0])?.[1];
  for (let index = 1; index < record.lines.length; index++) {
    const line = record.lines[index];
    for (const match of line.matchAll(/@F[^@\s]+@/g)) {
      if (!candidateIds.has(match[0])) continue;
      const pointer = /^1 (FAMC|FAMS) (@F[^@\s]+@)$/.exec(line);
      assert.ok(person && pointer?.[2] === match[0], `Unexpected FAM reference: ${record.lines[0]} / ${line}`);
      const subtree = [];
      for (let next = index + 1; next < record.lines.length; next++) {
        const level = Number(/^([0-9]+) /.exec(record.lines[next])?.[1]);
        if (!Number.isFinite(level) || level <= 1) break;
        subtree.push(record.lines[next]);
      }
      refs.get(match[0]).push({ person, tag: pointer[1], subtree });
    }
  }
}

const removedToKept = new Map();
const mapping = [];
for (const group of duplicateGroups) {
  assert.ok(group[0].record.lines.slice(1).every(line => /^1 (?:HUSB|WIFE|CHIL) @I[^@\s]+@$/.test(line)),
    `Non-structural data in duplicate FAM group ${group.map(family => family.id)}`);
  const keys = new Set(group.flatMap(family => refs.get(family.id).map(ref => `${ref.person}\u0000${ref.tag}`)));
  const safeKeepers = group.filter(family => {
    const ownKeys = new Set(refs.get(family.id).map(ref => `${ref.person}\u0000${ref.tag}`));
    return [...keys].every(key => ownKeys.has(key))
      && group.filter(other => other.id !== family.id)
        .every(other => refs.get(other.id).every(ref => ref.subtree.length === 0));
  });
  assert.ok(safeKeepers.length > 0, `No safe representative for ${group.map(family => family.id)}`);
  safeKeepers.sort((left, right) => refs.get(right.id).length - refs.get(left.id).length
    || refs.get(right.id).filter(ref => ref.subtree.length).length
      - refs.get(left.id).filter(ref => ref.subtree.length).length
    || left.index - right.index);
  const keep = safeKeepers[0];
  for (const family of group) {
    if (family.id === keep.id) continue;
    removedToKept.set(family.id, keep.id);
    mapping.push({ removedId: family.id, keptId: keep.id, removedBacklinks: refs.get(family.id).length });
  }
}

let deletedBacklinks = 0;
const normalizedRecords = records.flatMap(record => {
  const removedFamilyId = /^0 (@F[^@\s]+@) FAM$/.exec(record.lines[0])?.[1];
  if (removedFamilyId && removedToKept.has(removedFamilyId)) return [];
  if (!/^0 @I[^@\s]+@ INDI$/.test(record.lines[0])) return [record];
  return [{ lines: record.lines.filter(line => {
    const pointer = /^1 (FAMC|FAMS) (@F[^@\s]+@)$/.exec(line);
    if (!pointer || !removedToKept.has(pointer[2])) return true;
    deletedBacklinks++;
    return false;
  }) }];
});
const normalized = normalizedRecords.map(record => record.lines.join('\n')).join('\n');
assert.ok(normalized.endsWith('0 TRLR\n'), 'TRLR or final newline changed');
assert.equal(parseRecords(normalized).length, records.length - removedToKept.size);
assert.equal([...removedToKept.keys()].some(id => normalized.includes(id)), false, 'Removed FAM ID still referenced');
assert.equal(deletedBacklinks, mapping.reduce((count, item) => count + item.removedBacklinks, 0));

const before = parseGedcomData(original);
const after = parseGedcomData(normalized);
const relations = data => [...new Set(data.families.map(family => JSON.stringify([
  family.husb ?? null, family.wife ?? null, [...family.children].sort(),
])))].sort();
assert.deepEqual(after.individuals, before.individuals, 'INDI parse changed');
assert.deepEqual(relations(after), relations(before), 'Unique family relationships changed');
assert.equal(after.families.length, before.families.length - removedToKept.size);
assert.deepEqual(extractSourceEvidence(normalized), extractSourceEvidence(original), 'Source evidence changed');
const remainingFamilyIds = new Set(after.families.map(family => family.id));
for (const line of normalized.split('\n')) {
  const pointer = /^1 FAM[CS] (@F[^@\s]+@)$/.exec(line);
  if (pointer) assert.ok(remainingFamilyIds.has(pointer[1]), `Dangling FAM pointer ${pointer[1]}`);
}
const remainingBodies = new Set(after.families.map(family => JSON.stringify([
  family.husb ?? null, family.wife ?? null, family.children,
])));
assert.equal(remainingBodies.size, after.families.length, 'Duplicate FAM relationships remain');

const summary = {
  method: 'Exact FAM body, keep all source facts and annotated INDI backlinks',
  inputSha256: sha256(original),
  outputSha256: sha256(normalized),
  individuals: after.individuals.length,
  familiesBefore: before.families.length,
  familiesAfter: after.families.length,
  duplicateGroups: duplicateGroups.length,
  removedFamilyRecords: removedToKept.size,
  removedRedundantBacklinks: deletedBacklinks,
  mapping,
};
const auditPath = resolve(root, 'docs/duplicate-family-normalization.json');
for (const path of [publicPath, mirrorPath]) {
  const temporary = `${path}.normalizing`;
  writeFileSync(temporary, normalized, 'utf8');
  renameSync(temporary, path);
}
writeFileSync(auditPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...summary, mapping: `${mapping.length} entries in ${auditPath}` }, null, 2));
