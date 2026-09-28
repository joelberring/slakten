export interface Coordinates {
    lat: number;
    lon: number;
}

export interface LocationResolution {
    cache: Map<string, Coordinates | null>;
    sources: Map<string, LocationSource>;
    /** Only places explicitly known to use a broad or uncertain point appear here. */
    precision: Map<string, LocationPrecision>;
    total: number;
    resolved: number;
    unresolved: number;
    sharedResolved: number;
    localResolved: number;
}

export type LocationSource = 'shared' | 'legacy' | 'manual' | 'missing' | 'rejected';
export type LocationPrecision = 'approximate';
export type LocationReviewStatus = 'verified' | 'uncertain' | 'incorrect' | 'corrected';

const LEGACY_CACHE_KEY = 'slakten_geocode_cache';
const MANUAL_OVERRIDES_KEY = 'slakten_location_overrides';
const REVIEW_STATUS_KEY = 'slakten_location_review_status';

// Previously published automatic matches rejected during shared-data review.
// Block only those exact old pairs; deliberate local corrections still win.
const knownWrongLegacyPoints = new Map<string, Coordinates>([
    ['Göteborg och Bohus, Sverige', { lat: 59.6749712, lon: 14.5208584 }],
    ['Linneryd (Smalland), Sweden', { lat: 59.6749712, lon: 14.5208584 }],
    ['Säfsnäs, Gällinge', { lat: 57.3955398, lon: 12.2488171 }],
    ['Linneryd, Östergård, Kronobergs län, Sverige', { lat: 56.9472915, lon: 13.7481987 }],
    ['Kristinehamn, Örebro, Sverige', { lat: 59.2747287, lon: 15.2151181 }],
    ['Skogsryd backagård Linneryd, Kronoberg, Sverige', { lat: 56.8007878, lon: 14.410897 }],
    ['Linneryds by, Kronobergs län, Sverige', { lat: 56.8007878, lon: 14.410897 }],
    ['Jönköpings Sofia (F)', { lat: 57.2986503, lon: 13.5391543 }],
    ['Nora stadsförsamling, Örebro, Sverige', { lat: 59.2747287, lon: 15.2151181 }],
    ['Säfnäs, Kopparberg, Sweden', { lat: 59.8745061, lon: 14.9903848 }],
]);

function isKnownWrongLegacyPoint(place: string, coordinates: Coordinates): boolean {
    const wrong = knownWrongLegacyPoints.get(place);
    return !!wrong && wrong.lat === coordinates.lat && wrong.lon === coordinates.lon;
}

function isCoordinates(value: unknown): value is Coordinates {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.lat === 'number'
        && Number.isFinite(candidate.lat)
        && candidate.lat >= -90
        && candidate.lat <= 90
        && typeof candidate.lon === 'number'
        && Number.isFinite(candidate.lon)
        && candidate.lon >= -180
        && candidate.lon <= 180;
}

function copyCoordinates(coords: Coordinates): Coordinates {
    return { lat: coords.lat, lon: coords.lon };
}

function getStorage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function readSavedCoordinates(key: string): Map<string, Coordinates> {
    const result = new Map<string, Coordinates>();
    try {
        const stored = getStorage()?.getItem(key);
        if (!stored) return result;
        const entries: unknown = JSON.parse(stored);
        if (!Array.isArray(entries)) return result;
        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2) continue;
            const [place, coordinates] = entry as [unknown, unknown];
            if (typeof place !== 'string' || !place.trim() || !isCoordinates(coordinates)) continue;
            result.set(place, copyCoordinates(coordinates));
        }
    } catch {
        // Private browsing, disabled storage, and damaged old JSON must not block the map.
    }
    return result;
}

function sortedCoordinates(map: ReadonlyMap<string, Coordinates>): [string, Coordinates][] {
    return [...map.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([place, coordinates]) => [place, copyCoordinates(coordinates)]);
}

function readReviewStatus(): Map<string, LocationReviewStatus> {
    const result = new Map<string, LocationReviewStatus>();
    try {
        const stored = getStorage()?.getItem(REVIEW_STATUS_KEY);
        if (!stored) return result;
        const entries: unknown = JSON.parse(stored);
        if (!Array.isArray(entries)) return result;
        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2) continue;
            const [place, status] = entry;
            if (typeof place !== 'string' || !place.trim()) continue;
            if (status === 'verified' || status === 'uncertain' || status === 'incorrect' || status === 'corrected') {
                result.set(place, status);
            }
        }
    } catch {
        // Corrupt or unavailable local storage must not interrupt the map.
    }
    return result;
}

function saveReviewStatus(): void {
    try {
        getStorage()?.setItem(REVIEW_STATUS_KEY, JSON.stringify([...reviewStatus].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
    } catch {
        // Keep the current session usable if persistence is unavailable.
    }
}

const legacyCache = readSavedCoordinates(LEGACY_CACHE_KEY);
const manualOverrides = readSavedCoordinates(MANUAL_OVERRIDES_KEY);
const reviewStatus = readReviewStatus();
let sharedCatalog = new Map<string, Coordinates | null>();
let approximateSharedPlaces = new Set<string>();

/** Replace the read-only shared catalog from locations.json. Invalid rows are skipped. */
export function hydrateGeocoderCache(entries: unknown): void {
    if (!Array.isArray(entries)) return;

    const nextCatalog = new Map<string, Coordinates | null>();
    for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [place, coordinates] = entry as [unknown, unknown];
        if (typeof place !== 'string' || !place.trim()) continue;
        if (coordinates === null) {
            nextCatalog.set(place, null);
        } else if (isCoordinates(coordinates)) {
            nextCatalog.set(place, copyCoordinates(coordinates));
        }
    }
    sharedCatalog = nextCatalog;
}

/** Optional companion rows are [exact GEDCOM place, 'approximate']; invalid rows are ignored. */
export function hydrateLocationPrecision(entries: unknown): void {
    const next = new Set<string>();
    if (Array.isArray(entries)) {
        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2) continue;
            const [place, precision] = entry as [unknown, unknown];
            if (typeof place === 'string' && place.trim() && precision === 'approximate') next.add(place);
        }
    }
    approximateSharedPlaces = next;
}

/** Look up places without network requests. Manual edits override shared data. */
export function resolvePlaces(
    places: readonly string[],
    onProgress?: (summary: LocationResolution) => void,
): LocationResolution {
    const cache = new Map<string, Coordinates | null>();
    const sources = new Map<string, LocationSource>();
    const precision = new Map<string, LocationPrecision>();
    let resolved = 0;
    let sharedResolved = 0;
    let localResolved = 0;
    for (const place of places) {
        if (typeof place !== 'string' || !place.trim() || cache.has(place)) continue;
        // Explicit null in the shared catalog means unresolved, but must not
        // hide a valid coordinate saved by an earlier visitor's browser.
        const manual = manualOverrides.get(place);
        const shared = sharedCatalog.get(place);
        const rawLegacy = legacyCache.get(place);
        const legacy = rawLegacy && !isKnownWrongLegacyPoint(place, rawLegacy) ? rawLegacy : undefined;
        const rejected = reviewStatus.get(place) === 'incorrect';
        const coordinates = rejected ? null : manual ?? shared ?? legacy ?? null;
        const source: LocationSource = rejected ? 'rejected'
            : manual ? 'manual' : shared ? 'shared' : legacy ? 'legacy' : 'missing';
        cache.set(place, coordinates ? copyCoordinates(coordinates) : null);
        sources.set(place, source);
        if (coordinates && (reviewStatus.get(place) === 'uncertain'
            || (source === 'shared' && approximateSharedPlaces.has(place)))) {
            precision.set(place, 'approximate');
        }
        if (coordinates) {
            resolved += 1;
            if (manual || !shared) localResolved += 1;
            else sharedResolved += 1;
        }
    }

    const summary = { cache, sources, precision, total: cache.size, resolved, unresolved: cache.size - resolved, sharedResolved, localResolved };
    onProgress?.({ ...summary, cache: new Map(cache), sources: new Map(sources), precision: new Map(precision) });
    return summary;
}

/** Save a deliberate map-marker correction separately from old geocoder data. */
export function updateLocationCache(place: string, coords: Coordinates): void {
    if (typeof place !== 'string' || !place.trim()) {
        throw new TypeError('Place must be a non-empty string');
    }
    if (!isCoordinates(coords)) {
        throw new RangeError('Coordinates must have valid latitude and longitude');
    }

    manualOverrides.set(place, copyCoordinates(coords));
    reviewStatus.set(place, 'corrected');
    saveReviewStatus();
    try {
        getStorage()?.setItem(MANUAL_OVERRIDES_KEY, JSON.stringify(sortedCoordinates(manualOverrides)));
    } catch {
        // A blocked or full storage still allows the current session to use the edit.
    }
}

/** Local review decisions never modify the shared catalog. Incorrect means hide this point here. */
export function setLocationReviewStatus(place: string, status: LocationReviewStatus | null): void {
    if (typeof place !== 'string' || !place.trim()) throw new TypeError('Place must be a non-empty string');
    if (status !== null && status !== 'verified' && status !== 'uncertain' && status !== 'incorrect' && status !== 'corrected') {
        throw new TypeError('Invalid review status');
    }
    if (status === null) reviewStatus.delete(place);
    else reviewStatus.set(place, status);
    saveReviewStatus();
}

export function getLocationReviewStatus(place: string): LocationReviewStatus | null {
    return reviewStatus.get(place) ?? null;
}

/** Return the candidate hidden by a local rejection for review and local export. */
export function getLocationCandidateBeforeReview(place: string): Coordinates | null {
    const coordinates = manualOverrides.get(place) ?? sharedCatalog.get(place) ?? legacyCache.get(place);
    return coordinates ? copyCoordinates(coordinates) : null;
}

/** Discard a local correction and review decision, revealing the shared/legacy value again. */
export function undoLocationReview(place: string): void {
    manualOverrides.delete(place);
    reviewStatus.delete(place);
    saveReviewStatus();
    try {
        getStorage()?.setItem(MANUAL_OVERRIDES_KEY, JSON.stringify(sortedCoordinates(manualOverrides)));
    } catch {
        // Keep the current session usable if persistence is unavailable.
    }
}

/** Explicitly export the user's manual corrections, without the shared catalog. */
export function getManualLocationOverrides(): [string, Coordinates][] {
    return sortedCoordinates(manualOverrides);
}

/** Export valid local candidates for an administrator to review offline. */
export function getLocalLocationCandidates(): [string, Coordinates][] {
    return sortedCoordinates(new Map(
        [...legacyCache, ...manualOverrides].filter(([place, coordinates]) =>
            reviewStatus.get(place) !== 'incorrect' && !isKnownWrongLegacyPoint(place, coordinates)),
    ));
}
