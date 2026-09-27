import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
    getLocationCandidateBeforeReview,
    getLocationReviewStatus,
    type Coordinates,
    type LocationReviewStatus,
} from '../utils/geocoder';
import type { LocationReviewRow } from '../utils/locationReview';

interface Props {
    rows: LocationReviewRow[];
    readOnly?: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedPlace: string | null;
    onSelect: (place: string) => void;
    pickingPlace: string | null;
    onStartPick: (place: string) => void;
    onCancelPick: () => void;
    onSaveCoordinates: (place: string, coordinates: Coordinates) => void;
    onStatus: (place: string, status: LocationReviewStatus | null) => void;
    onUndo: (place: string) => void;
}

type ReviewFilter = 'suspect' | 'all' | 'missing' | 'local';

const sourceLabels: Record<LocationReviewRow['source'], string> = {
    shared: 'Gemensam katalog',
    legacy: 'Äldre lokal geokodning',
    manual: 'Lokal rättning',
    missing: 'Saknas',
    rejected: 'Lokalt bortvald',
    unknown: 'Okänd källa',
};

const statusLabels: Record<LocationReviewStatus, string> = {
    verified: 'Kontrollerad lokalt',
    uncertain: 'Ungefärlig eller osäker',
    incorrect: 'Felaktig, dold lokalt',
    corrected: 'Rättad lokalt',
};

const buttonStyle: CSSProperties = {
    minHeight: 35,
    border: '1px solid #cdbfa8',
    borderRadius: 8,
    background: '#fffefa',
    color: '#30473f',
    padding: '7px 10px',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '0.73rem',
    fontWeight: 700,
};

const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 39,
    border: '1px solid #cbbfa9',
    borderRadius: 8,
    background: '#fffefa',
    color: '#233a36',
    padding: '8px 10px',
    font: 'inherit',
    fontSize: '0.77rem',
};

function decimalInput(value: string, minimum: number, maximum: number): number | null {
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum ? numeric : null;
}

function CoordinateEditor({ row, onSaveCoordinates }: {
    row: LocationReviewRow;
    onSaveCoordinates: Props['onSaveCoordinates'];
}) {
    const [latitude, setLatitude] = useState(row.coordinates?.lat.toString() ?? '');
    const [longitude, setLongitude] = useState(row.coordinates?.lon.toString() ?? '');
    const [error, setError] = useState('');

    const save = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const lat = decimalInput(latitude, -90, 90);
        const lon = decimalInput(longitude, -180, 180);
        if (lat === null || lon === null) {
            setError('Ange giltig latitud (−90 till 90) och longitud (−180 till 180).');
            return;
        }
        setError('');
        onSaveCoordinates(row.place, { lat, lon });
    };

    return (
        <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ color: '#40534d', fontSize: '0.72rem', fontWeight: 700 }}>
                    Latitud
                    <input aria-label="Latitud" inputMode="decimal" value={latitude}
                        onChange={event => setLatitude(event.target.value)} style={inputStyle} />
                </label>
                <label style={{ color: '#40534d', fontSize: '0.72rem', fontWeight: 700 }}>
                    Longitud
                    <input aria-label="Longitud" inputMode="decimal" value={longitude}
                        onChange={event => setLongitude(event.target.value)} style={inputStyle} />
                </label>
            </div>
            {error && <p role="alert" style={{ color: '#9a4035', fontSize: '0.72rem', margin: 0 }}>{error}</p>}
            <button type="submit" style={{ ...buttonStyle, background: '#315249', color: '#fffdf8', borderColor: '#315249' }}>Spara koordinater lokalt</button>
        </form>
    );
}

function isSuspect(row: LocationReviewRow): boolean {
    const status = getLocationReviewStatus(row.place);
    if (status === 'verified' || status === 'uncertain' || status === 'corrected') return false;
    return row.source === 'rejected'
        || row.flags.some(flag => flag.code !== 'missing-coordinate');
}

function usesLabel(uses: number): string {
    return `${uses} ${uses === 1 ? 'förekomst' : 'förekomster'}`;
}

function exportReviewedRows(rows: readonly LocationReviewRow[]): void {
    const entries = rows.flatMap(row => {
        const status = getLocationReviewStatus(row.place);
        return status === null ? [] : [{
            place: row.place,
            status,
            coordinates: row.coordinates,
            ...(status === 'incorrect' ? { rejectedCoordinates: getLocationCandidateBeforeReview(row.place) } : {}),
        }];
    });
    if (entries.length === 0) return;
    const payload = { format: 'slakten-location-review', version: 1, entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'slakten-granskade-platser.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function localEditUrl(): string {
    if (typeof window === 'undefined') return '?edit=true';
    const url = new URL(window.location.href);
    url.searchParams.set('edit', 'true');
    return `${url.pathname}${url.search}${url.hash}`;
}

export function LocationReviewPanel({
    rows,
    readOnly = false,
    open,
    onOpenChange,
    selectedPlace,
    onSelect,
    pickingPlace,
    onStartPick,
    onCancelPick,
    onSaveCoordinates,
    onStatus,
    onUndo,
}: Props) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<ReviewFilter>('suspect');
    const selected = rows.find(row => row.place === selectedPlace) ?? null;
    const rejectedCandidate = selected?.source === 'rejected'
        ? getLocationCandidateBeforeReview(selected.place)
        : null;
    const reviewedCount = rows.filter(row => getLocationReviewStatus(row.place) !== null).length;
    const matchingRows = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('sv');
        return rows.filter(row => {
            if (needle && !row.place.toLocaleLowerCase('sv').includes(needle)) return false;
            if (filter === 'suspect') return isSuspect(row);
            if (filter === 'missing') return row.coordinates === null;
            if (filter === 'local') return row.source === 'legacy' || row.source === 'manual' || row.source === 'rejected';
            return true;
        });
    }, [rows, query, filter]);

    const outerStyle: CSSProperties = {
        position: 'absolute',
        left: 16,
        top: 16,
        zIndex: 1100,
        width: open ? 'min(382px, calc(100% - 32px))' : 'auto',
        maxHeight: 'calc(100% - 112px)',
        overflowY: open ? 'auto' : 'visible',
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, rgba(255, 254, 250, 0.98), rgba(249, 245, 235, 0.98))',
        color: '#233a36',
        border: '1px solid #d7cab5',
        borderRadius: 13,
        boxShadow: '0 12px 32px rgba(46, 43, 32, 0.16)',
        padding: open ? 16 : 7,
        fontSize: '0.77rem',
        lineHeight: 1.4,
    };

    if (!open) {
        return (
            <aside aria-label="Platsgranskning" className="location-review-panel" style={outerStyle}>
                <button type="button" onClick={() => onOpenChange(true)} style={{ ...buttonStyle, padding: '7px 11px' }}>Granska platser</button>
            </aside>
        );
    }

    return (
        <aside aria-label="Platsgranskning" className="location-review-panel" style={outerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, paddingBottom: 12, borderBottom: '1px solid #e4d8c4' }}>
                <div>
                    <span style={{ display: 'block', color: '#95573e', fontSize: '0.61rem', fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase' }}>Platskatalog</span>
                    <h2 style={{ margin: '3px 0 0', color: '#233a36', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.32rem', fontWeight: 600, lineHeight: 1.2 }}>Granska platser</h2>
                </div>
                <button type="button" aria-label="Stäng platsgranskning" onClick={() => onOpenChange(false)} style={{ ...buttonStyle, minHeight: 30, padding: '4px 8px' }}>Stäng</button>
            </div>
            <p style={{ color: '#64716b', fontSize: '0.72rem', margin: '10px 0 14px' }}>
                Förslagen visar vad som kan behöva granskas. Inget ändras i den gemensamma kartan.
            </p>

            <label style={{ display: 'block', marginBottom: 9 }}>
                <span style={{ display: 'block', color: '#40534d', fontSize: '0.7rem', fontWeight: 800, marginBottom: 5 }}>Sök exakt ortnamn</span>
                <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                    placeholder="Sök bland platser" style={inputStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ display: 'block', color: '#40534d', fontSize: '0.7rem', fontWeight: 800, marginBottom: 5 }}>Visa</span>
                <select value={filter} onChange={event => setFilter(event.target.value as ReviewFilter)} style={inputStyle}>
                    <option value="suspect">Behöver granskas</option>
                    <option value="all">Alla platser</option>
                    <option value="missing">Saknar koordinat</option>
                    <option value="local">Lokala platser</option>
                </select>
            </label>
            <div style={{ fontSize: '0.69rem', color: '#64716b', marginBottom: 6, fontWeight: 700 }}>
                {matchingRows.length} {matchingRows.length === 1 ? 'träff' : 'träffar'}{matchingRows.length > 80 ? ' · visar de första 80' : ''}
            </div>
            <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid #e4d8c4', borderRadius: 9, background: '#fffefa' }}>
                {matchingRows.slice(0, 80).map(row => (
                    <button type="button" key={row.place} onClick={() => {
                        if (pickingPlace && pickingPlace !== row.place) onCancelPick();
                        onSelect(row.place);
                    }}
                        aria-pressed={selectedPlace === row.place}
                        style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                            background: selectedPlace === row.place ? '#f3ecdf' : 'transparent',
                            border: 'none', borderBottom: '1px solid #eee6d8',
                            color: '#233a36', cursor: 'pointer', font: 'inherit',
                        }}>
                        <span style={{ display: 'block', fontWeight: selectedPlace === row.place ? 700 : 500, overflowWrap: 'anywhere' }}>{row.place}</span>
                        <span style={{ display: 'block', marginTop: 3, fontSize: '0.68rem', color: '#64716b' }}>
                            {sourceLabels[row.source]} · {usesLabel(row.uses)}{row.flags.length ? ` · ${row.flags.length} granskningsförslag` : ''}
                        </span>
                    </button>
                ))}
                {matchingRows.length === 0 && <p style={{ margin: 10, color: '#64716b' }}>Inga platser matchar sökningen.</p>}
            </div>

            {selected ? (
                <section aria-label="Vald plats" style={{ marginTop: 13, borderTop: '1px solid #e4d8c4', paddingTop: 12 }}>
                    <span style={{ display: 'block', color: '#95573e', fontSize: '0.61rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Vald plats</span>
                    <h3 style={{ margin: '4px 0 0', color: '#233a36', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: '1.12rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{selected.place}</h3>
                    <div style={{ color: '#64716b', fontSize: '0.7rem', marginTop: 3 }}>
                        {sourceLabels[selected.source]} · {usesLabel(selected.uses)}
                    </div>
                    <div style={{ fontSize: '0.72rem', margin: '9px 0', color: '#40534d' }}>
                        {selected.coordinates
                            ? `Nuvarande punkt: ${selected.coordinates.lat.toFixed(5)}, ${selected.coordinates.lon.toFixed(5)}`
                            : 'Ingen punkt visas för platsen.'}
                    </div>
                    {selected.source === 'rejected' && (
                        <div style={{ fontSize: '0.72rem', margin: '7px 0', color: '#95573e' }}>
                            {rejectedCandidate
                                ? `Bortvald ursprunglig punkt: ${rejectedCandidate.lat.toFixed(5)}, ${rejectedCandidate.lon.toFixed(5)}`
                                : 'Ingen tidigare punkt finns sparad.'}
                        </div>
                    )}
                    {selected.flags.length > 0 && (
                        <ul style={{ paddingLeft: 18, margin: '8px 0', color: '#6c5545', lineHeight: 1.4 }}>
                            {selected.flags.map((flag, index) => (
                                <li key={`${flag.code}-${index}`} style={{ marginBottom: '4px' }}>
                                    {flag.message}
                                    {flag.relatedPlaces?.length ? <span> Exempel: {flag.relatedPlaces.join('; ')}.</span> : null}
                                </li>
                            ))}
                        </ul>
                    )}
                    {getLocationReviewStatus(selected.place) && (
                        <p style={{ margin: '8px 0', fontSize: '0.71rem', color: '#315249', fontWeight: 700 }}>
                            Din markering: {statusLabels[getLocationReviewStatus(selected.place) as LocationReviewStatus]}
                        </p>
                    )}
                    {!readOnly && (
                        <>
                            <CoordinateEditor
                                key={`${selected.place}:${selected.coordinates?.lat ?? 'none'}:${selected.coordinates?.lon ?? 'none'}`}
                                row={selected} onSaveCoordinates={onSaveCoordinates} />
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                                {pickingPlace === selected.place ? (
                                    <>
                                        <span style={{ fontSize: '0.72rem', color: '#64716b' }}>Klicka på rätt punkt i kartan.</span>
                                        <button type="button" onClick={onCancelPick} style={buttonStyle}>Avbryt kartval</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => {
                                        onStartPick(selected.place);
                                        onOpenChange(false);
                                    }} style={buttonStyle}>Välj punkt på kartan</button>
                                )}
                                <button type="button" onClick={() => onStatus(selected.place, 'verified')}
                                    disabled={!selected.coordinates}
                                    style={{ ...buttonStyle, opacity: selected.coordinates ? 1 : 0.5 }}>
                                    Kontrollerad
                                </button>
                                <button type="button" onClick={() => onStatus(selected.place, 'uncertain')}
                                    disabled={!selected.coordinates}
                                    style={{ ...buttonStyle, opacity: selected.coordinates ? 1 : 0.5 }}>Ungefärlig</button>
                                <button type="button" onClick={() => onStatus(selected.place, 'incorrect')}
                                    disabled={!selected.coordinates}
                                    style={{ ...buttonStyle, opacity: selected.coordinates ? 1 : 0.5 }}>Markera felaktig</button>
                                {(getLocationReviewStatus(selected.place) !== null || selected.source === 'manual' || selected.source === 'rejected') && (
                                    <button type="button" onClick={() => onUndo(selected.place)} style={buttonStyle}>Ångra lokal ändring</button>
                                )}
                            </div>
                        </>
                    )}
                </section>
            ) : (
                <p style={{ color: '#64716b', fontSize: '0.72rem', marginBottom: 0 }}>Välj en ort för att granska dess exakta namn och punkt.</p>
            )}

            {readOnly ? (
                <div style={{ borderTop: '1px solid #e4d8c4', marginTop: 13, paddingTop: 12 }}>
                    <a href={localEditUrl()} style={{ ...buttonStyle, display: 'block', textAlign: 'center', textDecoration: 'none', fontWeight: 700, background: '#315249', color: '#fffdf8', borderColor: '#315249' }}>
                        Rätta platser lokalt
                    </a>
                </div>
            ) : (
                <div style={{ borderTop: '1px solid #e4d8c4', marginTop: 13, paddingTop: 12 }}>
                    <button type="button" onClick={() => exportReviewedRows(rows)} disabled={reviewedCount === 0}
                        style={{ ...buttonStyle, width: '100%', opacity: reviewedCount === 0 ? 0.5 : 1 }}>
                        Exportera granskade beslut ({reviewedCount})
                    </button>
                    <p style={{ fontSize: '0.68rem', lineHeight: 1.4, color: '#64716b', margin: '7px 0 0' }}>
                        Exporten sparas på din enhet och innehåller bara platser du själv markerat eller rättat.
                    </p>
                </div>
            )}
        </aside>
    );
}
