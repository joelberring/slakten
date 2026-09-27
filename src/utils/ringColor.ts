import type { RingTreeNode } from './ringTree';

/** Five independent interpretations of the same ancestral sectors. */
export type RingColorMode = 'century' | 'birthRegion' | 'residence' | 'lifespan' | 'overlap';
export type RingPalette = [light: string, middle: string, dark: string];

export interface RingColorAssignment {
  categoryKey: string;
  label: string;
  palette: RingPalette;
  known: boolean;
}

export interface RingColorLegendItem extends RingColorAssignment {
  count: number;
}

export interface RingColorScale {
  assignments: Map<string, RingColorAssignment>;
  legend: RingColorLegendItem[];
}

const UNKNOWN_PALETTE: RingPalette = ['#f2f0eb', '#d8d5cc', '#a6a198'];
const UNIQUE_PALETTE: RingPalette = ['#ecedf1', '#c7cad2', '#858b9a'];

const CENTURY_PALETTES: Record<number, RingPalette> = {
  2000: ['#dbf4e9', '#75cbb1', '#338d7d'],
  1900: ['#d7f0f0', '#82c1c9', '#367f94'],
  1800: ['#dfe9f7', '#9fb7db', '#586eae'],
  1700: ['#eee3f4', '#bba2cf', '#8565a7'],
  1600: ['#f8e2eb', '#e3a3bb', '#b4668a'],
  1500: ['#fae8d2', '#e7bd87', '#b77e4e'],
  1400: ['#f5e2d8', '#d9a383', '#a76f55'],
};

const LIFESPAN_BINS: Array<{ max: number; key: string; label: string; palette: RingPalette }> = [
  { max: 29, key: 'under-30', label: 'Under 30 år', palette: ['#f8e3e3', '#dfa7a5', '#a65662'] },
  { max: 49, key: '30-49', label: '30–49 år', palette: ['#f8e9dc', '#e0b18b', '#a96b4b'] },
  { max: 69, key: '50-69', label: '50–69 år', palette: ['#f7eed8', '#dbc47e', '#987d3f'] },
  { max: 89, key: '70-89', label: '70–89 år', palette: ['#e2f1e9', '#9acbb6', '#4e927a'] },
  { max: 125, key: '90-plus', label: '90 år eller mer', palette: ['#e1eff4', '#99c6d4', '#4b869a'] },
];

const SWEDISH_REGIONS = new Set([
  'blekinge', 'bohuslän', 'dalarna', 'dalarnas län', 'gotland', 'gotlands län',
  'gävleborg', 'gävleborgs län', 'halland', 'hallands län', 'jämtland',
  'jämtlands län', 'jönköping', 'jönköpings län', 'kalmar', 'kalmar län',
  'kronoberg', 'kronobergs län', 'norrbotten', 'norrbottens län',
  'skåne', 'skåne län', 'stockholm', 'stockholms län', 'södermanland',
  'södermanlands län', 'uppsala', 'uppsala län', 'värmland', 'värmlands län',
  'västerbotten', 'västerbottens län', 'västernorrland', 'västernorrlands län',
  'västmanland', 'västmanlands län', 'västra götaland', 'västra götalands län',
  'örebro', 'örebro län', 'östergötland', 'östergötlands län',
]);

const COUNTRIES = new Set([
  'sverige', 'sweden', 'norge', 'norway', 'danmark', 'denmark',
  'finland', 'island', 'iceland', 'tyskland', 'germany', 'usa',
  'united states', 'united states of america', 'storbritannien',
  'united kingdom', 'england', 'frankrike', 'france',
]);

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv');
}

function title(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed[0].toLocaleUpperCase('sv') + trimmed.slice(1) : trimmed;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function paletteForText(text: string): RingPalette {
  const hue = hash(text) % 360;
  return [
    `hsl(${hue} 52% 91%)`,
    `hsl(${hue} 48% 68%)`,
    `hsl(${hue} 44% 39%)`,
  ];
}

function centuryPalette(century: number): RingPalette {
  if (CENTURY_PALETTES[century]) return CENTURY_PALETTES[century];
  return paletteForText(`century:${century}`);
}

function unknown(label: string): RingColorAssignment {
  return { categoryKey: 'unknown', label, palette: UNKNOWN_PALETTE, known: false };
}

/**
 * Derive a comparable place group from a recorded GEDCOM place string. Prefer a
 * named Swedish region/county; otherwise use the last non-country component.
 * A single recorded locality remains usable instead of being guessed away.
 */
export function getResidenceRegion(place: string | undefined): string | null {
  if (!place?.trim()) return null;
  const segments = place.split(',').map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return null;
  const nonCountry = segments.filter((segment) => !COUNTRIES.has(normalize(segment)));
  if (!nonCountry.length) return null;
  const explicit = [...nonCountry].reverse().find((segment) =>
    SWEDISH_REGIONS.has(normalize(segment)) || /\b(?:län|county|region|province)\b/i.test(segment));
  const chosen = explicit ?? nonCountry.at(-1)!;
  // County names occur both as "Skåne" and "Skåne län" in GEDCOM files.
  // Normalize the common Swedish genitive form so they share one color.
  if (/\s+län$/i.test(chosen)) {
    return title(chosen.replace(/\s+län$/i, '').replace(/s$/i, ''));
  }
  return title(chosen);
}

/** Year subtraction gives an approximate age because full dates may be absent. */
export function getApproximateLifespan(node: Pick<RingTreeNode, 'birthDate' | 'deathDate'>): number | null {
  const singleYear = (date: string): number | null => {
    const years = [...date.matchAll(/\b\d{4}\b/g)].map((match) => Number(match[0]));
    if (years.length !== 1 || years[0] < 1000 || years[0] > 2099) return null;
    if (/\b(?:BEF|AFT|BEFORE|AFTER|BET|AND|FROM|TO|ABT|ABOUT|CIRCA|CA|CAL|EST)\b/i.test(date)) return null;
    return years[0];
  };
  const birth = singleYear(node.birthDate);
  const death = singleYear(node.deathDate);
  if (birth === null || death === null) return null;
  const age = death - birth;
  return age >= 0 && age <= 125 ? age : null;
}

function residenceAssignment(node: RingTreeNode): RingColorAssignment {
  // GEDCOM RESI events are retained in source order. The last one is the last
  // *recorded* residence, not a claim about current or final residence.
  const last = node.residences.at(-1);
  const region = getResidenceRegion(last?.place);
  if (!region) return unknown('Bostadsort saknas');
  return {
    categoryKey: `residence:${normalize(region)}`,
    label: region,
    palette: paletteForText(`residence:${normalize(region)}`),
    known: true,
  };
}

function birthRegionAssignment(node: RingTreeNode): RingColorAssignment {
  const region = getResidenceRegion(node.birthPlace);
  if (!region) return unknown('Födelseregion saknas');
  return {
    categoryKey: `birthRegion:${normalize(region)}`,
    label: region,
    palette: paletteForText(`birthRegion:${normalize(region)}`),
    known: true,
  };
}

function lifespanAssignment(node: RingTreeNode): RingColorAssignment {
  const age = getApproximateLifespan(node);
  if (age === null) return unknown('Livslängd saknas');
  const bin = LIFESPAN_BINS.find((candidate) => age <= candidate.max)!;
  return {
    categoryKey: `lifespan:${bin.key}`,
    label: bin.label,
    palette: bin.palette,
    known: true,
  };
}

function centuryAssignment(node: RingTreeNode): RingColorAssignment {
  if (node.century === null) return unknown('Födelseårhundrade saknas');
  return {
    categoryKey: `century:${node.century}`,
    label: `${node.century}-tal`,
    palette: centuryPalette(node.century),
    known: true,
  };
}

/** Colors every occurrence of one repeated person identically. */
export function buildRingColorScale(nodes: RingTreeNode[], mode: RingColorMode): RingColorScale {
  const countsByPerson = new Map<string, number>();
  for (const node of nodes) {
    if (node.personId) countsByPerson.set(node.personId, (countsByPerson.get(node.personId) ?? 0) + 1);
  }

  const assignments = new Map<string, RingColorAssignment>();
  const legendByCategory = new Map<string, RingColorLegendItem>();
  for (const node of nodes) {
    let assignment: RingColorAssignment;
    if (node.kind === 'unknown' || !node.personId) {
      const label = mode === 'century' ? 'Födelseårhundrade saknas'
        : mode === 'birthRegion' ? 'Födelseregion saknas'
          : mode === 'residence' ? 'Bostadsort saknas'
            : mode === 'lifespan' ? 'Livslängd saknas' : 'Okänd ana';
      assignment = unknown(label);
    } else if (mode === 'century') {
      assignment = centuryAssignment(node);
    } else if (mode === 'birthRegion') {
      assignment = birthRegionAssignment(node);
    } else if (mode === 'residence') {
      assignment = residenceAssignment(node);
    } else if (mode === 'lifespan') {
      assignment = lifespanAssignment(node);
    } else if ((countsByPerson.get(node.personId) ?? 0) > 1) {
      assignment = {
        categoryKey: `overlap:person:${node.personId}`,
        label: node.name,
        palette: paletteForText(`overlap:${node.personId}`),
        known: true,
      };
    } else {
      assignment = {
        categoryKey: 'overlap:unique',
        label: 'En gren',
        palette: UNIQUE_PALETTE,
        known: true,
      };
    }
    assignments.set(node.key, assignment);
    const existing = legendByCategory.get(assignment.categoryKey);
    if (existing) existing.count += 1;
    else legendByCategory.set(assignment.categoryKey, { ...assignment, count: 1 });
  }

  const legend = [...legendByCategory.values()].sort((a, b) => {
    if (a.categoryKey === 'unknown') return 1;
    if (b.categoryKey === 'unknown') return -1;
    if (mode === 'century') return Number(b.categoryKey.split(':')[1]) - Number(a.categoryKey.split(':')[1]);
    if (mode === 'lifespan') {
      const binIndex = (key: string) => LIFESPAN_BINS.findIndex((bin) => key === `lifespan:${bin.key}`);
      return binIndex(a.categoryKey) - binIndex(b.categoryKey);
    }
    if (mode === 'overlap' && a.categoryKey === 'overlap:unique') return -1;
    if (mode === 'overlap' && b.categoryKey === 'overlap:unique') return 1;
    return b.count - a.count || a.label.localeCompare(b.label, 'sv');
  });
  return { assignments, legend };
}
