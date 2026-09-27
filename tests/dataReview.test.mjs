import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDataReview } from '../src/utils/dataReview.ts';
import { extractSourceEvidence } from '../src/utils/sourceEvidence.ts';

test('review suggests only birth-year-matched possible duplicates and leaves living people out of death-year gaps', () => {
  const review = buildDataReview([
    { id: '@I1@', name: 'Anna Test', birthDate: 'ABT 1820', deathDate: '' },
    { id: '@I2@', name: 'Anna Test', birthDate: '1820', deathDate: '1888' },
    { id: '@I3@', name: 'Anna Test', birthDate: '1821', deathDate: '1901' },
    { id: '@I4@', name: 'Nils Test', birthDate: '1979', deathDate: '' },
    { id: '@I5@', name: 'Eva Test', birthDate: '', deathDate: '' },
  ]);
  assert.deepEqual(review.duplicateSuggestions.map(group => group.people.map(person => person.id)), [['@I1@', '@I2@']]);
  assert.deepEqual(review.missingDeathYear.map(person => person.id), ['@I1@']);
  assert.deepEqual(review.missingBirthYear.map(person => person.id), ['@I5@']);
  assert.deepEqual(review.uncertainDates.map(entry => entry.person.id), ['@I1@']);
  assert.equal(buildDataReview(review.people, new Set(['@I4@'])).people.length, 1);
});

test('source extraction uses explicit person and family citations and retains event context', () => {
  const gedcom = [
    '0 HEAD',
    '1 SOUR TEST',
    '0 @I1@ INDI',
    '1 NAME Anna /Test/',
    '1 BIRT',
    '2 DATE 1820',
    '2 SOUR @S1@',
    '3 PAGE sidan 3',
    '1 SOUR @S2@',
    '0 @I2@ INDI',
    '1 NAME Per /Test/',
    '0 @F1@ FAM',
    '1 HUSB @I2@',
    '1 WIFE @I1@',
    '1 MARR',
    '2 SOUR @S1@',
    '0 @S1@ SOUR',
    '1 TITL Födelsebok',
    '0 @S2@ SOUR',
    '1 TITL Familjearkiv',
    '0 TRLR',
  ].join('\n');
  const sources = extractSourceEvidence(gedcom);
  assert.deepEqual(sources.get('@I1@'), [
    { label: 'Födelsebok', context: 'Födelse', page: 'sidan 3' },
    { label: 'Familjearkiv', context: 'Person' },
    { label: 'Födelsebok', context: 'Vigsel' },
  ]);
  assert.deepEqual(sources.get('@I2@'), [{ label: 'Födelsebok', context: 'Vigsel' }]);
});
