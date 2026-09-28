import { useEffect, useState, useMemo, useCallback, type CSSProperties } from 'react';
import { MapContainer, TileLayer, GeoJSON, Pane, Marker, Popup, Polyline, Tooltip, CircleMarker, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { type Coordinates, type LocationSource, type LocationPrecision, type LocationReviewStatus } from '../utils/geocoder';
import { extractYear } from '../utils/dateUtils';
import { type FamilySide } from '../utils/relationship';
import { buildLocationReviewRows, collectPlaceUses } from '../utils/locationReview';
import { sharedLocationReviewFlags } from '../data/locationReviewFlags';
import { LocationReviewPanel } from './LocationReviewPanel';

interface Props {
    individuals: any[];
    families: any[];
    sideMap: Map<string, FamilySide>;
    generationMap: Map<string, number>;
    locationsCache: Map<string, Coordinates | null>;
    locationSources: Map<string, LocationSource>;
    locationPrecision: ReadonlyMap<string, LocationPrecision>;
    coverage: { resolved: number, total: number, sharedResolved: number, localResolved: number };
    catalogAvailable: boolean;
    onLocationUpdate?: (place: string, coords: Coordinates) => void;
    onReviewStatusUpdate?: (place: string, status: LocationReviewStatus | null) => void;
    onLocationUndo?: (place: string) => void;
    onShowInTree?: (id: string) => void;
    selectedPersonId?: string | null;
    visiblePersonIds?: Set<string> | null;
    onSelectPerson?: (id: string) => void;
    readOnly?: boolean;
    active?: boolean;
}

interface PlaceEvent {
    type: string;
    date?: string;
    place?: string;
}

interface PersonTrailEvent {
    type: string;
    date?: string;
    place: string;
    year: number | null;
    coords: Coordinates | null;
    precision?: LocationPrecision;
}

interface IndividualPlaces {
    events?: PlaceEvent[];
    birthPlace?: string;
    birthDate?: string;
    deathPlace?: string;
    deathDate?: string;
}

interface FamilyPlaces {
    events?: PlaceEvent[];
    marriagePlace?: string;
    marriageDate?: string;
}

function individualPlaceEvents(individual: IndividualPlaces): PlaceEvent[] {
    const events: PlaceEvent[] = [...(individual.events || [])];
    if (individual.birthPlace && !events.some(event => event.type === 'BIRT' && event.place === individual.birthPlace)) {
        events.push({ type: 'BIRT', date: individual.birthDate, place: individual.birthPlace });
    }
    if (individual.deathPlace && !events.some(event => event.type === 'DEAT' && event.place === individual.deathPlace)) {
        events.push({ type: 'DEAT', date: individual.deathDate, place: individual.deathPlace });
    }
    return events.filter(event => Boolean(event.place?.trim()));
}

function familyPlaceEvents(family: FamilyPlaces): PlaceEvent[] {
    const events: PlaceEvent[] = [...(family.events || [])];
    if (family.marriagePlace && !events.some(event => event.type === 'MARR' && event.place === family.marriagePlace)) {
        events.push({ type: 'MARR', date: family.marriageDate, place: family.marriagePlace });
    }
    return events.filter(event => Boolean(event.place?.trim()));
}

const EVENT_LABELS: Record<string, string> = {
    BIRT: 'Födelse', DEAT: 'Död', MARR: 'Vigsel', DIV: 'Skilsmässa',
    RESI: 'Bostad', CHR: 'Dop', BAPM: 'Dop', BURI: 'Begravning',
    OCCU: 'Yrke', GRAD: 'Examen',
};

function eventLabel(type: string): string {
    return EVENT_LABELS[type] || type;
}

// A partial date such as "19" is not a usable year on the map timeline.
function mapYear(date?: string): number | null {
    const year = extractYear(date);
    return year !== null && year >= 1000 && year <= 2099 ? year : null;
}

const SIDE_COLORS: Record<FamilySide, string> = {
    father: '#4c7183',
    mother: '#a56a57',
    both: '#786a8c',
    none: '#aa864b',
};

const mapButtonStyle: CSSProperties = {
    minHeight: 35,
    padding: '7px 10px',
    border: '1px solid #cdbfa8',
    borderRadius: 8,
    background: '#fffefa',
    color: '#30473f',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '0.74rem',
    fontWeight: 700,
};

const mapSurfaceStyles = `
    .family-map-shell { color: #233a36; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .family-map-shell *, .family-map-shell *::before, .family-map-shell *::after { box-sizing: border-box; }
    .family-map-shell .leaflet-container { font: inherit; }
    .family-map-shell .leaflet-popup-content-wrapper,
    .family-map-shell .leaflet-popup-tip { background: #fffdf8 !important; color: #233a36 !important; border-color: #d7cab5 !important; }
    .family-map-shell .leaflet-popup-content-wrapper { box-shadow: 0 16px 36px rgba(46, 43, 32, 0.16); }
    .family-map-shell .leaflet-control-zoom { overflow: hidden; border: 1px solid #cdbfa8; border-radius: 9px; box-shadow: 0 5px 18px rgba(46, 43, 32, 0.16); }
    .family-map-shell .leaflet-control-zoom a { background: #fffdf8; color: #30473f; border-bottom-color: #e4d9c7; }
    .family-map-shell .leaflet-control-zoom a:hover { background: #f2e9d9; color: #233a36; }
    .family-map-shell .leaflet-control-attribution { background: rgba(255, 253, 248, 0.88); color: #64716b; }
    .family-map-shell button:focus-visible, .family-map-shell input:focus-visible, .family-map-shell select:focus-visible { outline: 3px solid #bc8a62; outline-offset: 2px; }
    .family-map-shell .map-period-control { display: grid; gap: 8px; }
    .family-map-shell .map-period-control label { display: grid; gap: 3px; color: #40534d; font-size: 0.7rem; font-weight: 700; }
    .family-map-shell .map-period-control input[type="range"] { width: 100%; margin: 0; accent-color: #315249; }
    .family-map-shell .map-period-control .map-undated-choice { display: flex; align-items: center; gap: 7px; font-size: 0.69rem; font-weight: 500; }
    .family-map-shell .map-person-trail { position: absolute; left: 16px; bottom: 16px; z-index: 950; width: min(360px, calc(100% - 84px)); max-height: min(47%, 390px); overflow: auto; padding: 13px 15px; border: 1px solid #d7cab5; border-radius: 12px; background: rgba(255, 253, 248, 0.97); box-shadow: 0 12px 30px rgba(46, 43, 32, 0.16); }
    .family-map-shell .map-person-trail ol { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 8px; }
    .family-map-shell .map-person-trail li { padding-left: 11px; border-left: 3px solid #9d634b; line-height: 1.35; font-size: 0.72rem; }
    .family-map-shell .map-person-trail li strong { color: #233a36; }
    @media (max-width: 768px) {
        .family-map-shell .map-legend { right: 14px !important; top: 14px !important; width: auto !important; min-width: 0 !important; max-width: min(300px, calc(100% - 28px)) !important; padding: 8px !important; max-height: calc(100% - 28px) !important; }
        .family-map-shell .map-legend.open { width: min(300px, calc(100% - 28px)) !important; max-height: min(58%, 380px) !important; overflow-y: auto !important; padding: 14px !important; }
        .family-map-shell .map-legend.open ~ .location-review-panel { display: none; }
        .family-map-shell .family-map-coverage { bottom: 64px !important; max-width: calc(100% - 84px) !important; padding: 9px 11px !important; }
        .family-map-shell .map-person-trail { bottom: 64px; width: min(330px, calc(100% - 84px)); max-height: min(38%, 260px); padding: 9px 11px; }
        .family-map-shell .leaflet-control-zoom { margin-bottom: 33px; }
    }
`;

function MapVisibility({ active }: { active: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (!active) return;
        const frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
        return () => window.cancelAnimationFrame(frame);
    }, [map, active]);
    return null;
}

function FocusSelectedTrail({ active, personId, positions }: {
    active: boolean;
    personId: string | null;
    positions: [number, number][];
}) {
    const map = useMap();
    useEffect(() => {
        if (!active || !personId || positions.length === 0) return;
        const bounds = L.latLngBounds(positions);
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
            map.setView(positions[0], Math.max(map.getZoom(), 8), { animate: false });
        } else {
            map.fitBounds(bounds, { padding: [44, 44], maxZoom: 9, animate: false });
        }
    }, [active, map, personId, positions]);
    return null;
}

function MapReviewControls({
    selectedPlace,
    selectedCoordinates,
    pickingPlace,
    onPick,
}: {
    selectedPlace: string | null;
    selectedCoordinates: Coordinates | null;
    pickingPlace: string | null;
    onPick: (place: string, coordinates: Coordinates) => void;
}) {
    const map = useMap();
    const selectedLat = selectedCoordinates?.lat;
    const selectedLon = selectedCoordinates?.lon;
    useMapEvents({
        click(event) {
            if (pickingPlace) onPick(pickingPlace, { lat: event.latlng.lat, lon: event.latlng.lng });
        },
    });
    useEffect(() => {
        if (selectedPlace && selectedLat !== undefined && selectedLon !== undefined) {
            map.setView([selectedLat, selectedLon], Math.max(map.getZoom(), 9), { animate: false });
        }
    }, [map, selectedPlace, selectedLat, selectedLon]);
    return selectedCoordinates ? (
        <CircleMarker
            center={[selectedCoordinates.lat, selectedCoordinates.lon]}
            radius={16}
            pathOptions={{ color: '#95573e', weight: 3, fillOpacity: 0.08 }}
            interactive={false}
        />
    ) : null;
}


/**
 * Returns a custom Leaflet DivIcon with a color based on density and family side.
 */
function getMarkerIcon(count: number, side: FamilySide, approximate: boolean): L.DivIcon {
    const color = SIDE_COLORS[side];
    // Increased base size and scaling factor
    const size = Math.min(50, 32 + Math.floor(Math.sqrt(count) * 4));

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C16.5 18 20 14.5 20 10C20 5.58172 16.4183 2 12 2C7.58172 2 4 5.58172 4 10C4 14.5 7.5 18 12 22Z" 
                    fill="${color}" stroke="${approximate ? '#5d392c' : '#fffdf8'}" stroke-width="${approximate ? 2 : 1.5}" ${approximate ? 'stroke-dasharray="2 1.2"' : ''}/>
                <circle cx="12" cy="10" r="4.5" fill="#fffdf8" fill-opacity="0.95"/>
                ${count > 1 ? `<text x="12" y="11.5" font-size="10" font-family="Inter, Arial" fill="#233a36" text-anchor="middle" font-weight="800">${count}</text>` : ''}
            </svg>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [0, -size]
    });
}


// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export function FamilyMap({
    individuals,
    families,
    sideMap,
    generationMap,
    locationsCache,
    locationSources,
    locationPrecision,
    coverage,
    catalogAvailable,
    onLocationUpdate,
    onReviewStatusUpdate,
    onLocationUndo,
    onShowInTree,
    selectedPersonId = null,
    visiblePersonIds = null,
    onSelectPerson,
    readOnly,
    active = true,
}: Props) {


    const [showPaths, setShowPaths] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [overviewLand, setOverviewLand] = useState<FeatureCollection | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        fetch('ne_110m_land.geojson', { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Overview map unavailable');
                return response.json() as Promise<FeatureCollection>;
            })
            .then(data => setOverviewLand(data))
            .catch(error => {
                if (!controller.signal.aborted) console.warn('Could not load the local overview map:', error);
            });
        return () => controller.abort();
    }, []);
    const [selectedGenerations, setSelectedGenerations] = useState<Set<number | 'unconnected'>>(() => {
        const initial = new Set<number | 'unconnected'>(generationMap.values());
        if (individuals.some(ind => !generationMap.has(ind.id))) initial.add('unconnected');
        return initial;
    });
    const [visibleSides, setVisibleSides] = useState<Set<FamilySide>>(new Set(['father', 'mother', 'both', 'none']));
    const [isLegendOpen, setIsLegendOpen] = useState(window.innerWidth > 768);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [selectedReviewPlace, setSelectedReviewPlace] = useState<string | null>(null);
    const [pickingPlace, setPickingPlace] = useState<string | null>(null);
    const [period, setPeriod] = useState<[number, number] | null>(null);
    const [showUndated, setShowUndated] = useState(true);
    const [trailOpen, setTrailOpen] = useState(window.innerWidth > 768);

    useEffect(() => {
        if (!active || !selectedPersonId) return;
        setTrailOpen(true);
        if (window.innerWidth <= 768) setIsLegendOpen(false);
    }, [active, selectedPersonId]);

    const yearBounds = useMemo(() => {
        const years: number[] = [];
        individuals.forEach(ind => {
            if (visiblePersonIds && !visiblePersonIds.has(ind.id)) return;
            individualPlaceEvents(ind).forEach(event => {
                const year = mapYear(event.date);
                if (year !== null) years.push(year);
            });
        });
        families.forEach(fam => {
            if (visiblePersonIds && ![fam.husb, fam.wife].some(id => id && visiblePersonIds.has(id))) return;
            familyPlaceEvents(fam).forEach(event => {
                const year = mapYear(event.date);
                if (year !== null) years.push(year);
            });
        });
        return years.length > 0 ? { min: Math.min(...years), max: Math.max(...years) } : null;
    }, [individuals, families, visiblePersonIds]);
    const fromYear = yearBounds ? Math.max(yearBounds.min, Math.min(period?.[0] ?? yearBounds.min, yearBounds.max)) : null;
    const toYear = yearBounds ? Math.max(fromYear ?? yearBounds.min, Math.min(period?.[1] ?? yearBounds.max, yearBounds.max)) : null;
    const eventVisible = useCallback((date?: string) => {
        const year = mapYear(date);
        if (year === null) return showUndated;
        return fromYear !== null && toYear !== null && year >= fromYear && year <= toYear;
    }, [fromYear, toYear, showUndated]);

    useEffect(() => {
        const mobile = window.matchMedia('(max-width: 768px)');
        const followViewport = (event: MediaQueryListEvent) => setIsLegendOpen(!event.matches);
        mobile.addEventListener('change', followViewport);
        return () => mobile.removeEventListener('change', followViewport);
    }, []);

    const setReviewPanelOpen = (open: boolean) => {
        setReviewOpen(open);
        if (open && window.innerWidth <= 768) setIsLegendOpen(false);
    };

    const reviewPlaceUses = useMemo(() => reviewOpen ? collectPlaceUses(individuals, families) : [],
        [reviewOpen, individuals, families]);
    const reviewRows = useMemo(() => reviewOpen ? buildLocationReviewRows(
        reviewPlaceUses, locationsCache, locationSources, sharedLocationReviewFlags,
    ) : [], [reviewOpen, reviewPlaceUses, locationsCache, locationSources]);
    const individualsById = useMemo(() => new Map(individuals.map(ind => [ind.id, ind])), [individuals]);
    const selectedReviewCoordinates = selectedReviewPlace ? locationsCache.get(selectedReviewPlace) ?? null : null;
    const selectedPerson = selectedPersonId && (!visiblePersonIds || visiblePersonIds.has(selectedPersonId))
        ? individualsById.get(selectedPersonId)
        : null;
    const selectedTrail = useMemo(() => {
        if (!selectedPersonId || !selectedPerson) return [];
        const raw: PlaceEvent[] = [
            ...individualPlaceEvents(selectedPerson),
            ...families
                .filter(fam => fam.husb === selectedPersonId || fam.wife === selectedPersonId)
                .flatMap(familyPlaceEvents),
        ];
        const seen = new Set<string>();
        const events: PersonTrailEvent[] = [];
        raw.forEach(event => {
            if (!event.place || !eventVisible(event.date)) return;
            const key = `${event.type}\u0000${event.date || ''}\u0000${event.place}`;
            if (seen.has(key)) return;
            seen.add(key);
            events.push({
                type: event.type,
                date: event.date,
                place: event.place,
                year: mapYear(event.date),
                coords: locationsCache.get(event.place) ?? null,
                precision: locationsCache.get(event.place) ? locationPrecision.get(event.place) : undefined,
            });
        });
        return events.sort((a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY));
    }, [selectedPersonId, selectedPerson, families, locationsCache, locationPrecision, eventVisible]);
    const selectedTrailPositions = useMemo(() => selectedTrail
        .filter(event => event.coords && event.year !== null)
        .map(event => [event.coords!.lat, event.coords!.lon] as [number, number])
        .filter((position, index, positions) => index === 0 || position[0] !== positions[index - 1][0] || position[1] !== positions[index - 1][1]),
    [selectedTrail]);

    const toggleSide = (side: FamilySide) => {
        const next = new Set(visibleSides);
        if (next.has(side)) {
            next.delete(side);
        } else {
            next.add(side);
        }
        setVisibleSides(next);
    };


    const availableGenerations = useMemo(() => {
        const gens = new Set<number>();
        generationMap.forEach(g => gens.add(g));

        let hasUnconnected = false;
        individuals.forEach(ind => {
            if (!generationMap.has(ind.id)) hasUnconnected = true;
        });

        const sorted = Array.from(gens).sort((a, b) => b - a);
        const result: (number | 'unconnected')[] = [...sorted];
        if (hasUnconnected) result.push('unconnected');
        return result;
    }, [generationMap, individuals]);

    useEffect(() => {
        if (selectedGenerations.size === 0 && availableGenerations.length > 0) {
            const initial = new Set<number | 'unconnected'>();
            availableGenerations.forEach(g => initial.add(g));
            setSelectedGenerations(initial);
        }
    }, [availableGenerations]);

    const toggleGeneration = (gen: number | 'unconnected') => {
        const next = new Set(selectedGenerations);
        if (next.has(gen)) {
            next.delete(gen);
        } else {
            next.add(gen);
        }
        setSelectedGenerations(next);
    };

    const getGenLabel = (gen: number | 'unconnected') => {
        if (gen === 'unconnected') return "Okopplade";
        if (gen === 1) return "Gen 1 (Rötter)";
        if (gen === 2) return "Gen 2 (Föräldrar)";
        if (gen === 3) return "Gen 3 (Far/Mor-f)";
        if (gen > 3) return `Gen ${gen}`;
        if (gen <= 0) return `Barn/Barnbarn (${gen})`;
        return `Gen ${gen}`;
    };

    const markers = useMemo(() => {
        const groups = new Map<string, { coords: Coordinates, people: any[], placeName: string, side: FamilySide, allPlaces: Set<string> }>();
        const hasGenFilter = selectedGenerations.size > 0;

        individuals.forEach(ind => {
            if (visiblePersonIds && !visiblePersonIds.has(ind.id)) return;
            const gen = generationMap.get(ind.id) ?? 'unconnected';
            if (hasGenFilter && !selectedGenerations.has(gen)) return;

            const allEvents = individualPlaceEvents(ind);

            allEvents.forEach(event => {
                if (!eventVisible(event.date)) return;
                const personSide = sideMap.get(ind.id) || 'none';
                if (!visibleSides.has(personSide)) return;
                const coords = locationsCache.get(event.place!);

                if (coords) {
                    const lat = coords.lat.toFixed(2);
                    const lon = coords.lon.toFixed(2);
                    const clusterKey = `${lat},${lon}`;

                    if (!groups.has(clusterKey)) {
                        groups.set(clusterKey, {
                            coords,
                            people: [],
                            placeName: event.place!,
                            side: 'none',
                            allPlaces: new Set([event.place!])
                        });
                    }

                    const group = (groups.get(clusterKey) as any)!;
                    group.allPlaces.add(event.place);

                    if (!group.people.some((p: any) => p.id === ind.id && p.eventType === event.type && p.place === event.place && p.eventDate === event.date)) {

                        group.people.push({
                            ...ind,
                            id: ind.id,
                            name: ind.name,
                            birthDate: ind.birthDate,
                            deathDate: ind.deathDate,
                            eventType: event.type,
                            place: event.place,
                            eventDate: event.date,
                            personIds: [ind.id],
                            side: personSide,
                            year: mapYear(event.date),
                            gen: gen
                        });

                        if (group.side === 'none') group.side = personSide;
                        else if (group.side !== personSide && personSide !== 'none') {
                            if ((group.side === 'father' && personSide === 'mother') ||
                                (group.side === 'mother' && personSide === 'father')) {
                                group.side = 'both';
                            }
                        }
                    }
                }
            });
        });

        families.forEach(fam => {
            if (visiblePersonIds && ![fam.husb, fam.wife].some(id => id && visiblePersonIds.has(id))) return;
            const husbGen = fam.husb ? generationMap.get(fam.husb) : undefined;
            const wifeGen = fam.wife ? generationMap.get(fam.wife) : undefined;
            let maxGen: number | 'unconnected' = 'unconnected';
            if (husbGen !== undefined || wifeGen !== undefined) {
                maxGen = Math.max(husbGen ?? -999, wifeGen ?? -999);
            }
            if (hasGenFilter && !selectedGenerations.has(maxGen)) return;

            const allEvents = familyPlaceEvents(fam);

            allEvents.forEach(event => {
                if (!eventVisible(event.date)) return;
                const husbSide = fam.husb ? (sideMap.get(fam.husb) || 'none') : 'none';
                const wifeSide = fam.wife ? (sideMap.get(fam.wife) || 'none') : 'none';

                let famSide: FamilySide = 'none';
                if (husbSide === 'both' || wifeSide === 'both' || (husbSide === 'father' && wifeSide === 'mother') || (husbSide === 'mother' && wifeSide === 'father')) {
                    famSide = 'both';
                } else if (husbSide === 'father' || wifeSide === 'father') {
                    famSide = 'father';
                } else if (husbSide === 'mother' || wifeSide === 'mother') {
                    famSide = 'mother';
                }
                if (!visibleSides.has(famSide)) return;
                const coords = locationsCache.get(event.place!);

                if (coords) {
                    const lat = coords.lat.toFixed(2);
                    const lon = coords.lon.toFixed(2);
                    const clusterKey = `${lat},${lon}`;

                    if (!groups.has(clusterKey)) {
                        groups.set(clusterKey, {
                            coords,
                            people: [],
                            placeName: event.place!,
                            side: 'none',
                            allPlaces: new Set([event.place!])
                        });
                    }

                    const husb = individualsById.get(fam.husb);
                    const wife = individualsById.get(fam.wife);
                    const name = `${husb?.name || '?'} & ${wife?.name || '?'}`;

                    const group = (groups.get(clusterKey) as any)!;
                    group.allPlaces.add(event.place);
                    group.people.push({
                        id: fam.id,
                        name,
                        eventType: event.type,
                        place: event.place,
                        date: event.date,
                        personIds: [fam.husb, fam.wife].filter((id: string | undefined) => id && (!visiblePersonIds || visiblePersonIds.has(id))),
                        side: famSide,
                        year: mapYear(event.date),
                        gen: maxGen
                    });

                    if (group.side === 'none') group.side = famSide;
                    else if (group.side !== famSide && famSide !== 'none') {
                        if ((group.side === 'father' && famSide === 'mother') ||
                            (group.side === 'mother' && famSide === 'father')) {
                            group.side = 'both';
                        }
                    }
                }
            });
        });

        const finalMarkers = Array.from(groups.values())
            .filter(g => g.people.length > 0)
            .map(g => {
                const places = Array.from(g.allPlaces);
                return {
                    ...g,
                    approximatePlaces: places.filter(place => locationPrecision.get(place) === 'approximate'),
                    placeName: places.length > 2 ? `${places[0]} (+${places.length - 1} fler)` : places.join(' / ')
                };
            });

        return finalMarkers;

    }, [individuals, individualsById, families, locationsCache, locationPrecision, selectedGenerations, sideMap, visibleSides, generationMap, visiblePersonIds, eventVisible]);
    const visibleEventCount = markers.reduce((count, marker) => count + marker.people.length, 0);
    const visibleUndatedCount = markers.reduce((count, marker) => count + marker.people.filter(person => person.year === null).length, 0);


    const migrationPaths = useMemo(() => {
        if (!showPaths) return [];
        const paths: { positions: [number, number][], name: string, side: FamilySide }[] = [];
        const hasGenFilter = selectedGenerations.size > 0;

        individuals.forEach(ind => {
            if (visiblePersonIds && !visiblePersonIds.has(ind.id)) return;
            const gen = generationMap.get(ind.id) ?? 'unconnected';
            if (hasGenFilter && !selectedGenerations.has(gen)) return;

            const points: { coords: [number, number], year: number | null }[] = [];
            const allIndividualEvents = individualPlaceEvents(ind);

            families.forEach(fam => {
                if (fam.husb === ind.id || fam.wife === ind.id) {
                    allIndividualEvents.push(...familyPlaceEvents(fam));
                }
            });

            allIndividualEvents
                .filter(event => eventVisible(event.date))
                .map((e: any) => ({
                    ...e,
                    year: mapYear(e.date),
                    coords: locationsCache.get(e.place)
                }))
                .filter((e: any) => e.coords)
                .sort((a: any, b: any) => (a.year || 0) - (b.year || 0))
                .forEach((e: any) => {
                    points.push({ coords: [e.coords!.lat, e.coords!.lon], year: e.year });
                });

            if (points.length > 1) {
                paths.push({
                    positions: points.map(p => p.coords),
                    name: ind.name,
                    side: sideMap.get(ind.id) || 'none'
                });
            }
        });
        return paths.filter(p => visibleSides.has(p.side));
    }, [individuals, families, locationsCache, showPaths, selectedGenerations, sideMap, visibleSides, generationMap, visiblePersonIds, eventVisible]);

    const familyLinks = useMemo(() => {
        if (!showConnections) return [];
        const links: { positions: [number, number][], side: FamilySide, label: string }[] = [];
        const hasGenFilter = selectedGenerations.size > 0;

        families.forEach(fam => {
            if (visiblePersonIds && ![fam.husb, fam.wife].some(id => id && visiblePersonIds.has(id))) return;
            // Determine Parent Anchor
            let parentCoords: Coordinates | null = null;
            if (fam.marriagePlace) {
                parentCoords = locationsCache.get(fam.marriagePlace) || null;
            }
            if (!parentCoords && fam.husb) {
                const husb = individuals.find(i => i.id === fam.husb);
                if (husb) {
                    parentCoords = (husb.birthPlace ? locationsCache.get(husb.birthPlace) : null) ||
                        (husb.deathPlace ? locationsCache.get(husb.deathPlace) : null) || null;
                }
            }
            if (!parentCoords && fam.wife) {
                const wife = individuals.find(i => i.id === fam.wife);
                if (wife) {
                    parentCoords = (wife.birthPlace ? locationsCache.get(wife.birthPlace) : null) ||
                        (wife.deathPlace ? locationsCache.get(wife.deathPlace) : null) || null;
                }
            }

            if (!parentCoords) return;

            fam.children.forEach((childId: string) => {
                if (visiblePersonIds && !visiblePersonIds.has(childId)) return;
                const child = individuals.find(i => i.id === childId);
                if (!child) return;
                if (!eventVisible(child.birthDate)) return;

                const childGen = generationMap.get(childId) ?? 'unconnected';
                if (hasGenFilter && !selectedGenerations.has(childGen)) return;

                const childSide = sideMap.get(childId) || 'none';
                if (!visibleSides.has(childSide)) return;

                const childCoords = (child.birthPlace ? locationsCache.get(child.birthPlace) : null);
                if (childCoords) {
                    links.push({
                        positions: [[parentCoords!.lat, parentCoords!.lon], [childCoords.lat, childCoords.lon]],
                        side: childSide,
                        label: `${child.name}`
                    });
                }
            });
        });

        return links;
    }, [individuals, families, locationsCache, showConnections, selectedGenerations, sideMap, visibleSides, generationMap, visiblePersonIds, eventVisible]);


    return (
        <div className="family-map-shell" style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative', overflow: 'hidden', background: '#e0e8e3' }}>
            <style>{mapSurfaceStyles}</style>
            {coverage.total > 0 && !selectedPerson && !pickingPlace && !reviewOpen && (
                <div role="status" className="family-map-coverage" style={{
                    position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
                    width: 'min(370px, calc(100% - 32px))', padding: '12px 15px',
                    borderRadius: 12, border: '1px solid #d7cab5',
                    background: 'rgba(255, 253, 248, 0.97)',
                    boxShadow: '0 8px 25px rgba(46, 43, 32, 0.13)', lineHeight: 1.35,
                }}>
                    <span style={{ display: 'block', color: '#95573e', fontSize: '0.61rem', fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase' }}>Platsöversikt</span>
                    <strong style={{ display: 'block', marginTop: 3, color: '#233a36', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.06rem', fontWeight: 600 }}>
                        {coverage.resolved} av {coverage.total} platser på kartan
                    </strong>
                    {coverage.resolved < coverage.total && <span style={{ display: 'block', marginTop: 3, color: '#64716b', fontSize: '0.69rem' }}>{coverage.total - coverage.resolved} saknar koordinater.</span>}
                    {coverage.localResolved > 0 && <span style={{ display: 'block', marginTop: 3, color: '#64716b', fontSize: '0.69rem' }}>{coverage.sharedResolved} gemensamma · {coverage.localResolved} bara i din webbläsare</span>}
                    {!catalogAvailable && <span style={{ display: 'block', marginTop: 4, color: '#95573e', fontSize: '0.69rem' }}>Den gemensamma platskatalogen kunde inte läsas.</span>}
                </div>
            )}

            {selectedPerson && !pickingPlace && !reviewOpen && (
                <aside className="map-person-trail" aria-label={`Platser för ${selectedPerson.name}`}>
                    <button type="button" aria-expanded={trailOpen} onClick={() => setTrailOpen(open => !open)}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
                            padding: 0, border: 0, background: 'transparent', color: '#233a36', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                        <span>
                            <span style={{ display: 'block', color: '#95573e', fontSize: '0.61rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>En persons platser</span>
                            <strong style={{ display: 'block', marginTop: 3, fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.1rem', fontWeight: 600 }}>{selectedPerson.name}</strong>
                        </span>
                        <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>{trailOpen ? '−' : '+'}</span>
                    </button>
                    {trailOpen && <>
                        <p style={{ margin: '5px 0 0', color: '#65736b', fontSize: '0.69rem' }}>
                            {selectedTrail.length} {selectedTrail.length === 1 ? 'händelse' : 'händelser'} · {selectedTrail.filter(event => event.coords).length} med kartpunkt
                        </p>
                        {selectedTrail.length > 0 ? <ol>
                            {selectedTrail.map((event, index) => <li key={`${event.type}-${event.date}-${event.place}-${index}`}>
                                <strong>{event.year ?? 'Okänt år'} · {eventLabel(event.type)}</strong><br />
                                {event.place}
                                {event.precision === 'approximate' && <span style={{ display: 'block', color: '#754b37', fontWeight: 700 }}>Ungefärlig plats</span>}
                                {!event.coords && <span style={{ display: 'block', color: '#95573e' }}>Saknar kartpunkt</span>}
                            </li>)}
                        </ol> : <p style={{ margin: '10px 0 0', color: '#65736b', fontSize: '0.72rem' }}>Inga platshändelser under perioden.</p>}
                        {selectedTrailPositions.length > 1 && <p style={{ margin: '9px 0 0', color: '#65736b', fontSize: '0.64rem', lineHeight: 1.35 }}>Linjen förbinder daterade platser efter årtal och visar inte den faktiska resvägen.</p>}
                        {onShowInTree && <button type="button" onClick={() => onShowInTree(selectedPersonId!)} style={{ ...mapButtonStyle, marginTop: 10, minHeight: 29, padding: '4px 8px' }}>Visa i släktträdet</button>}
                    </>}
                </aside>
            )}

            <aside aria-label="Kartfilter" className={`map-legend ${isLegendOpen ? 'open' : ''}`} style={{
                position: 'absolute', top: 16, right: 16, zIndex: 1000,
                width: 260, maxHeight: 'calc(100% - 32px)', overflowY: isLegendOpen ? 'auto' : 'visible',
                padding: isLegendOpen ? 15 : 7, borderRadius: 13,
                border: '1px solid #d7cab5', background: 'rgba(255, 253, 248, 0.97)',
                boxShadow: '0 12px 32px rgba(46, 43, 32, 0.15)',
            }}>
                <button type="button" aria-expanded={isLegendOpen} onClick={() => {
                    const next = !isLegendOpen;
                    setIsLegendOpen(next);
                    if (next && window.innerWidth <= 768) setReviewOpen(false);
                }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        width: '100%', border: 0, borderRadius: 7, padding: isLegendOpen ? '1px 0 12px' : '6px 8px',
                        background: 'transparent', color: '#233a36', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                    <span>
                        {isLegendOpen && <span style={{ display: 'block', color: '#95573e', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase' }}>Utforska kartan</span>}
                        <strong style={{ display: 'block', marginTop: isLegendOpen ? 3 : 0, fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.08rem', fontWeight: 600 }}>{isLegendOpen ? 'Filter och lager' : 'Filter'}</strong>
                    </span>
                    <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, flex: 'none', border: '1px solid #d7cab5', borderRadius: 7, fontSize: '1.2rem', lineHeight: 1 }}>{isLegendOpen ? '−' : '+'}</span>
                </button>

                {isLegendOpen && (
                    <>
                        <section style={{ padding: '12px 0', borderTop: '1px solid #e4d8c4' }}>
                            <h2 style={{ margin: '0 0 9px', color: '#40534d', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Släktgrenar</h2>
                            <div style={{ display: 'grid', gap: 5 }}>
                                {([
                                    { side: 'father', label: 'Fars sida' },
                                    { side: 'mother', label: 'Mors sida' },
                                    { side: 'both', label: 'Båda sidor' },
                                    { side: 'none', label: 'Övriga' },
                                ] as const).map(item => {
                                    const selected = visibleSides.has(item.side);
                                    return <button type="button" key={item.side} aria-pressed={selected}
                                        onClick={() => toggleSide(item.side)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 34, width: '100%',
                                            padding: '6px 9px', border: '1px solid #e4d8c4', borderRadius: 7,
                                            background: selected ? '#f3ecdf' : '#fffefa', color: selected ? '#233a36' : '#68766e',
                                            cursor: 'pointer', font: 'inherit', fontSize: '0.73rem', textAlign: 'left' }}>
                                        <span aria-hidden="true" style={{ width: 11, height: 11, flex: 'none', borderRadius: '50%', background: SIDE_COLORS[item.side] }} />
                                        <span style={{ flex: 1 }}>{item.label}</span>
                                        <span aria-hidden="true" style={{ color: '#315249', fontWeight: 800 }}>{selected ? '✓' : ''}</span>
                                    </button>;
                                })}
                            </div>
                            {markers.some(marker => marker.approximatePlaces.length > 0) && <p style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '11px 0 0', color: '#5d392c', fontSize: '0.68rem', lineHeight: 1.4 }}>
                                <span aria-hidden="true" style={{ width: 16, height: 16, flex: 'none', border: '2px dashed #5d392c', borderRadius: '50%' }} />
                                Streckad kartnål: ungefärlig plats.
                            </p>}
                        </section>

                        <section style={{ padding: '12px 0', borderTop: '1px solid #e4d8c4' }}>
                            <h2 style={{ margin: '0 0 8px', color: '#40534d', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Visa samband</h2>
                            <div style={{ display: 'grid', gap: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 31, color: '#31493f', cursor: 'pointer', fontSize: '0.73rem' }}>
                                    <input type="checkbox" checked={showPaths} onChange={e => setShowPaths(e.target.checked)} style={{ accentColor: '#315249', width: 16, height: 16, margin: 0 }} />
                                    Flyttvägar
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 31, color: '#31493f', cursor: 'pointer', fontSize: '0.73rem' }}>
                                    <input type="checkbox" checked={showConnections} onChange={e => setShowConnections(e.target.checked)} style={{ accentColor: '#315249', width: 16, height: 16, margin: 0 }} />
                                    Släktens förgreningar
                                </label>
                            </div>
                        </section>

                        <section style={{ padding: '12px 0', borderTop: '1px solid #e4d8c4' }}>
                            <h2 style={{ margin: '0 0 8px', color: '#40534d', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tidsperiod</h2>
                            {yearBounds && fromYear !== null && toYear !== null ? (
                                <div className="map-period-control">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#233a36', fontSize: '0.74rem', fontWeight: 800 }}>
                                        <output htmlFor="map-year-from">{fromYear}</output>
                                        <span aria-hidden="true">–</span>
                                        <output htmlFor="map-year-to">{toYear}</output>
                                    </div>
                                    <label htmlFor="map-year-from">Från år
                                        <input id="map-year-from" type="range" min={yearBounds.min} max={yearBounds.max} value={fromYear}
                                            disabled={yearBounds.min === yearBounds.max}
                                            onChange={event => setPeriod([Math.min(Number(event.target.value), toYear), toYear])} />
                                    </label>
                                    <label htmlFor="map-year-to">Till år
                                        <input id="map-year-to" type="range" min={yearBounds.min} max={yearBounds.max} value={toYear}
                                            disabled={yearBounds.min === yearBounds.max}
                                            onChange={event => setPeriod([fromYear, Math.max(Number(event.target.value), fromYear)])} />
                                    </label>
                                    <label className="map-undated-choice" htmlFor="map-show-undated">
                                        <input id="map-show-undated" type="checkbox" checked={showUndated} onChange={event => setShowUndated(event.target.checked)} />
                                        Visa även händelser utan årtal
                                    </label>
                                    <p role="status" style={{ margin: 0, color: '#65736b', fontSize: '0.68rem', lineHeight: 1.4 }}>
                                        {markers.length} kartplatser · {visibleEventCount} händelser
                                        {visibleUndatedCount > 0 && ` · ${visibleUndatedCount} utan årtal`}
                                    </p>
                                    {period && <button type="button" onClick={() => setPeriod(null)} style={{ ...mapButtonStyle, minHeight: 28, padding: '4px 8px' }}>Visa alla år</button>}
                                </div>
                            ) : <div className="map-period-control">
                                <p style={{ margin: 0, color: '#65736b', fontSize: '0.7rem' }}>Inga daterade platshändelser i urvalet.</p>
                                <label className="map-undated-choice" htmlFor="map-show-undated">
                                    <input id="map-show-undated" type="checkbox" checked={showUndated} onChange={event => setShowUndated(event.target.checked)} />
                                    Visa händelser utan årtal
                                </label>
                                <p role="status" style={{ margin: 0, color: '#65736b', fontSize: '0.68rem' }}>{markers.length} kartplatser · {visibleEventCount} händelser</p>
                            </div>}
                        </section>

                        <section style={{ padding: '12px 0 0', borderTop: '1px solid #e4d8c4' }}>
                            <h2 style={{ margin: '0 0 9px', color: '#40534d', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Generationer</h2>
                            <div className="gen-list-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 172, overflowY: 'auto', paddingRight: 4 }}>
                                {availableGenerations.map(gen => {
                                    const selected = selectedGenerations.has(gen);
                                    return <button type="button" key={gen} onClick={() => toggleGeneration(gen)} aria-pressed={selected}
                                        style={{ ...mapButtonStyle, minHeight: 30, padding: '5px 8px',
                                            borderColor: selected ? '#315249' : '#d7cab5',
                                            background: selected ? '#315249' : '#fffefa',
                                            color: selected ? '#fffdf8' : '#43584d', fontSize: '0.68rem', textAlign: 'left' }}>
                                        {getGenLabel(gen)}
                                    </button>;
                                })}
                            </div>
                        </section>

                        {!readOnly && <p style={{ margin: '13px 0 0', paddingTop: 11, borderTop: '1px solid #e4d8c4', color: '#64716b', fontSize: '0.69rem', lineHeight: 1.45 }}>
                            Välj ett exakt ortnamn i platsgranskningen om flera orter delar en markör.
                        </p>}
                    </>
                )}
            </aside>

            <LocationReviewPanel
                    rows={reviewRows}
                    readOnly={readOnly}
                    open={reviewOpen}
                    onOpenChange={setReviewPanelOpen}
                    selectedPlace={selectedReviewPlace}
                    onSelect={setSelectedReviewPlace}
                    pickingPlace={pickingPlace}
                    onStartPick={setPickingPlace}
                    onCancelPick={() => setPickingPlace(null)}
                    onSaveCoordinates={(place, coords) => onLocationUpdate?.(place, coords)}
                    onStatus={(place, status) => onReviewStatusUpdate?.(place, status)}
                    onUndo={(place) => onLocationUndo?.(place)}
                />

            {pickingPlace && (
                <div role="status" style={{
                    position: 'absolute', bottom: 17, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 1100, width: 'min(580px, calc(100% - 34px))', padding: '12px 15px',
                    borderRadius: 12, background: '#fffdf8', color: '#233a36',
                    border: '2px solid #95573e', boxShadow: '0 12px 30px rgba(46, 43, 32, 0.18)',
                    fontSize: '0.78rem', lineHeight: 1.4, textAlign: 'center'
                }}>
                    Klicka på kartan för ny punkt för <strong>{pickingPlace}</strong>. Ändringen sparas bara i din webbläsare.
                    <button type="button" onClick={() => setPickingPlace(null)} style={{ ...mapButtonStyle, marginLeft: 8, minHeight: 28, padding: '3px 8px' }}>Avbryt</button>
                </div>
            )}

            <MapContainer center={[59.3293, 18.0686]} zoom={5} zoomControl={false} style={{ height: '100%', width: '100%', background: '#dfe8e5' }}>
                <ZoomControl position="bottomright" />
                <MapVisibility active={active} />
                <FocusSelectedTrail active={active} personId={selectedPerson ? selectedPersonId : null} positions={selectedTrailPositions} />
                {overviewLand && <Pane name="overview-land" style={{ zIndex: 100 }}>
                    <GeoJSON data={overviewLand} interactive={false}
                        attribution='Översikt: <a href="https://www.naturalearthdata.com/">Natural Earth</a> · Vissa orter: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0)'
                        style={{ color: '#a9b2a1', weight: 0.7, fillColor: '#d9ddca', fillOpacity: 1 }} />
                </Pane>}
                {active && <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />}
                <MapReviewControls
                        selectedPlace={selectedReviewPlace}
                        selectedCoordinates={selectedReviewCoordinates}
                        pickingPlace={pickingPlace}
                        onPick={(place, coordinates) => {
                            onLocationUpdate?.(place, coordinates);
                            setPickingPlace(null);
                            setReviewPanelOpen(true);
                        }}
                    />

                {markers.map((marker) => (
                    <Marker
                        key={`${marker.coords.lat}:${marker.coords.lon}:${marker.placeName}:${marker.approximatePlaces.length > 0}`}
                        position={[marker.coords.lat, marker.coords.lon]}
                        title={`${marker.placeName}${marker.approximatePlaces.length > 0 ? ' – ungefärlig plats' : ''}`}
                        icon={getMarkerIcon(marker.people.length, marker.side, marker.approximatePlaces.length > 0)}
                        draggable={!readOnly && marker.allPlaces.size === 1}
                        eventHandlers={{
                            dragend: (e) => {
                                if (readOnly || marker.allPlaces.size !== 1) return;
                                const latlng = e.target.getLatLng();
                                const placeName = [...marker.allPlaces][0];
                                if (placeName) onLocationUpdate?.(placeName, { lat: latlng.lat, lon: latlng.lng });
                            }
                        }}
                    >
                        <Popup>
                            <div style={{ maxHeight: 450, overflowY: 'auto', minWidth: 240, paddingRight: 10, color: '#233a36', fontFamily: 'Inter, sans-serif' }}>
                                <span style={{ display: 'block', color: '#95573e', fontSize: '0.61rem', fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase' }}>Plats i släkten</span>
                                <h3 style={{ margin: '3px 0 11px', paddingBottom: 9, borderBottom: '1px solid #e4d8c4', color: '#233a36', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.2rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{marker.placeName}</h3>
                                {marker.approximatePlaces.length > 0 && <p style={{ margin: '0 0 11px', padding: '7px 9px', border: '1px dashed #9d634b', borderRadius: 7, background: '#f8f0e5', color: '#5d392c', fontSize: '0.73rem', lineHeight: 1.4 }}>
                                    <strong>Ungefärlig plats.</strong> Kartpunkten visar ett ungefärligt läge{marker.approximatePlaces.length < marker.allPlaces.size ? ' för vissa av ortnamnen nedan' : ''}.
                                </p>}
                                {marker.allPlaces.size > 1 && (
                                    <details style={{ marginBottom: 11, fontSize: '0.75rem', color: '#40534d' }}>
                                        <summary>{marker.allPlaces.size} ortnamn på denna kartpunkt</summary>
                                        <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 6 }}>
                                            {[...marker.allPlaces].sort().map(place => (
                                                <div key={place} style={{ marginBottom: 5 }}>
                                                        <button type="button" style={{ ...mapButtonStyle, minHeight: 27, padding: '3px 7px', fontSize: '0.68rem' }}
                                                            onClick={() => { setSelectedReviewPlace(place); setReviewPanelOpen(true); }}>
                                                            Granska {place}
                                                        </button>
                                                        {locationPrecision.get(place) === 'approximate' && <span style={{ display: 'block', marginTop: 2, color: '#754b37', fontSize: '0.67rem', fontWeight: 700 }}>Ungefärlig plats</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marker.people.map((p, i) => {
                                        const personColor = SIDE_COLORS[p.side as FamilySide] ?? SIDE_COLORS.none;

                                        const bYear = mapYear(p.birthDate);
                                        const dYear = mapYear(p.deathDate);
                                        const lifeSpan = bYear || dYear ? `(${bYear || ''}–${dYear || ''})` : '';

                                        const selectableIds = (p.personIds || []) as string[];

                                        return (
                                            <li key={i} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #eee6d8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                                                <div style={{ fontWeight: 700, color: personColor }}>
                                                    {p.name} {lifeSpan}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: personColor
                                                    }}></span>
                                                    {eventLabel(p.eventType)} {p.year ? `(${p.year})` : '(årtal saknas)'}
                                                </div>
                                                {marker.allPlaces.size > 1 && p.place && (
                                                    <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: 2, overflowWrap: 'anywhere' }}>
                                                        Plats i källan: {p.place}{locationPrecision.get(p.place) === 'approximate' ? ' · Ungefärlig plats' : ''}
                                                    </div>
                                                )}
                                                {selectableIds.map(personId => <div key={personId} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                                                    {onSelectPerson && <button type="button" onClick={() => onSelectPerson(personId)}
                                                        style={{ ...mapButtonStyle, fontSize: '0.67rem', minHeight: 29, padding: '4px 8px' }}>
                                                        Visa {individualsById.get(personId)?.name || 'person'}
                                                    </button>}
                                                    {onShowInTree && <button type="button" onClick={() => onShowInTree(personId)}
                                                        style={{ ...mapButtonStyle, fontSize: '0.67rem', minHeight: 29, padding: '4px 8px' }}>
                                                        Släktträd
                                                    </button>}
                                                </div>)}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </Popup>
                    </Marker>
                ))}


                {showPaths && migrationPaths.map((path, idx) => (
                    <Polyline
                        key={`path-${idx}`}
                        positions={path.positions}
                        color={SIDE_COLORS[path.side]}
                        weight={2}
                        opacity={0.6}
                        dashArray="5, 8"
                    >
                        <Tooltip sticky>Flyttväg: {path.name}</Tooltip>
                    </Polyline>
                ))}

                {showConnections && familyLinks.map((link, idx) => (
                    <Polyline
                        key={`link-${idx}`}
                        positions={link.positions}
                        color={SIDE_COLORS[link.side]}
                        weight={3}
                        opacity={0.5}
                    >
                        <Tooltip sticky>Gren: {link.label}</Tooltip>
                    </Polyline>
                ))}

                {selectedTrailPositions.length > 0 && <Pane name="selected-person-trail" style={{ zIndex: 610 }}>
                    {selectedTrailPositions.length > 1 && <Polyline
                        positions={selectedTrailPositions}
                        pathOptions={{ color: '#95573e', weight: 4, opacity: 0.85, dashArray: '8, 5' }}
                        interactive={false}
                    />}
                    {selectedTrailPositions.map((position, index) => <CircleMarker
                        key={`${position[0]}-${position[1]}-${index}`}
                        center={position}
                        radius={7}
                        pathOptions={{ color: '#fffdf8', weight: 2, fillColor: '#95573e', fillOpacity: 1 }}
                        interactive={false}
                    />)}
                </Pane>}
            </MapContainer>
        </div>
    );
}
