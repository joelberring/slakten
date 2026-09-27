/** Pure, bounded layout data for an interactive radial ancestor chart. */

export interface RingIndividual {
  id: string;
  name?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  events?: Array<{ type?: string; date?: string; place?: string }>;
}

export interface RingFamily {
  id: string;
  husb?: string | null;
  wife?: string | null;
  children?: string[];
}

export interface RingRelative {
  id: string;
  name: string;
}

export interface RingResidence {
  date: string;
  place: string;
}

export interface RingParentChoice {
  /** A stable representative FAM ID for this distinct parent-ID pair. */
  familyId: string;
  father: RingRelative | null;
  mother: RingRelative | null;
}

export interface RingTreeNode {
  /** Stable within a chart, even when one person occurs in several pedigree slots. */
  key: string;
  personId: string | null;
  /** The focus person is generation one. */
  generation: number;
  /** Binary position in the generation, with father at an even slot. */
  slot: number;
  /** SVG-friendly degrees: -90 is twelve o'clock; angles increase clockwise. */
  startAngle: number;
  endAngle: number;
  kind: 'person' | 'unknown' | 'cycle';
  relation: 'self' | 'father' | 'mother';
  /** A person can occupy multiple legitimate ancestral paths. */
  repeated: boolean;
  repeatedOf?: string;
  name: string;
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  deathPlace: string;
  residences: RingResidence[];
  children: RingRelative[];
  partners: RingRelative[];
  /** Start year for a century, e.g. 1800 means 1800-talet. */
  century: number | null;
  /** More ancestry exists beyond the chosen depth, or a sector hit the safety cap. */
  hasMore: boolean;
  /** Distinct recorded parent pairs for this person, including the selected one. */
  parentChoices: RingParentChoice[];
  /** Representative FAM ID whose parents populate the next ring. */
  selectedParentFamilyId: string | null;
  /** Number of distinct unselected parent pairs, excluding duplicate FAMs. */
  alternateParentFamilies: number;
}

export interface RingTreeResult {
  nodes: RingTreeNode[];
  focusPersonId: string;
  /** Includes the central person; clamped to 3–24. */
  requestedGenerations: number;
  /** Deepest visible generation, including the central person as one. */
  renderedGenerations: number;
  /** True only if the node safety cap prevented drawing a requested sector. */
  truncated: boolean;
  uniquePeopleCount: number;
}

interface PendingSlot {
  personId: string | null;
  generation: number;
  slot: number;
  pathIds: Set<string>;
}

interface ParentSet {
  choice: RingParentChoice;
  /** Duplicate FAM records for the same ordered parent-ID pair. */
  familyIds: Set<string>;
}

const DEFAULT_MAX_NODES = 4095;
export const MAX_RING_GENERATIONS = 24;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function displayName(person: RingIndividual | undefined): string {
  return clean(person?.name) || 'Okänd person';
}

/**
 * Return the start year of a defensible birth century. Dates that could cross
 * a century boundary, contain implausible years, or are one-sided are unknown.
 */
export function getBirthCentury(birthDate: string | undefined): number | null {
  const date = clean(birthDate).toUpperCase();
  if (!date) return null;

  const years = [...date.matchAll(/\b\d{4}\b/g)].map((match) => Number(match[0]));
  if (years.length === 0 || years.some((year) => year < 1000 || year > 2099)) return null;

  const centuries = new Set(years.map((year) => Math.floor(year / 100) * 100));
  if (centuries.size !== 1) return null;

  // One-sided bounds cannot establish a century. A bounded interval can, if
  // both ends are explicitly in the same century.
  if (years.length === 1 && /\b(?:BEF|AFT|BEFORE|AFTER|FROM|TO)\b/.test(date)) return null;

  // Approximate single dates near a boundary could fall in another century.
  if (years.length === 1 && /\b(?:ABT|ABOUT|CIRCA|CA|CAL|EST)\b/.test(date)) {
    const margin = /\b(?:CAL|EST)\b/.test(date) ? 10 : 5;
    const withinCentury = years[0] % 100;
    if (withinCentury < margin || withinCentury > 99 - margin) return null;
  }

  return Math.floor(years[0] / 100) * 100;
}

function wedge(generation: number, slot: number): { startAngle: number; endAngle: number } {
  const width = 360 / 2 ** (generation - 1);
  const startAngle = -90 + slot * width;
  return { startAngle, endAngle: startAngle + width };
}

/**
 * Build a complete set of known/unknown ancestor slots up to the requested
 * depth. Missing ancestors are drawn once; they are never invented recursively.
 * Repeated ancestors remain in each path, while a cycle within one path stops.
 */
export function buildRingTree(
  individuals: RingIndividual[],
  families: RingFamily[],
  focusPersonId: string,
  generations = 6,
  options: { maxNodes?: number; parentFamilyChoices?: Record<string, string> } = {},
): RingTreeResult {
  const requestedGenerations = Number.isFinite(generations)
    ? Math.min(MAX_RING_GENERATIONS, Math.max(3, Math.floor(generations)))
    : 6;
  const rawMaxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxNodes = Number.isFinite(rawMaxNodes)
    ? Math.min(DEFAULT_MAX_NODES, Math.max(1, Math.floor(rawMaxNodes)))
    : DEFAULT_MAX_NODES;
  const byId = new Map(individuals.map((person) => [person.id, person]));
  const emptyResult: RingTreeResult = {
    nodes: [], focusPersonId, requestedGenerations, renderedGenerations: 0,
    truncated: false, uniquePeopleCount: 0,
  };
  if (!byId.has(focusPersonId)) return emptyResult;

  const parentFamilies = new Map<string, RingFamily[]>();
  const partnerFamilies = new Map<string, RingFamily[]>();
  const childrenByParent = new Map<string, Set<string>>();
  for (const family of [...families].sort((a, b) => compareText(a.id, b.id))) {
    const children = new Set(family.children ?? []);
    for (const childId of children) {
      if (!parentFamilies.has(childId)) parentFamilies.set(childId, []);
      parentFamilies.get(childId)!.push(family);
    }
    for (const parentId of new Set([family.husb, family.wife].filter((id): id is string => !!id))) {
      if (!partnerFamilies.has(parentId)) partnerFamilies.set(parentId, []);
      partnerFamilies.get(parentId)!.push(family);
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
      for (const childId of children) if (byId.has(childId)) childrenByParent.get(parentId)!.add(childId);
    }
  }

  const parentSetsByPerson = new Map<string, ParentSet[]>();
  for (const [childId, familyOptions] of parentFamilies) {
    const byParentIds = new Map<string, ParentSet>();
    for (const family of familyOptions) {
      const parentKey = JSON.stringify([family.husb ?? null, family.wife ?? null]);
      const existing = byParentIds.get(parentKey);
      if (existing) {
        existing.familyIds.add(family.id);
        continue;
      }
      const knownRelative = (id: string | null | undefined): RingRelative | null =>
        id && byId.has(id) ? { id, name: displayName(byId.get(id)) } : null;
      byParentIds.set(parentKey, {
        choice: {
          familyId: family.id,
          father: knownRelative(family.husb),
          mother: knownRelative(family.wife),
        },
        familyIds: new Set([family.id]),
      });
    }
    parentSetsByPerson.set(childId, [...byParentIds.values()]);
  }

  const relativesFor = (personId: string): { children: RingRelative[]; partners: RingRelative[] } => {
    const children = [...(childrenByParent.get(personId) ?? [])]
      .sort(compareText)
      .map((id) => ({ id, name: displayName(byId.get(id)) }));
    const partnerIds = new Set<string>();
    for (const family of partnerFamilies.get(personId) ?? []) {
      const otherId = family.husb === personId ? family.wife : family.husb;
      if (otherId && otherId !== personId && byId.has(otherId)) partnerIds.add(otherId);
    }
    const partners = [...partnerIds]
      .sort(compareText)
      .map((id) => ({ id, name: displayName(byId.get(id)) }));
    return { children, partners };
  };

  const nodes: RingTreeNode[] = [];
  const firstOccurrence = new Map<string, string>();
  const pending: PendingSlot[] = [{ personId: focusPersonId, generation: 1, slot: 0, pathIds: new Set() }];
  let truncated = false;
  let cursor = 0;

  while (cursor < pending.length) {
    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }
    const entry = pending[cursor++];
    const person = entry.personId ? byId.get(entry.personId) : undefined;
    const personId = person?.id ?? null;
    const cycle = personId !== null && entry.pathIds.has(personId);
    const key = `${entry.generation}:${entry.slot}`;
    const repeatedOf = personId === null ? undefined : firstOccurrence.get(personId);
    const parentSets = personId === null ? [] : parentSetsByPerson.get(personId) ?? [];
    const preferredFamilyId = personId === null ? undefined : options.parentFamilyChoices?.[personId];
    const selectedParentSet = parentSets.find((set) =>
      preferredFamilyId !== undefined && set.familyIds.has(preferredFamilyId)) ?? parentSets[0];
    const knownFather = selectedParentSet?.choice.father?.id ?? null;
    const knownMother = selectedParentSet?.choice.mother?.id ?? null;
    const hasKnownParent = !!knownFather || !!knownMother;
    const relation = entry.generation === 1
      ? 'self'
      : entry.slot % 2 === 0 ? 'father' : 'mother';
    const residences = person?.events
      ?.filter((event) => event.type === 'RESI' && clean(event.place))
      .map((event) => ({ date: clean(event.date), place: clean(event.place) })) ?? [];
    const relatives = personId ? relativesFor(personId) : { children: [], partners: [] };

    const node: RingTreeNode = {
      key,
      personId,
      generation: entry.generation,
      slot: entry.slot,
      ...wedge(entry.generation, entry.slot),
      kind: personId === null ? 'unknown' : cycle ? 'cycle' : 'person',
      relation,
      repeated: repeatedOf !== undefined,
      ...(repeatedOf ? { repeatedOf } : {}),
      name: personId === null ? 'Okänd förälder' : displayName(person),
      birthDate: clean(person?.birthDate),
      deathDate: clean(person?.deathDate),
      birthPlace: clean(person?.birthPlace),
      deathPlace: clean(person?.deathPlace),
      residences,
      ...relatives,
      century: getBirthCentury(person?.birthDate),
      hasMore: !cycle && hasKnownParent && entry.generation >= requestedGenerations,
      parentChoices: parentSets.map((set) => set.choice),
      selectedParentFamilyId: selectedParentSet?.choice.familyId ?? null,
      alternateParentFamilies: Math.max(0, parentSets.length - 1),
    };
    nodes.push(node);
    if (personId !== null && !firstOccurrence.has(personId)) firstOccurrence.set(personId, key);

    if (personId === null || cycle || entry.generation >= requestedGenerations) continue;
    const nextPathIds = new Set(entry.pathIds);
    nextPathIds.add(personId);
    for (const [parentIndex, nextId] of [knownFather, knownMother].entries()) {
      if (pending.length >= maxNodes) {
        node.hasMore = true;
        truncated = true;
        break;
      }
      pending.push({
        personId: nextId,
        generation: entry.generation + 1,
        slot: entry.slot * 2 + parentIndex,
        pathIds: nextPathIds,
      });
    }
  }

  return {
    nodes, focusPersonId, requestedGenerations,
    renderedGenerations: nodes.length ? Math.max(...nodes.map((node) => node.generation)) : 0,
    truncated,
    uniquePeopleCount: firstOccurrence.size,
  };
}
