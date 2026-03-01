import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { type Coordinates } from '../utils/geocoder';
import { extractYear } from '../utils/dateUtils';
import { type FamilySide } from '../utils/relationship';

interface Props {
    individuals: any[];
    families: any[];
    sideMap: Map<string, FamilySide>;
    generationMap: Map<string, number>;
    locationsCache: Map<string, Coordinates | null>;
    loadingCount: { resolved: number, total: number };
    onLocationUpdate?: (place: string, coords: Coordinates) => void;
    onShowInTree?: (id: string) => void;
    readOnly?: boolean;
}


/**
 * Returns a custom Leaflet DivIcon with a color based on density and family side.
 */
function getMarkerIcon(count: number, side: FamilySide): L.DivIcon {
    let hue = 0; // Red (Mother)
    if (side === 'father') hue = 210; // Blue
    if (side === 'both') hue = 280; // Purple
    if (side === 'none') hue = 50; // Yellow/Gold

    const lightness = Math.max(15, 50 - (count - 1) * 4);
    const color = `hsl(${hue}, 100%, ${lightness}%)`;
    // Increased base size and scaling factor
    const size = Math.min(50, 32 + Math.floor(Math.sqrt(count) * 4));

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C16.5 18 20 14.5 20 10C20 5.58172 16.4183 2 12 2C7.58172 2 4 5.58172 4 10C4 14.5 7.5 18 12 22Z" 
                    fill="${color}" stroke="white" stroke-width="1.5"/>
                <circle cx="12" cy="10" r="4.5" fill="white" fill-opacity="0.9"/>
                ${count > 1 ? `<text x="12" y="11.5" font-size="10" font-family="Outfit, Arial" fill="black" text-anchor="middle" font-weight="800">${count}</text>` : ''}
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
    loadingCount,
    onLocationUpdate,
    onShowInTree,
    readOnly
}: Props) {


    const [showPaths, setShowPaths] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [selectedGenerations, setSelectedGenerations] = useState<Set<number | 'unconnected'>>(new Set());
    const [visibleSides, setVisibleSides] = useState<Set<FamilySide>>(new Set(['father', 'mother', 'both', 'none']));
    const [isLegendOpen, setIsLegendOpen] = useState(window.innerWidth > 768);

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
            const gen = generationMap.get(ind.id) ?? 'unconnected';
            if (hasGenFilter && !selectedGenerations.has(gen)) return;

            const allEvents = ind.events || [];
            if (ind.birthPlace && !allEvents.some((e: any) => e.type === 'BIRT' && e.place === ind.birthPlace)) {
                allEvents.push({ type: 'BIRT', date: ind.birthDate, place: ind.birthPlace });
            }
            if (ind.deathPlace && !allEvents.some((e: any) => e.type === 'DEAT' && e.place === ind.deathPlace)) {
                allEvents.push({ type: 'DEAT', date: ind.deathDate, place: ind.deathPlace });
            }

            allEvents.forEach((event: any) => {
                const coords = locationsCache.get(event.place);

                if (coords) {
                    const lat = coords.lat.toFixed(2);
                    const lon = coords.lon.toFixed(2);
                    const clusterKey = `${lat},${lon}`;

                    if (!groups.has(clusterKey)) {
                        groups.set(clusterKey, {
                            coords,
                            people: [],
                            placeName: event.place,
                            side: 'none',
                            allPlaces: new Set([event.place])
                        });
                    }

                    const personSide = sideMap.get(ind.id) || 'none';
                    if (!visibleSides.has(personSide)) return;

                    const group = (groups.get(clusterKey) as any)!;
                    group.allPlaces.add(event.place);

                    if (!group.people.some((p: any) => p.id === ind.id && p.eventType === event.type)) {

                        group.people.push({
                            ...ind,
                            id: ind.id,
                            name: ind.name,
                            birthDate: ind.birthDate,
                            deathDate: ind.deathDate,
                            eventType: event.type,
                            eventDate: event.date,
                            side: personSide,
                            year: extractYear(event.date),
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
            const husbGen = fam.husb ? generationMap.get(fam.husb) : undefined;
            const wifeGen = fam.wife ? generationMap.get(fam.wife) : undefined;
            let maxGen: number | 'unconnected' = 'unconnected';
            if (husbGen !== undefined || wifeGen !== undefined) {
                maxGen = Math.max(husbGen ?? -999, wifeGen ?? -999);
            }
            if (hasGenFilter && !selectedGenerations.has(maxGen)) return;

            const allEvents = fam.events || [];
            if (fam.marriagePlace && !allEvents.some((e: any) => e.type === 'MARR' && e.place === fam.marriagePlace)) {
                allEvents.push({ type: 'MARR', date: fam.marriageDate, place: fam.marriagePlace });
            }

            allEvents.forEach((event: any) => {
                const coords = locationsCache.get(event.place);

                if (coords) {
                    const lat = coords.lat.toFixed(2);
                    const lon = coords.lon.toFixed(2);
                    const clusterKey = `${lat},${lon}`;

                    if (!groups.has(clusterKey)) {
                        groups.set(clusterKey, {
                            coords,
                            people: [],
                            placeName: event.place,
                            side: 'none',
                            allPlaces: new Set([event.place])
                        });
                    }

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

                    const husb = individuals.find(i => i.id === fam.husb);
                    const wife = individuals.find(i => i.id === fam.wife);
                    const name = `${husb?.name || '?'} & ${wife?.name || '?'}`;

                    const group = (groups.get(clusterKey) as any)!;
                    group.allPlaces.add(event.place);
                    group.people.push({
                        id: fam.id,
                        name,
                        eventType: event.type,
                        date: event.date,
                        side: famSide,
                        year: extractYear(event.date),
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
                    placeName: places.length > 2 ? `${places[0]} (+${places.length - 1} more)` : places.join(' / ')
                };
            });

        return finalMarkers;

    }, [individuals, families, locationsCache, selectedGenerations, sideMap, visibleSides, generationMap]);


    const migrationPaths = useMemo(() => {
        if (!showPaths) return [];
        const paths: { positions: [number, number][], name: string, side: FamilySide }[] = [];
        const hasGenFilter = selectedGenerations.size > 0;

        individuals.forEach(ind => {
            const gen = generationMap.get(ind.id) ?? 'unconnected';
            if (hasGenFilter && !selectedGenerations.has(gen)) return;

            const points: { coords: [number, number], year: number | null }[] = [];
            const allIndividualEvents = (ind.events || []).map((e: any) => ({ ...e, personId: ind.id }));

            families.forEach(fam => {
                if (fam.husb === ind.id || fam.wife === ind.id) {
                    (fam.events || []).forEach((e: any) => {
                        allIndividualEvents.push({ ...e, personId: ind.id });
                    });
                }
            });

            allIndividualEvents
                .map((e: any) => ({
                    ...e,
                    year: extractYear(e.date),
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
    }, [individuals, families, locationsCache, showPaths, selectedGenerations, sideMap, visibleSides, generationMap]);

    const familyLinks = useMemo(() => {
        if (!showConnections) return [];
        const links: { positions: [number, number][], side: FamilySide, label: string }[] = [];
        const hasGenFilter = selectedGenerations.size > 0;

        families.forEach(fam => {
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
                const child = individuals.find(i => i.id === childId);
                if (!child) return;

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
    }, [individuals, families, locationsCache, showConnections, selectedGenerations, sideMap, visibleSides, generationMap]);


    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            {loadingCount.resolved < loadingCount.total && (
                <div style={{
                    position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
                    background: 'var(--bg-primary)', padding: '10px 20px', borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', textAlign: 'center'
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Geokodar platser: {loadingCount.resolved} / {loadingCount.total}...
                    </div>
                </div>
            )}

            <div className={`map-legend ${isLegendOpen ? 'open' : ''}`} style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 1000,
                background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', width: '220px'
            }}>
                <div
                    onClick={() => window.innerWidth <= 768 && setIsLegendOpen(!isLegendOpen)}
                    style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        marginBottom: isLegendOpen ? '10px' : '0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <span>{isLegendOpen ? 'Legend & Filter' : '📁 Visa Filter'}</span>
                    {window.innerWidth <= 768 && <span>{isLegendOpen ? '✕' : ''}</span>}
                </div>

                {isLegendOpen && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
                            {[
                                { side: 'father', label: "Fars sida", color: 'hsl(210, 100%, 50%)' },
                                { side: 'mother', label: "Mors sida", color: 'hsl(0, 100%, 50%)' },
                                { side: 'both', label: "Gemensam / Båda", color: 'hsl(280, 100%, 50%)' },
                                { side: 'none', label: "Övriga", color: 'hsl(50, 100%, 50%)' }
                            ].map(item => (
                                <div key={item.side}
                                    onClick={() => toggleSide(item.side as FamilySide)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        opacity: visibleSides.has(item.side as FamilySide) ? 1 : 0.3,
                                        transition: 'opacity 0.2s',
                                        padding: '2px 0'
                                    }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: item.color }}></div>
                                    {item.label}
                                </div>
                            ))}
                        </div>


                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} />
                                Visa flyttvägar (Individer)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                <input type="checkbox" checked={showConnections} onChange={(e) => setShowConnections(e.target.checked)} />
                                Visa förgreningar (Släktgrenar)
                            </label>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Generationer</div>
                            <div className="gen-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
                                {availableGenerations.map(gen => (
                                    <button key={gen} onClick={() => toggleGeneration(gen)}
                                        style={{
                                            textAlign: 'left', fontSize: '0.7rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)',
                                            background: selectedGenerations.has(gen) ? 'var(--accent-color)' : 'transparent',
                                            color: selectedGenerations.has(gen) ? '#fff' : 'var(--text-primary)', cursor: 'pointer'
                                        }}>
                                        {getGenLabel(gen)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!readOnly && (
                            <div style={{
                                marginTop: 'auto',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                fontStyle: 'italic',
                                borderTop: '1px solid var(--border-color)',
                                paddingTop: '12px',
                                lineHeight: 1.4
                            }}>
                                💡 Tips: Du kan dra i markörerna på kartan för att flytta dem manuellt om de hamnat fel.
                            </div>
                        )}
                    </>
                )}
            </div>

            <MapContainer center={[59.3293, 18.0686]} zoom={5} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {markers.map((marker, idx) => (
                    <Marker
                        key={idx}
                        position={[marker.coords.lat, marker.coords.lon]}
                        icon={getMarkerIcon(marker.people.length, marker.side)}
                        draggable={!readOnly}
                        eventHandlers={{
                            dragend: (e) => {
                                if (readOnly) return;
                                const latlng = e.target.getLatLng();
                                if (onLocationUpdate) {
                                    // Update all unique places that were clustered in this marker
                                    marker.allPlaces.forEach(placeName => {
                                        onLocationUpdate(placeName, { lat: latlng.lat, lon: latlng.lng });
                                    });
                                }
                            }
                        }}
                    >
                        <Popup>
                            <div style={{ maxHeight: '250px', overflowY: 'auto', minWidth: '220px' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', borderBottom: '1px solid #eee', color: 'var(--accent-color)' }}>{marker.placeName}</h3>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {marker.people.map((p, i) => {
                                        const personColor = p.side === 'father' ? '#3498db' : p.side === 'mother' ? '#e74c3c' : p.side === 'both' ? '#9b59b6' : '#f39c12';

                                        const bYear = extractYear(p.birthDate);
                                        const dYear = extractYear(p.deathDate);
                                        const lifeSpan = bYear || dYear ? `(${bYear || ''}–${dYear || ''})` : '';

                                        const typeLabels: Record<string, string> = {
                                            'BIRT': 'Föddes här',
                                            'DEAT': 'Dog här',
                                            'MARR': 'Giftes här'
                                        };
                                        const eventLabel = typeLabels[p.eventType] || p.eventType;

                                        return (
                                            <li key={i} style={{ marginBottom: '12px', fontSize: '0.85rem', lineHeight: '1.4' }}>
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
                                                    {eventLabel} {p.year ? `(${p.year})` : ''}
                                                </div>
                                                <button
                                                    className="secondary-btn"
                                                    onClick={() => onShowInTree?.(p.id)}
                                                    style={{ fontSize: '0.65rem', padding: '4px 8px', marginTop: '6px', width: 'auto' }}
                                                >
                                                    👁️ Se i släktträdet
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </Popup>
                    </Marker>
                ))}


                {showPaths && migrationPaths.map((path: any, idx: number) => (
                    <Polyline
                        key={`path-${idx}`}
                        positions={path.positions}
                        color={path.side === 'father' ? '#3498db' : path.side === 'mother' ? '#e74c3c' : path.side === 'both' ? '#9b59b6' : '#f1c40f'}
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
                        color={link.side === 'father' ? '#2980b9' : link.side === 'mother' ? '#c0392b' : link.side === 'both' ? '#8e44ad' : '#f39c12'}
                        weight={3}
                        opacity={0.5}
                    >
                        <Tooltip sticky>Gren: {link.label}</Tooltip>
                    </Polyline>
                ))}
            </MapContainer>
        </div>
    );
}
