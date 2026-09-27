import type { Coordinates, LocationSource } from './geocoder';

export type ReviewSource = LocationSource | 'unknown';

export interface PlaceUse {
    place: string;
    uses: number;
}

export type ReviewFlagCode =
    | 'invalid-coordinate'
    | 'far-from-explicit-country'
    | 'conflicting-country-labels'
    | 'identical-coordinate-different-locality'
    | 'predefined-shared-review'
    | 'legacy-unreviewed'
    | 'rejected-coordinate'
    | 'missing-coordinate';

export interface ReviewFlag {
    code: ReviewFlagCode;
    message: string;
    /** At most three examples; the complete group is intentionally not copied to every row. */
    relatedPlaces?: string[];
    relatedCount?: number;
}

export interface LocationReviewRow {
    place: string;
    uses: number;
    coordinates: Coordinates | null;
    source: ReviewSource;
    /** Suggestions for human review, never a claim that a coordinate is wrong. */
    flags: ReviewFlag[];
    priority: number;
}

interface PlaceEvent {
    type?: string;
    place?: string | null;
}

interface IndividualPlaceRecord {
    birthPlace?: string | null;
    deathPlace?: string | null;
    events?: readonly PlaceEvent[];
}

interface FamilyPlaceRecord {
    marriagePlace?: string | null;
    events?: readonly PlaceEvent[];
}

function compareNames(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isPlace(place: unknown): place is string {
    return typeof place === 'string' && place.trim().length > 0;
}

/** Count event occurrences while avoiding the parser's duplicate summary fields. */
export function collectPlaceUses(
    individuals: readonly IndividualPlaceRecord[],
    families: readonly FamilyPlaceRecord[],
): PlaceUse[] {
    const counts = new Map<string, number>();
    const add = (place: unknown) => {
        if (!isPlace(place)) return;
        counts.set(place, (counts.get(place) ?? 0) + 1);
    };

    for (const person of individuals) {
        const events = person.events ?? [];
        for (const event of events) add(event.place);
        if (!events.some(event => event.type === 'BIRT' && event.place === person.birthPlace)) {
            add(person.birthPlace);
        }
        if (!events.some(event => event.type === 'DEAT' && event.place === person.deathPlace)) {
            add(person.deathPlace);
        }
    }

    for (const family of families) {
        const events = family.events ?? [];
        for (const event of events) add(event.place);
        if (!events.some(event => event.type === 'MARR' && event.place === family.marriagePlace)) {
            add(family.marriagePlace);
        }
    }

    return [...counts].sort(([left], [right]) => compareNames(left, right))
        .map(([place, uses]) => ({ place, uses }));
}

function validCoordinates(value: Coordinates | null | undefined): value is Coordinates {
    return value !== null && value !== undefined
        && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
        && Number.isFinite(value.lon) && value.lon >= -180 && value.lon <= 180;
}

function firstLocality(place: string): string {
    return place.split(',')[0].normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv');
}

interface CountryEnvelope {
    label: string;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

// These deliberately broad envelopes flag only conspicuously distant matches.
// They are not geographic borders and never decide whether a match is correct.
const COUNTRY_ENVELOPES: Record<string, CountryEnvelope> = {
    sverige: { label: 'Sverige', minLat: 50, maxLat: 75, minLon: -2, maxLon: 37 },
    sweden: { label: 'Sverige', minLat: 50, maxLat: 75, minLon: -2, maxLon: 37 },
    finland: { label: 'Finland', minLat: 56, maxLat: 74, minLon: 15, maxLon: 39 },
    norge: { label: 'Norge', minLat: 54, maxLat: 75, minLon: -3, maxLon: 37 },
    norway: { label: 'Norge', minLat: 54, maxLat: 75, minLon: -3, maxLon: 37 },
    danmark: { label: 'Danmark', minLat: 51, maxLat: 61, minLon: 2, maxLon: 20 },
    denmark: { label: 'Danmark', minLat: 51, maxLat: 61, minLon: 2, maxLon: 20 },
    tyskland: { label: 'Tyskland', minLat: 45, maxLat: 58, minLon: -2, maxLon: 24 },
    germany: { label: 'Tyskland', minLat: 45, maxLat: 58, minLon: -2, maxLon: 24 },
    belgium: { label: 'Belgien', minLat: 48, maxLat: 53, minLon: 1, maxLon: 8 },
    belgien: { label: 'Belgien', minLat: 48, maxLat: 53, minLon: 1, maxLon: 8 },
    belgique: { label: 'Belgien', minLat: 48, maxLat: 53, minLon: 1, maxLon: 8 },
    france: { label: 'Frankrike', minLat: 40, maxLat: 53, minLon: -7, maxLon: 11 },
    frankrike: { label: 'Frankrike', minLat: 40, maxLat: 53, minLon: -7, maxLon: 11 },
};

const COUNTRY_LABELS: Record<string, string> = {
    sverige: 'Sverige', sweden: 'Sverige', 'suède': 'Sverige',
    france: 'Frankrike', frankrike: 'Frankrike',
    belgium: 'Belgien', belgien: 'Belgien', belgique: 'Belgien',
    finland: 'Finland', finlande: 'Finland',
    norway: 'Norge', norge: 'Norge', norvège: 'Norge',
    denmark: 'Danmark', danmark: 'Danmark', danemark: 'Danmark',
    germany: 'Tyskland', tyskland: 'Tyskland', allemagne: 'Tyskland',
};

function countryToken(part: string): string {
    return part.normalize('NFKC').trim().replace(/\.$/, '').toLocaleLowerCase('sv');
}

function explicitCountry(place: string): CountryEnvelope | undefined {
    const parts = place.split(',');
    const last = countryToken(parts[parts.length - 1]);
    return COUNTRY_ENVELOPES[last];
}

function namedCountries(place: string): string[] {
    return [...new Set(place.split(',').map(part => COUNTRY_LABELS[countryToken(part)])
        .filter((value): value is string => typeof value === 'string'))];
}

function rowPriority(flags: readonly ReviewFlag[]): number {
    const codes = new Set(flags.map(flag => flag.code));
    if (codes.has('invalid-coordinate')) return 0;
    if (codes.has('predefined-shared-review')) return 0;
    if (codes.has('rejected-coordinate')) return 0;
    if (codes.has('far-from-explicit-country')) return 1;
    if (codes.has('conflicting-country-labels')) return 1;
    if (codes.has('identical-coordinate-different-locality')) return 2;
    if (codes.has('legacy-unreviewed')) return 3;
    if (codes.has('missing-coordinate')) return 4;
    return 5;
}

/** Build a deterministic queue of suggestions for manual place review. No geocoding or I/O. */
export function buildLocationReviewRows(
    placeUses: readonly PlaceUse[],
    resolved: ReadonlyMap<string, Coordinates | null>,
    sources: ReadonlyMap<string, LocationSource>,
    /** Exact place strings from a separately audited shared catalog. */
    predefinedSharedFlags: ReadonlyMap<string, readonly string[]> = new Map(),
): LocationReviewRow[] {
    const countByPlace = new Map<string, number>();
    for (const entry of placeUses) {
        if (!isPlace(entry.place) || !Number.isSafeInteger(entry.uses) || entry.uses <= 0) continue;
        countByPlace.set(entry.place, (countByPlace.get(entry.place) ?? 0) + entry.uses);
    }

    const rows: LocationReviewRow[] = [...countByPlace].map(([place, uses]) => {
        const rawCoordinates = resolved.get(place);
        const coordinates = validCoordinates(rawCoordinates)
            ? { lat: rawCoordinates.lat, lon: rawCoordinates.lon }
            : null;
        const source = sources.get(place) ?? (coordinates ? 'unknown' : 'missing');
        const flags: ReviewFlag[] = [];
        if (source === 'shared' || source === 'missing') {
            for (const note of predefinedSharedFlags.get(place) ?? []) {
                if (typeof note === 'string' && note.trim()) {
                    flags.push({ code: 'predefined-shared-review', message: note.trim() });
                }
            }
        }
        if (source === 'rejected') {
            flags.push({ code: 'rejected-coordinate', message: 'Lokalt markerad som felaktig' });
        } else if (rawCoordinates && !coordinates) {
            flags.push({ code: 'invalid-coordinate', message: 'Koordinaten är ogiltig – granska' });
        } else if (!coordinates) {
            flags.push({ code: 'missing-coordinate', message: 'Saknar koordinat – granska vid behov' });
        } else {
            const countries = namedCountries(place);
            if (countries.length > 1) {
                flags.push({
                    code: 'conflicting-country-labels',
                    message: `Platssträngen anger flera länder (${countries.join(' och ')}) – granska träffen`,
                });
            }
            const country = explicitCountry(place);
            if (country && (coordinates.lat < country.minLat || coordinates.lat > country.maxLat
                || coordinates.lon < country.minLon || coordinates.lon > country.maxLon)) {
                flags.push({
                    code: 'far-from-explicit-country',
                    message: `Koordinaten ligger långt från angivet land (${country.label}) – granska`,
                });
            }
        }
        if (source === 'legacy' && coordinates) {
            flags.push({ code: 'legacy-unreviewed', message: 'Äldre automatiskt koordinatförslag – granska' });
        }
        return { place, uses, coordinates, source, flags, priority: 5 };
    });

    const sameCoordinate = new Map<string, LocationReviewRow[]>();
    for (const row of rows) {
        if (!row.coordinates) continue;
        const key = `${row.coordinates.lat},${row.coordinates.lon}`;
        const group = sameCoordinate.get(key) ?? [];
        group.push(row);
        sameCoordinate.set(key, group);
    }
    for (const group of sameCoordinate.values()) {
        if (new Set(group.map(row => firstLocality(row.place))).size < 2) continue;
        const ordered = [...group].sort((left, right) => compareNames(left.place, right.place));
        for (const row of group) {
            const others = ordered.filter(other => firstLocality(other.place) !== firstLocality(row.place));
            row.flags.push({
                code: 'identical-coordinate-different-locality',
                message: 'Olika ortnamn har exakt samma koordinat – granska',
                relatedPlaces: others.slice(0, 3).map(other => other.place),
                relatedCount: others.length,
            });
        }
    }

    for (const row of rows) row.priority = rowPriority(row.flags);
    return rows.sort((left, right) => left.priority - right.priority
        || right.uses - left.uses
        || compareNames(left.place, right.place));
}
