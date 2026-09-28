import assert from 'node:assert/strict';
import test from 'node:test';

let moduleNumber = 0;

async function withStorage({ legacy, manual } = {}) {
  const saved = new Map();
  if (legacy !== undefined) saved.set('slakten_geocode_cache',
    typeof legacy === 'string' ? legacy : JSON.stringify(legacy));
  if (manual !== undefined) saved.set('slakten_location_overrides',
    typeof manual === 'string' ? manual : JSON.stringify(manual));
  globalThis.localStorage = {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, value); },
    removeItem(key) { saved.delete(key); },
  };
  const geocoder = await import(`../src/utils/geocoder.ts?test=${++moduleNumber}`);
  return { geocoder, saved };
}

test('manual edits, shared coordinates, old browser cache, and unresolved places have clear precedence', async () => {
  const { geocoder } = await withStorage({
    legacy: [
      ['Manual', { lat: 10, lon: 10 }],
      ['Shared', { lat: 20, lon: 20 }],
      ['Shared null', { lat: 30, lon: 30 }],
      ['Legacy only', { lat: 40, lon: 40 }],
    ],
    manual: [['Manual', { lat: 50, lon: 50 }]],
  });
  geocoder.hydrateGeocoderCache([
    ['Manual', { lat: 60, lon: 60 }],
    ['Shared', { lat: 70, lon: 70 }],
    ['Shared null', null],
    ['Unknown', null],
  ]);

  let callbackCount = 0;
  const summary = geocoder.resolvePlaces(
    ['Manual', 'Shared', 'Shared null', 'Legacy only', 'Unknown', 'Absent', 'Manual', ' '],
    progress => {
      callbackCount += 1;
      progress.cache.set('Manual', null);
    },
  );
  assert.equal(callbackCount, 1);
  assert.deepEqual(
    [summary.total, summary.resolved, summary.unresolved, summary.sharedResolved, summary.localResolved],
    [6, 4, 2, 1, 3],
  );
  assert.deepEqual([...summary.cache], [
    ['Manual', { lat: 50, lon: 50 }],
    ['Shared', { lat: 70, lon: 70 }],
    ['Shared null', { lat: 30, lon: 30 }],
    ['Legacy only', { lat: 40, lon: 40 }],
    ['Unknown', null],
    ['Absent', null],
  ]);
  assert.deepEqual([...summary.sources], [
    ['Manual', 'manual'], ['Shared', 'shared'], ['Shared null', 'legacy'],
    ['Legacy only', 'legacy'], ['Unknown', 'missing'], ['Absent', 'missing'],
  ]);
});

test('manual correction persists separately and local candidate export does not contain shared entries', async () => {
  const oldCache = [['Old place', { lat: 11, lon: 12 }]];
  const { geocoder, saved } = await withStorage({ legacy: oldCache });
  geocoder.hydrateGeocoderCache([['Shared place', { lat: 33, lon: 34 }]]);
  geocoder.updateLocationCache('Old place', { lat: 21, lon: 22 });
  geocoder.updateLocationCache('New correction', { lat: 31, lon: 32 });

  assert.equal(saved.get('slakten_geocode_cache'), JSON.stringify(oldCache));
  assert.deepEqual(JSON.parse(saved.get('slakten_location_overrides')), [
    ['New correction', { lat: 31, lon: 32 }],
    ['Old place', { lat: 21, lon: 22 }],
  ]);
  assert.deepEqual(geocoder.getManualLocationOverrides(), [
    ['New correction', { lat: 31, lon: 32 }],
    ['Old place', { lat: 21, lon: 22 }],
  ]);
  assert.deepEqual(geocoder.getLocalLocationCandidates(), [
    ['New correction', { lat: 31, lon: 32 }],
    ['Old place', { lat: 21, lon: 22 }],
  ]);
  const nextSession = await withStorage({ legacy: oldCache, manual: JSON.parse(saved.get('slakten_location_overrides')) });
  nextSession.geocoder.hydrateGeocoderCache([['Old place', { lat: 99, lon: 99 }]]);
  assert.deepEqual(nextSession.geocoder.resolvePlaces(['Old place']).cache.get('Old place'),
    { lat: 21, lon: 22 });
});

test('damaged storage and malformed shared rows cannot break resolution', async () => {
  const { geocoder } = await withStorage({
    legacy: '{bad json',
    manual: [['Invalid latitude', { lat: 99, lon: 10 }], ['Valid override', { lat: 0, lon: 0 }]],
  });
  geocoder.hydrateGeocoderCache([
    ['Bad longitude', { lat: 0, lon: Infinity }],
    ['No coordinates', { lat: '59', lon: 18 }],
    ['Valid shared', { lat: 59, lon: 18 }],
    ['', { lat: 59, lon: 18 }],
    { place: 'wrong shape' },
  ]);
  geocoder.hydrateGeocoderCache({ invalid: 'catalog' });
  assert.deepEqual(geocoder.resolvePlaces([
    'Invalid latitude', 'Bad longitude', 'No coordinates', 'Valid shared', 'Valid override',
  ]), {
    cache: new Map([
      ['Invalid latitude', null],
      ['Bad longitude', null],
      ['No coordinates', null],
      ['Valid shared', { lat: 59, lon: 18 }],
      ['Valid override', { lat: 0, lon: 0 }],
    ]),
    sources: new Map([
      ['Invalid latitude', 'missing'], ['Bad longitude', 'missing'], ['No coordinates', 'missing'],
      ['Valid shared', 'shared'], ['Valid override', 'manual'],
    ]),
    precision: new Map(),
    total: 5,
    resolved: 2,
    unresolved: 3,
    sharedResolved: 1,
    localResolved: 1,
  });
  assert.throws(() => geocoder.updateLocationCache('Bad', { lat: 91, lon: 0 }), RangeError);
  assert.throws(() => geocoder.updateLocationCache(' ', { lat: 0, lon: 0 }), TypeError);
});

test('lookup makes no network request, including for places absent from all caches', async () => {
  const { geocoder } = await withStorage();
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error('network should not be used'); };
  try {
    assert.deepEqual(geocoder.resolvePlaces(['Unknown']), {
      cache: new Map([['Unknown', null]]),
      sources: new Map([['Unknown', 'missing']]),
      precision: new Map(),
      total: 1,
      resolved: 0,
      unresolved: 1,
      sharedResolved: 0,
      localResolved: 0,
    });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('optional shared precision marks approximate points without changing old catalog rows', async () => {
  const { geocoder } = await withStorage({ legacy: [['Legacy place', { lat: 2, lon: 3 }]] });
  geocoder.hydrateGeocoderCache([
    ['Approximate shared', { lat: 4, lon: 5 }],
    ['Manual correction', { lat: 6, lon: 7 }],
    ['Unresolved', null],
  ]);
  const places = ['Approximate shared', 'Manual correction', 'Legacy place', 'Unresolved'];
  assert.equal(geocoder.resolvePlaces(places).precision.size, 0);

  geocoder.hydrateLocationPrecision([
    ['Approximate shared', 'approximate'],
    ['Manual correction', 'approximate'],
    ['Legacy place', 'approximate'],
    ['Unresolved', 'approximate'],
    ['Bad precision', 'exact'],
    ['Bad row'],
  ]);
  geocoder.updateLocationCache('Manual correction', { lat: 8, lon: 9 });
  const resolved = geocoder.resolvePlaces(places);
  assert.deepEqual([...resolved.precision], [['Approximate shared', 'approximate']]);
  assert.deepEqual(resolved.cache.get('Approximate shared'), { lat: 4, lon: 5 });
  assert.deepEqual(resolved.cache.get('Manual correction'), { lat: 8, lon: 9 });
  assert.deepEqual([...resolved.sources], [
    ['Approximate shared', 'shared'], ['Manual correction', 'manual'],
    ['Legacy place', 'legacy'], ['Unresolved', 'missing'],
  ]);

  geocoder.setLocationReviewStatus('Legacy place', 'uncertain');
  assert.equal(geocoder.resolvePlaces(places).precision.get('Legacy place'), 'approximate');
  geocoder.hydrateLocationPrecision(undefined); // Optional companion absent or unavailable.
  assert.equal(geocoder.resolvePlaces(places).precision.has('Approximate shared'), false);
  assert.equal(geocoder.resolvePlaces(places).precision.get('Legacy place'), 'approximate');
});

test('marking a wrong point hides only that exact place and undo restores the shared value', async () => {
  const { geocoder, saved } = await withStorage();
  geocoder.hydrateGeocoderCache([
    ['Farm, Parish', { lat: 59, lon: 15 }],
    ['Other farm, Parish', { lat: 59, lon: 15 }],
  ]);
  geocoder.setLocationReviewStatus('Farm, Parish', 'incorrect');
  assert.equal(geocoder.getLocationReviewStatus('Farm, Parish'), 'incorrect');
  const hidden = geocoder.resolvePlaces(['Farm, Parish', 'Other farm, Parish']);
  assert.equal(hidden.cache.get('Farm, Parish'), null);
  assert.equal(hidden.sources.get('Farm, Parish'), 'rejected');
  assert.deepEqual(hidden.cache.get('Other farm, Parish'), { lat: 59, lon: 15 });
  assert.deepEqual(geocoder.getLocationCandidateBeforeReview('Farm, Parish'), { lat: 59, lon: 15 });

  geocoder.updateLocationCache('Farm, Parish', { lat: 60, lon: 16 });
  assert.equal(geocoder.getLocationReviewStatus('Farm, Parish'), 'corrected');
  assert.deepEqual(geocoder.resolvePlaces(['Farm, Parish']).cache.get('Farm, Parish'), { lat: 60, lon: 16 });
  assert.ok(saved.get('slakten_location_review_status').includes('corrected'));

  geocoder.undoLocationReview('Farm, Parish');
  assert.equal(geocoder.getLocationReviewStatus('Farm, Parish'), null);
  assert.deepEqual(geocoder.resolvePlaces(['Farm, Parish']).cache.get('Farm, Parish'), { lat: 59, lon: 15 });
});

test('rejected old geocodes are excluded from the coordinate import proposal', async () => {
  const { geocoder } = await withStorage({ legacy: [
    ['Wrong', { lat: 40, lon: -87 }],
    ['Unreviewed', { lat: 60, lon: 15 }],
  ] });
  geocoder.setLocationReviewStatus('Wrong', 'incorrect');
  assert.deepEqual(geocoder.getLocalLocationCandidates(), [['Unreviewed', { lat: 60, lon: 15 }]]);
  assert.deepEqual(geocoder.getLocationCandidateBeforeReview('Wrong'), { lat: 40, lon: -87 });
});

test('known country-centre mismatches do not reappear from old browser caches', async () => {
  const wrong = { lat: 59.6749712, lon: 14.5208584 };
  const { geocoder } = await withStorage({ legacy: [
    ['Linneryd (Smalland), Sweden', wrong],
    ['Göteborg och Bohus, Sverige', wrong],
    ['Sweden', wrong],
  ] });
  geocoder.hydrateGeocoderCache([
    ['Linneryd (Smalland), Sweden', null],
    ['Göteborg och Bohus, Sverige', null],
    ['Sweden', wrong],
  ]);
  const resolved = geocoder.resolvePlaces([
    'Linneryd (Smalland), Sweden', 'Göteborg och Bohus, Sverige', 'Sweden',
  ]);
  assert.equal(resolved.cache.get('Linneryd (Smalland), Sweden'), null);
  assert.equal(resolved.cache.get('Göteborg och Bohus, Sverige'), null);
  assert.deepEqual(resolved.cache.get('Sweden'), wrong);
  assert.deepEqual(geocoder.getLocalLocationCandidates(), [['Sweden', wrong]]);
});

test('retired wrong locality points stay hidden while reviewed replacements and manual edits remain usable', async () => {
  const oldTown = { lat: 59.2747287, lon: 15.2151181 };
  const oldSofia = { lat: 57.2986503, lon: 13.5391543 };
  const manualPoint = { lat: 60.27, lon: 14.61 };
  const reviewedSofia = { lat: 57.77992, lon: 14.13696 };
  const { geocoder } = await withStorage({
    legacy: [
      ['Kristinehamn, Örebro, Sverige', oldTown],
      ['Nora stadsförsamling, Örebro, Sverige', oldTown],
      ['Säfsnäs, Gällinge', { lat: 57.3955398, lon: 12.2488171 }],
      ['Jönköpings Sofia (F)', oldSofia],
      ['Unrelated source at same point', oldTown],
    ],
    manual: [['Säfsnäs, Gällinge', manualPoint]],
  });
  geocoder.hydrateGeocoderCache([
    ['Kristinehamn, Örebro, Sverige', null],
    ['Nora stadsförsamling, Örebro, Sverige', null],
    ['Säfsnäs, Gällinge', null],
    ['Jönköpings Sofia (F)', reviewedSofia],
  ]);
  const places = ['Kristinehamn, Örebro, Sverige', 'Nora stadsförsamling, Örebro, Sverige',
    'Säfsnäs, Gällinge', 'Jönköpings Sofia (F)', 'Unrelated source at same point'];
  const result = geocoder.resolvePlaces(places);
  assert.equal(result.cache.get(places[0]), null);
  assert.equal(result.cache.get(places[1]), null);
  assert.deepEqual(result.cache.get(places[2]), manualPoint);
  assert.deepEqual(result.cache.get(places[3]), reviewedSofia);
  assert.deepEqual(result.cache.get(places[4]), oldTown);
  assert.deepEqual(geocoder.getLocalLocationCandidates(), [
    ['Säfsnäs, Gällinge', manualPoint], ['Unrelated source at same point', oldTown],
  ]);
});
