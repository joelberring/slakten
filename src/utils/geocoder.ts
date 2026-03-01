export interface Coordinates {
    lat: number;
    lon: number;
}

// Load cache from localStorage on initialization
const CACHE_KEY = 'slakten_geocode_cache';
const loadCache = (): Map<string, Coordinates | null> => {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            return new Map(JSON.parse(stored));
        }
    } catch (e) {
        console.error('Failed to load geocode cache', e);
    }
    return new Map<string, Coordinates | null>();
};

const saveCache = (cache: Map<string, Coordinates | null>) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
        console.error('Failed to save geocode cache', e);
    }
};

import { prebakedGeocodes } from '../data/prebakedGeocodes';

let geocodeCache = loadCache();

// Hydrate cache with prebaked values if not already present
Object.entries(prebakedGeocodes).forEach(([place, coords]) => {
    if (!geocodeCache.has(place)) {
        geocodeCache.set(place, coords);
    }
});


/**
 * Wait for a specific number of milliseconds.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cleans Swedish place names (removes county codes in parentheses like (O), (AB)).
 */
function cleanPlaceName(place: string): string {
    return place.replace(/\s*\([A-Z]{1,2}\)/g, '').trim();
}

/**
 * Fetches coordinates for a single place name using OpenStreetMap Nominatim or Google Maps.
 * Includes a fallback retry: If "A, B, C" fails, it tries "B, C".
 */
async function fetchCoordinates(place: string, apiKey?: string): Promise<Coordinates | null> {
    const cleanedPlace = cleanPlaceName(place);

    const doFetch = async (query: string): Promise<Coordinates | null> => {
        if (apiKey) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.status === 'OK' && data.results?.[0]) {
                return {
                    lat: data.results[0].geometry.location.lat,
                    lon: data.results[0].geometry.location.lng
                };
            }
        } else {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
            const response = await fetch(url, { headers: { 'User-Agent': 'Slakten-App/1.0' } });
            if (!response.ok) return null;
            const data = await response.json();
            if (data?.[0]) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
        }
        return null;
    };

    // Try full cleaned address
    let coords = await doFetch(cleanedPlace);
    if (coords) return coords;

    // Fallback: If "Village, Parish, County" fails, try "Parish, County"
    if (cleanedPlace.includes(',')) {
        const parts = cleanedPlace.split(',').map(p => p.trim());
        if (parts.length > 1) {
            const fallbackQuery = parts.slice(1).join(', ');
            console.log(`Geocoding failed for "${cleanedPlace}", retrying with "${fallbackQuery}"`);
            coords = await doFetch(fallbackQuery);
            if (coords) return coords;
        }
    }

    return null;
}


/**
 * Geocodes an array of unique place names sequentially.
 * If apiKey is provided, it uses Google Maps at a fast rate (50ms delay).
 * If no apiKey, it uses OSM Nominatim at a strict 1-second delay.
 */
export async function geocodePlaces(
    places: string[],
    apiKey: string | undefined,
    onProgress: (resolvedCount: number, total: number, cache: Map<string, Coordinates | null>) => void
) {
    // 1. Filter out empty places and places we already have in cache
    const uniquePlaces = Array.from(new Set(places.filter(p => p.trim() !== '')));
    const placesToFetch = uniquePlaces.filter(p => !geocodeCache.has(p));

    // 2. Initial progress report with anything already cached
    let resolvedCount = uniquePlaces.length - placesToFetch.length;
    onProgress(resolvedCount, uniquePlaces.length, geocodeCache);

    if (placesToFetch.length === 0) {
        return new Map(geocodeCache);
    }

    // Determine delay based on API
    const delayMs = apiKey ? 20 : 1100; // Google allows 50 RPS (20ms). OSM requires 1 RPS (1100ms).

    // 3. Sequentially fetch the remaining places
    for (let i = 0; i < placesToFetch.length; i++) {
        const place = placesToFetch[i];
        try {
            const coords = await fetchCoordinates(place, apiKey);
            geocodeCache.set(place, coords);
        } catch (e) {
            console.error(`Failed to geocode ${place}`, e);
            if (e instanceof Error && e.message === 'OVER_QUERY_LIMIT') {
                // Stop fetching if we hit a hard limit
                saveCache(geocodeCache);
                break;
            }
            geocodeCache.set(place, null);
        }

        resolvedCount++;

        // Save to local storage every 10 items or at the end to avoid losing progress
        if (i % 10 === 0 || i === placesToFetch.length - 1) {
            saveCache(geocodeCache);
        }

        onProgress(resolvedCount, uniquePlaces.length, new Map(geocodeCache));

        if (i < placesToFetch.length - 1) {
            await delay(delayMs);
        }
    }

    return new Map(geocodeCache);
}

/**
 * Manually updates the geocode cache for a specific place and persists it.
 */
export function updateLocationCache(place: string, coords: Coordinates) {
    geocodeCache.set(place, coords);
    saveCache(geocodeCache);
}
