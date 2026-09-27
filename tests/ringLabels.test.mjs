import assert from 'node:assert/strict';
import test from 'node:test';
import { planRingLabel } from '../src/utils/ringLabels.ts';

const details = (more = {}) => ({
  dates: false, residence: false, children: false, partners: false, places: false, ...more,
});

const node = (more = {}) => ({
  key: '6:0', personId: 'A', kind: 'person', generation: 6,
  startAngle: -90, endAngle: -78.75,
  name: 'Anna Maria Johansson',
  birthDate: '14 JUN 1801', deathDate: '4 JUL 1876',
  birthPlace: 'Lund, Skåne, Sverige', deathPlace: 'Uppsala, Sverige',
  residences: [{ date: '1840', place: 'Stockholm, Sverige' }],
  children: [{ id: 'C1', name: 'Barn 1' }, { id: 'C2', name: 'Barn 2' }],
  partners: [{ id: 'P1', name: 'Partner' }],
  ...more,
});

const ring = (zoom, pixelsPerWorldUnit, selectedDetails = details()) => ({
  zoom, pixelsPerWorldUnit,
  innerRadius: 304.5, outerRadius: 358.5,
  details: selectedDetails,
});

test('a narrow outer-ring sector hides text until screen-space zoom gives it room', () => {
  const person = node();
  const overview = planRingLabel(person, ring(1, 0.6, details({ dates: true, residence: true })));
  const close = planRingLabel(person, ring(3, 1.8, details({ dates: true, residence: true })));

  assert.equal(overview.visible, false);
  assert.deepEqual(overview.lines, []);
  assert.equal(close.visible, true);
  assert.deepEqual(close.lines.map((line) => line.kind), ['name', 'detail', 'detail']);
  assert.match(close.lines[1].text, /1801.*1876/);
  assert.match(close.lines[2].text, /Bostad: Stockhol/);
  assert.ok(close.screenArcWidthPx > overview.screenArcWidthPx);
  assert.ok(close.screenBandHeightPx > overview.screenBandHeightPx);
});

test('wide-sector tangent labels are capped by the outer circle', () => {
  const wide = node({ generation: 2, startAngle: -90, endAngle: 90 });
  const scale = 2;
  const innerRadius = 100;
  const outerRadius = 150;
  const midRadius = (innerRadius + outerRadius) / 2;
  const arcChordWorld = 2 * midRadius;
  const circleChordWorld = 2 * Math.sqrt(outerRadius ** 2 - midRadius ** 2);
  const plan = planRingLabel(wide, {
    zoom: 3, pixelsPerWorldUnit: scale, innerRadius, outerRadius,
    details: details(),
  });
  assert.ok(circleChordWorld < arcChordWorld);
  assert.ok(Math.abs(plan.screenArcWidthPx - circleChordWorld * scale) < 0.001);
  assert.ok(Math.abs(plan.maxWidthWorld - (circleChordWorld - 12 / scale)) < 0.001);
  assert.ok(plan.maxWidthWorld < arcChordWorld - 12 / scale);
});

test('optional facts appear only when their toggle is on and there is vertical room', () => {
  const person = node();
  const compact = planRingLabel(person, ring(1.5, 1.05, details({ dates: true, residence: true })));
  const noFacts = planRingLabel(person, ring(4, 2.3, details()));
  const counts = planRingLabel(person, ring(4, 2.3, details({ children: true, partners: true })));
  assert.equal(compact.visible, true);
  assert.ok(compact.lines.length <= 2);
  assert.deepEqual(noFacts.lines.map((line) => line.kind), ['name']);
  assert.match(counts.lines[1].text, /2 barn · 1 partner/);
});

test('place lines come from recorded places and do not invent missing details', () => {
  const person = node({ birthDate: 'BET 1800 AND 1810', deathDate: '', residences: [], children: [], partners: [] });
  const plan = planRingLabel(person, ring(4, 2.3, details({ dates: true, residence: true, children: true, partners: true, places: true })));
  assert.equal(plan.lines.length, 3);
  assert.equal(plan.lines[1].text, 'Född: Lund');
  assert.equal(plan.lines[2].text, 'Död: Uppsala');
  assert.equal(plan.lines.some((line) => line.text.includes('1800')), false);
  assert.equal(plan.lines.some((line) => line.text.includes('Bostad')), false);
});

test('qualified birth and death years retain approximation in inline labels', () => {
  const wide = node({
    generation: 3, startAngle: -90, endAngle: 0,
    birthDate: 'ABT 1925', deathDate: 'EST 1975',
  });
  const geometry = {
    zoom: 4, pixelsPerWorldUnit: 2.3,
    innerRadius: 200, outerRadius: 254,
    details: details({ dates: true }),
  };
  const approximate = planRingLabel(wide, geometry);
  assert.equal(approximate.lines[1].text, 'f. ca 1925 · d. ca 1975');

  const calculated = planRingLabel(node({ ...wide, birthDate: 'CAL 1925', deathDate: 'CIRCA 1975' }), geometry);
  assert.equal(calculated.lines[1].text, 'f. ca 1925 · d. ca 1975');

  const oneSided = planRingLabel(node({ ...wide, birthDate: 'BEF 1925', deathDate: 'AFT 1975' }), geometry);
  assert.deepEqual(oneSided.lines.map((line) => line.kind), ['name']);
});

test('long names are abbreviated only as needed and font stays readable in screen pixels', () => {
  const person = node({ name: 'Alexandra Beatrice Cecilia Dominguez' });
  const mid = planRingLabel(person, ring(2, 1.15));
  const high = planRingLabel(person, ring(8, 4.6));
  assert.equal(mid.visible, true);
  assert.ok(mid.lines[0].text.length < person.name.length);
  assert.equal(high.lines[0].text, person.name);
  assert.ok(mid.fontSizeWorld * 1.15 >= 12);
  assert.ok(high.fontSizeWorld * 4.6 <= 14.5);
  assert.ok(high.fontSizeWorld < mid.fontSizeWorld);
  assert.ok(high.lineHeightWorld > 0);
  assert.ok(high.maxWidthWorld > 0);
});

test('unknown sectors can be labeled without fabricated person facts', () => {
  const missing = node({ personId: null, kind: 'unknown', name: 'Okänd förälder' });
  const plan = planRingLabel(missing, ring(4, 2.3, details({ dates: true, children: true, places: true })));
  assert.deepEqual(plan.lines, [{ kind: 'name', text: 'Okänd förälder' }]);
});

test('invalid or physically tiny geometry yields no label', () => {
  assert.equal(planRingLabel(node(), ring(2, 0)).visible, false);
  assert.equal(planRingLabel(node(), { ...ring(2, 1), innerRadius: 100, outerRadius: 100 }).visible, false);
  const tiny = planRingLabel(node(), { ...ring(2, 1), innerRadius: 300, outerRadius: 304 });
  assert.equal(tiny.visible, false);
});
