import type { RingColorMode } from './ringColor';

export type FamilyViewMode = 'tree' | 'map' | 'stats' | 'rings' | 'review';
export type FamilyBranchMode = 'all' | 'ancestors' | 'descendants';
export type RingDetailOption = 'dates' | 'residence' | 'children' | 'partners' | 'places';

export interface RingViewSnapshot {
  rootPersonId?: string | null;
  generations: number;
  colorMode: RingColorMode;
  zoom: number;
  pan: { x: number; y: number };
  visible: Record<RingDetailOption, boolean>;
  parentFamilyChoices?: Record<string, string>;
}

/** Only navigation and presentation state is stored; the genealogy stays in the GEDCOM file. */
export interface SavedViewState {
  viewMode: FamilyViewMode;
  personId: string | null;
  branchMode: FamilyBranchMode;
  ring?: RingViewSnapshot;
}

export interface SavedViewSnapshot extends SavedViewState {
  id: string;
  name: string;
  personName: string | null;
  datasetKey: string;
  savedAt: string;
}

const STORAGE_KEY = 'slakten_saved_views_v1';
export const MAX_SAVED_VIEWS = 30;
const VIEW_MODES = new Set<FamilyViewMode>(['tree', 'map', 'stats', 'rings', 'review']);
const BRANCH_MODES = new Set<FamilyBranchMode>(['all', 'ancestors', 'descendants']);
const COLOR_MODES = new Set<RingColorMode>(['century', 'birthRegion', 'residence', 'lifespan', 'overlap']);
const DETAIL_OPTIONS: RingDetailOption[] = ['dates', 'residence', 'children', 'partners', 'places'];

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function shortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function nullableId(value: unknown): value is string | null {
  return value === null || shortString(value, 160);
}

function boundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function readRing(value: unknown): RingViewSnapshot | null {
  const ring = object(value);
  if (!ring) return null;
  const pan = object(ring.pan);
  const visible = object(ring.visible);
  if (ring.rootPersonId !== undefined && !nullableId(ring.rootPersonId)) return null;
  if (
      !boundedNumber(ring.generations, 1, 32) ||
      !COLOR_MODES.has(ring.colorMode as RingColorMode) ||
      !boundedNumber(ring.zoom, 1, 12) ||
      !pan || !boundedNumber(pan.x, -100000, 100000) || !boundedNumber(pan.y, -100000, 100000) ||
      !visible || DETAIL_OPTIONS.some(option => typeof visible[option] !== 'boolean')) return null;

  const choices: Record<string, string> = {};
  if (ring.parentFamilyChoices !== undefined) {
    const candidate = object(ring.parentFamilyChoices);
    if (!candidate || Object.keys(candidate).length > 1000) return null;
    for (const [personId, familyId] of Object.entries(candidate)) {
      if (!shortString(personId, 160) || !shortString(familyId, 160)) return null;
      choices[personId] = familyId;
    }
  }

  return {
    ...(ring.rootPersonId !== undefined ? { rootPersonId: ring.rootPersonId } : {}),
    generations: ring.generations,
    colorMode: ring.colorMode as RingColorMode,
    zoom: ring.zoom,
    pan: { x: pan.x, y: pan.y },
    visible: Object.fromEntries(DETAIL_OPTIONS.map(option => [option, visible[option]])) as RingViewSnapshot['visible'],
    parentFamilyChoices: choices,
  };
}

function readState(value: unknown): SavedViewState | null {
  const state = object(value);
  if (!state || !VIEW_MODES.has(state.viewMode as FamilyViewMode) ||
      !nullableId(state.personId) || !BRANCH_MODES.has(state.branchMode as FamilyBranchMode)) return null;
  const ring = state.ring === undefined ? undefined : readRing(state.ring);
  if (state.ring !== undefined && !ring) return null;
  return {
    viewMode: state.viewMode as FamilyViewMode,
    personId: state.personId,
    branchMode: state.branchMode as FamilyBranchMode,
    ...(ring ? { ring } : {}),
  };
}

function readSnapshot(value: unknown): SavedViewSnapshot | null {
  const snapshot = object(value);
  if (!snapshot || !shortString(snapshot.id, 100) || !snapshot.id ||
      !shortString(snapshot.name, 80) || !snapshot.name.trim() ||
      !nullableId(snapshot.personName) ||
      !shortString(snapshot.datasetKey, 200) || !snapshot.datasetKey ||
      !shortString(snapshot.savedAt, 40) || !Number.isFinite(Date.parse(snapshot.savedAt))) return null;
  const state = readState(snapshot);
  if (!state) return null;
  return {
    id: snapshot.id,
    name: snapshot.name.trim(),
    personName: snapshot.personName,
    datasetKey: snapshot.datasetKey,
    savedAt: snapshot.savedAt,
    ...state,
  };
}

function storageKey(datasetKey: string): string {
  return `${STORAGE_KEY}:${datasetKey}`;
}

function readAll(datasetKey: string): SavedViewSnapshot[] {
  try {
    const raw = window.localStorage.getItem(storageKey(datasetKey));
    if (!raw) return [];
    const parsed = object(JSON.parse(raw));
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.slice(0, MAX_SAVED_VIEWS).map(readSnapshot)
      .filter((item): item is SavedViewSnapshot => item !== null && item.datasetKey === datasetKey);
  } catch {
    return [];
  }
}

function writeAll(datasetKey: string, items: SavedViewSnapshot[]): boolean {
  try {
    window.localStorage.setItem(storageKey(datasetKey), JSON.stringify({ version: 1, items }));
    return true;
  } catch {
    return false;
  }
}

export function readSavedViews(datasetKey: string): SavedViewSnapshot[] {
  return readAll(datasetKey)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveView(
  datasetKey: string,
  name: string,
  state: SavedViewState,
  personName: string | null,
): SavedViewSnapshot | null {
  const trimmed = name.trim().slice(0, 80);
  const safeState = readState(state);
  if (!trimmed || !shortString(datasetKey, 200) || !datasetKey || !safeState) return null;
  const item: SavedViewSnapshot = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: trimmed,
    personName: personName?.slice(0, 160) ?? null,
    datasetKey,
    savedAt: new Date().toISOString(),
    ...safeState,
  };
  const sameDataset = readSavedViews(datasetKey);
  if (sameDataset.length >= MAX_SAVED_VIEWS) return null;
  return writeAll(datasetKey, [item, ...sameDataset]) ? item : null;
}

export function renameSavedView(datasetKey: string, id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return false;
  const items = readAll(datasetKey);
  if (!items.some(item => item.datasetKey === datasetKey && item.id === id)) return false;
  return writeAll(datasetKey, items.map(item => item.id === id
    ? { ...item, name: trimmed } : item));
}

export function deleteSavedView(datasetKey: string, id: string): boolean {
  const items = readAll(datasetKey);
  return writeAll(datasetKey, items.filter(item => item.id !== id));
}
