/**
 * Utilities for preparing a shared location catalog without requesting coordinates.
 * A catalog row is [the exact GEDCOM place, { lat, lon } | null].
 */

export function collectGedcomPlaces({ individuals, families }) {
  const places = new Set();
  const add = (place) => {
    if (typeof place === 'string' && place.trim()) places.add(place);
  };

  for (const person of individuals) {
    add(person.birthPlace);
    add(person.deathPlace);
    for (const event of person.events ?? []) add(event.place);
  }
  for (const family of families) {
    add(family.marriagePlace);
    for (const event of family.events ?? []) add(event.place);
  }

  return [...places].sort();
}

export function readCatalogRows(value) {
  if (!Array.isArray(value)) throw new Error('Platskatalogen måste vara en lista av [plats, koordinater]-par.');

  const rows = new Map();
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || !row[0].trim()) {
      throw new Error('Ogiltig rad i platskatalogen.');
    }
    const [place, coordinates] = row;
    if (rows.has(place)) throw new Error('Platskatalogen innehåller dubbla platser.');
    if (coordinates !== null && (
      typeof coordinates !== 'object' ||
      coordinates === null ||
      !Number.isFinite(coordinates.lat) ||
      !Number.isFinite(coordinates.lon) ||
      coordinates.lat < -90 || coordinates.lat > 90 ||
      coordinates.lon < -180 || coordinates.lon > 180
    )) {
      throw new Error('Platskatalogen innehåller ogiltiga koordinater.');
    }
    rows.set(place, coordinates === null ? null : { lat: coordinates.lat, lon: coordinates.lon });
  }
  return rows;
}

function sameCoordinates(left, right) {
  return left.lat === right.lat && left.lon === right.lon;
}

/**
 * Existing corrections take precedence. An import can only fill an empty slot.
 * Conflicting resolved values require a human edit to the existing catalog.
 */
export function buildLocationCatalog(places, existingRows, importedRows = []) {
  const existing = readCatalogRows(existingRows);
  const imported = readCatalogRows(importedRows);
  const catalog = new Map(existing);
  const uniquePlaces = new Set(places);

  for (const place of uniquePlaces) {
    if (typeof place !== 'string' || !place.trim()) throw new Error('Ogiltig GEDCOM-plats.');
  }

  let ignoredImported = 0;
  for (const [place, coordinates] of imported) {
    // Imports may originate from a browser that also opened a private GEDCOM.
    // Only publish names already present in the bundled GEDCOM or catalog.
    if (!uniquePlaces.has(place) && !existing.has(place)) {
      ignoredImported++;
      continue;
    }
    const previous = catalog.get(place);
    if (previous && coordinates && !sameCoordinates(previous, coordinates)) {
      throw new Error('Importen krockar med en redan granskad koordinat.');
    }
    if (!previous) catalog.set(place, coordinates);
  }

  for (const place of uniquePlaces) {
    if (!catalog.has(place)) catalog.set(place, null);
  }

  const rows = [...catalog.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const resolved = [...uniquePlaces].filter((place) => {
    const coordinates = catalog.get(place);
    return coordinates !== null && coordinates !== undefined;
  }).length;
  return {
    rows,
    stats: {
      gedcomPlaces: uniquePlaces.size,
      resolved,
      unresolved: uniquePlaces.size - resolved,
      catalogEntries: catalog.size,
      ignoredImported,
    },
  };
}

/** Only exact, conservative textual equivalences are considered. */
export function normalizePlace(place) {
  return place.normalize('NFC')
    .replace(/\s*\([A-ZÅÄÖ]{1,2}\)(?=\s|,|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function coordinatesKey(coords) {
  return `${coords.lat},${coords.lon}`;
}

/**
 * Count potential matches for curator review. These are never written to the
 * catalog because suffix matches only identify a broader, approximate place.
 */
export function analyzeCoverage(places, catalogRows) {
  const catalog = readCatalogRows(catalogRows);
  const normalized = new Map();
  for (const [place, coords] of catalog) {
    if (!coords) continue;
    const key = normalizePlace(place);
    const existing = normalized.get(key) ?? new Map();
    existing.set(coordinatesKey(coords), coords);
    normalized.set(key, existing);
  }

  const analysis = { exact: 0, normalized: 0, suffixCandidate: 0, ambiguous: 0, unresolved: 0 };
  for (const place of new Set(places)) {
    if (catalog.get(place)) {
      analysis.exact++;
      continue;
    }
    const key = normalizePlace(place);
    const direct = normalized.get(key);
    if (direct?.size === 1) {
      analysis.normalized++;
      continue;
    }
    if (direct?.size > 1) {
      analysis.ambiguous++;
      continue;
    }

    const parts = key.split(',').map((part) => part.trim());
    let candidate = false;
    let ambiguous = false;
    for (let start = 1; start < parts.length; start++) {
      const suffix = normalized.get(parts.slice(start).join(', '));
      if (suffix?.size === 1) candidate = true;
      if (suffix?.size > 1) ambiguous = true;
    }
    if (ambiguous) analysis.ambiguous++;
    else if (candidate) analysis.suffixCandidate++;
    else analysis.unresolved++;
  }
  return analysis;
}
