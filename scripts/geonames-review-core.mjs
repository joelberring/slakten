import { readCatalogRows } from './location-cache-core.mjs';

const COUNTRY_NAMES = new Map([
  ['sverige', 'SE'], ['sweden', 'SE'], ['suède', 'SE'],
  ['finland', 'FI'], ['finlande', 'FI'], ['suomi', 'FI'],
  ['norge', 'NO'], ['norway', 'NO'], ['norvège', 'NO'],
  ['danmark', 'DK'], ['denmark', 'DK'],
  ['estland', 'EE'], ['estonia', 'EE'], ['estonie', 'EE'],
  ['russia', 'RU'], ['ryssland', 'RU'], ['russie', 'RU'],
  ['ukraine', 'UA'], ['ukraina', 'UA'],
  ['france', 'FR'], ['frankrike', 'FR'],
  ['germany', 'DE'], ['tyskland', 'DE'], ['deutschland', 'DE'],
  ['united states', 'US'], ['usa', 'US'],
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact name equivalence only: no fuzzy spelling, transliteration or suffix inheritance. */
export function exactNameKey(value) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv-SE');
}

function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function parseGeoNames(text) {
  const features = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue;
    const fields = line.split('\t');
    if (fields.length < 19) throw new Error(`Ogiltig GeoNames-rad ${index + 1}.`);
    const [id, name, asciiName, alternateNames, latitude, longitude, featureClass,
      featureCode, countryCode, , admin1Code, admin2Code, admin3Code, admin4Code] = fields;
    if (countryCode !== 'SE') continue;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!/^\d+$/.test(id) || !name || !featureClass || !featureCode || !validCoordinates(lat, lon)) {
      throw new Error(`Ogiltig GeoNames-rad ${index + 1}.`);
    }
    features.push({
      geonameId: Number(id), name, asciiName,
      alternateNames: alternateNames ? alternateNames.split(',') : [],
      coordinates: { lat, lon }, featureClass, featureCode, countryCode,
      admin1Code, admin2Code, admin3Code, admin4Code,
    });
  }
  return features;
}

function parseAdmin1(text) {
  const names = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const [code, name] = line.split('\t');
    if (code?.startsWith('SE.') && name) names.set(code.slice(3), name);
  }
  return names;
}

function adminKey(feature, level) {
  return [feature.admin1Code, feature.admin2Code, feature.admin3Code, feature.admin4Code]
    .slice(0, level).join('.');
}

function buildAdminNames(features, admin1Text) {
  const suppliedAdmin1 = parseAdmin1(admin1Text);
  const names = [null, new Map(), new Map(), new Map(), new Map()];
  for (const feature of features) {
    const match = /^ADM([1-4])$/.exec(feature.featureCode);
    if (feature.featureClass !== 'A' || !match) continue;
    const level = Number(match[1]);
    const key = adminKey(feature, level);
    if (!key || names[level].has(key)) continue;
    names[level].set(key, {
      name: level === 1 ? suppliedAdmin1.get(key) ?? feature.name : feature.name,
      aliases: [feature.name, feature.asciiName, ...feature.alternateNames].map(exactNameKey),
    });
  }
  for (const [code, name] of suppliedAdmin1) {
    if (!names[1].has(code)) names[1].set(code, { name, aliases: [exactNameKey(name)] });
  }
  return names;
}

function candidateContext(feature, adminNames) {
  const levels = [1, 2, 3, 4];
  return levels.map((level) => {
    const code = [feature.admin1Code, feature.admin2Code, feature.admin3Code, feature.admin4Code][level - 1];
    if (!code) return null;
    const admin = adminNames[level].get(adminKey(feature, level));
    return { code, name: admin?.name ?? null, aliases: admin?.aliases ?? [] };
  });
}

function candidateLabel(feature, context) {
  const names = [feature.name, ...context.slice().reverse().map((part) => part?.name).filter(Boolean), 'Sverige'];
  return names.filter((name, index) => index === 0 || name !== names[index - 1]).join(', ');
}

function matchingNames(feature, key) {
  if (exactNameKey(feature.name) === key) return { field: 'name', value: feature.name };
  if (feature.asciiName && exactNameKey(feature.asciiName) === key) {
    return { field: 'asciiName', value: feature.asciiName };
  }
  const alternate = feature.alternateNames.find((name) => exactNameKey(name) === key);
  return alternate ? { field: 'alternateName', value: alternate } : null;
}

function countryHints(components) {
  return [...new Set(components.slice(1)
    .map((part) => COUNTRY_NAMES.get(exactNameKey(part).replace(/[?.]+$/, '')))
    .filter(Boolean))].sort(compareText);
}

/** Count event records once and include summary fields only when their event is absent. */
export function countPlaceUses({ individuals, families }) {
  const counts = new Map();
  const add = (place) => {
    if (typeof place === 'string' && place.trim()) counts.set(place, (counts.get(place) ?? 0) + 1);
  };
  for (const person of individuals) {
    const events = person.events ?? [];
    for (const event of events) add(event.place);
    if (!events.some((event) => event.type === 'BIRT' && event.place === person.birthPlace)) add(person.birthPlace);
    if (!events.some((event) => event.type === 'DEAT' && event.place === person.deathPlace)) add(person.deathPlace);
  }
  for (const family of families) {
    const events = family.events ?? [];
    for (const event of events) add(event.place);
    if (!events.some((event) => event.type === 'MARR' && event.place === family.marriagePlace)) add(family.marriagePlace);
  }
  return counts;
}

export function buildGeoNamesReview({ gedcom, catalogRows, geonamesText, admin1Text = '' }) {
  const catalog = readCatalogRows(catalogRows);
  const uses = countPlaceUses(gedcom);
  const features = parseGeoNames(geonamesText);
  const adminNames = buildAdminNames(features, admin1Text);
  const wantedNames = new Set([...uses.keys()]
    .filter((place) => !catalog.get(place))
    .map((place) => exactNameKey(place.split(',')[0]))
    .filter(Boolean));
  const byName = new Map();
  for (const feature of features) {
    const names = new Set([feature.name, feature.asciiName, ...feature.alternateNames]
      .map(exactNameKey).filter((key) => wantedNames.has(key)));
    for (const key of names) {
      const matches = byName.get(key) ?? [];
      matches.push(feature);
      byName.set(key, matches);
    }
  }

  const places = [...uses].filter(([place]) => !catalog.get(place)).map(([place, eventUses]) => {
    const components = place.split(',').map((part) => part.trim());
    const queryName = components[0];
    const key = exactNameKey(queryName);
    const hints = countryHints(components);
    const locationContext = components.slice(1).filter((part) => {
      const key = exactNameKey(part).replace(/[?.]+$/, '');
      return key && !COUNTRY_NAMES.has(key);
    });
    const candidates = (byName.get(key) ?? []).map((feature) => {
      const context = candidateContext(feature, adminNames);
      const adminAliases = new Set(context.flatMap((part) => part?.aliases ?? []));
      const contextMatches = locationContext.filter((part) => adminAliases.has(exactNameKey(part))).length;
      const unmatchedContext = locationContext.filter((part) => !adminAliases.has(exactNameKey(part)));
      const [admin1, admin2, admin3, admin4] = context.map((part) => part && { code: part.code, name: part.name });
      return {
        sourceId: `geonames:${feature.geonameId}`,
        geonameId: feature.geonameId,
        name: feature.name,
        matchedName: matchingNames(feature, key),
        label: candidateLabel(feature, context),
        featureClass: feature.featureClass,
        featureCode: feature.featureCode,
        countryCode: feature.countryCode,
        admin1, admin2, admin3, admin4,
        coordinates: feature.coordinates,
        contextMatches, unmatchedContext,
      };
    }).sort((left, right) => right.contextMatches - left.contextMatches || left.geonameId - right.geonameId);
    return {
      place, eventUses, queryName, countryHints: hints,
      countryMismatch: hints.some((country) => country !== 'SE'),
      ambiguityCount: candidates.length,
      candidates,
    };
  }).sort((left, right) => right.eventUses - left.eventUses || compareText(left.place, right.place));

  return {
    schemaVersion: 1,
    source: { name: 'GeoNames', countryCode: 'SE', license: 'CC BY 4.0', url: 'https://www.geonames.org/' },
    summary: {
      unresolvedPlaces: places.length,
      placesWithCandidates: places.filter((place) => place.ambiguityCount > 0).length,
      placesWithoutCandidates: places.filter((place) => place.ambiguityCount === 0).length,
      countryMismatchesWithCandidates: places.filter((place) => place.countryMismatch && place.ambiguityCount > 0).length,
    },
    places,
  };
}
