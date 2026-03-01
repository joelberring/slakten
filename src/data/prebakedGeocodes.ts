import { type Coordinates } from '../utils/geocoder';

/**
 * This file contains manually corrected and pre-fetched geocoding coordinates.
 * These are used as a fallback/initial state to ensure important family locations 
 * are always correct, even if Nominatim failing or slow.
 */
export const prebakedGeocodes: Record<string, Coordinates> = {
    // Add prebaked coordinates here. 
    // Format: "Place Name": { lat: number, lon: number }
};
