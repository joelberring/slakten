import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '@xyflow/react';
import {
    analyzeBloodRelationship,
    findRelationshipPath,
    getPathEdges,
    getMultiplePathEdges,
    findAllCousinMarriages,
    type RelationshipFamily,
    type SharedAncestryPair,
} from '../utils/relationship';
import { matchesPersonSearch, normalizePersonSearch } from '../utils/personSearch';
import './relationship-finder.css';

interface PersonOption {
    id: string;
    name: string;
    birthDate?: string;
}

interface Props {
    individuals: PersonOption[];
    families: RelationshipFamily[];
    selectedPersonId?: string | null;
    onPathFound: (nodes: string[], edges: Set<string>) => void;
    onClear: () => void;
}

function personLabel(person: PersonOption) {
    return `${person.name}${person.birthDate ? ` · ${person.birthDate}` : ''}`;
}

function PersonPicker({ label, people, value, onChange }: {
    label: string;
    people: PersonOption[];
    value: string;
    onChange: (id: string) => void;
}) {
    const inputId = label === 'Person A' ? 'analysis-person-a' : 'analysis-person-b';
    const optionsId = `${inputId}-options`;
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = people.find(person => person.id === value);
    const labelCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const person of people) {
            const name = personLabel(person);
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return counts;
    }, [people]);
    const display = (person: PersonOption) => `${personLabel(person)}${(labelCounts.get(personLabel(person)) ?? 0) > 1 ? ` · ${person.id}` : ''}`;
    const matches = useMemo(() => {
        return people.filter(person => matchesPersonSearch(`${person.name} ${person.birthDate ?? ''}`, query));
    }, [people, query]);
    const options = matches.slice(0, 25);

    const choose = (id: string) => {
        onChange(id);
        setQuery('');
        setOpen(false);
        setActiveIndex(0);
    };

    return (
        <div className="analysis-person-picker" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}>
            {selected ? <span className="analysis-picker-label">{label}</span> : <label htmlFor={inputId}>{label}</label>}
            {selected ? (
                <div className="analysis-person-selected">
                    <span>{display(selected)}</span>
                    <button type="button" onClick={() => {
                        onChange('');
                        setQuery('');
                        setOpen(false);
                        requestAnimationFrame(() => inputRef.current?.focus());
                    }}>Ändra</button>
                </div>
            ) : (
                <>
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="search"
                        autoComplete="off"
                        placeholder="Sök namn eller födelsedatum"
                        value={query}
                        role="combobox"
                        aria-expanded={open && query.trim().length > 0}
                        aria-controls={open && query.trim() ? optionsId : undefined}
                        aria-autocomplete="list"
                        onFocus={() => setOpen(true)}
                        onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
                        onKeyDown={event => {
                            if (event.key === 'Escape') setOpen(false);
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setActiveIndex(index => Math.min(index + 1, Math.max(0, options.length - 1)));
                            }
                            if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setActiveIndex(index => Math.max(0, index - 1));
                            }
                            if (event.key === 'Enter' && open && options[activeIndex]) {
                                event.preventDefault();
                                choose(options[activeIndex].id);
                            }
                        }}
                    />
                    {open && query.trim() && (
                        <div id={optionsId} className="analysis-person-options" role="listbox" aria-label={`${label}: sökresultat`}>
                            {options.length === 0 ? <p>Ingen person hittades.</p> : options.map((person, index) => (
                                <button
                                    key={person.id}
                                    type="button"
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    className={index === activeIndex ? 'active' : ''}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => choose(person.id)}
                                >
                                    {display(person)}
                                </button>
                            ))}
                            {matches.length > options.length && <p>Visar 25 av {matches.length}. Skriv mer för att begränsa.</p>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function RelationshipFinder({ individuals, families, selectedPersonId, onPathFound, onClear }: Props) {
    const [mode, setMode] = useState<'relationship' | 'global'>('relationship');
    const [personA, setPersonA] = useState('');
    const [personB, setPersonB] = useState('');
    const [ancestorsOnly, setAncestorsOnly] = useState(true);
    const [status, setStatus] = useState('');
    const [detail, setDetail] = useState('');
    const [globalResults, setGlobalResults] = useState<SharedAncestryPair[] | null>(null);
    const [resultsQuery, setResultsQuery] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const scanTimer = useRef<number | null>(null);

    useEffect(() => () => {
        if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    }, []);

    const sortedIndividuals = useMemo(() => [...individuals].sort((a, b) =>
        a.name.localeCompare(b.name, 'sv') ||
        (a.birthDate ?? '').localeCompare(b.birthDate ?? '') ||
        a.id.localeCompare(b.id)
    ), [individuals]);
    const personById = useMemo(() => new Map(individuals.map(person => [person.id, person])), [individuals]);
    const repeatedPairNames = useMemo(() => {
        const counts = new Map<string, number>();
        for (const pair of globalResults ?? []) {
            const label = `${personById.get(pair.husb)?.name ?? ''}|${personById.get(pair.wife)?.name ?? ''}`;
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        return counts;
    }, [globalResults, personById]);
    const filteredResults = useMemo(() => {
        const search = normalizePersonSearch(resultsQuery);
        return search ? (globalResults ?? []).filter(result => matchesPersonSearch(
            `${personById.get(result.husb)?.name ?? ''} ${personById.get(result.wife)?.name ?? ''} ${result.relationType}`,
            search,
        )) : (globalResults ?? []);
    }, [globalResults, resultsQuery, personById]);

    const clearAnalysis = () => {
        setStatus('');
        setDetail('');
        onClear();
    };

    const calculate = () => {
        if (!personA || !personB) {
            setStatus('Välj två personer först.');
            setDetail('');
            return;
        }
        const blood = analyzeBloodRelationship(families, personA, personB);
        const path = ancestorsOnly ? blood?.path : findRelationshipPath(families, personA, personB, false);
        if (!path) {
            setStatus(ancestorsOnly ? 'Inga gemensamma anor finns registrerade för personerna.' : 'Ingen koppling finns registrerad för personerna.');
            setDetail('');
            onClear();
            return;
        }
        onPathFound(path, getPathEdges(path));
        if (window.innerWidth <= 768) setIsOpen(false);
        if (personA === personB) {
            setStatus('Samma person');
            setDetail('Du har valt samma person i båda fälten.');
            return;
        }
        if (blood) {
            setStatus(blood.label);
            const nameA = personById.get(personA)?.name ?? 'Person A';
            const nameB = personById.get(personB)?.name ?? 'Person B';
            const ancestorName = personById.get(blood.commonAncestorId)?.name ?? 'Okänd ana';
            let explanation: string;
            if (blood.generationsFromA === 0 || blood.generationsFromB === 0) {
                const ancestorIsA = blood.generationsFromA === 0;
                const ancestor = ancestorIsA ? nameA : nameB;
                const descendant = ancestorIsA ? nameB : nameA;
                const gap = Math.max(blood.generationsFromA, blood.generationsFromB);
                explanation = `${ancestor} är registrerad som ${gap === 1 ? 'förälder' : 'ana'} till ${descendant}${gap > 1 ? `, ${gap} generationer bakåt` : ''}.`;
            } else {
                const fromA = `${blood.generationsFromA} ${blood.generationsFromA === 1 ? 'generation' : 'generationer'}`;
                const fromB = `${blood.generationsFromB} ${blood.generationsFromB === 1 ? 'generation' : 'generationer'}`;
                explanation = `Gemensam ana: ${ancestorName}, ${fromA} från ${nameA} och ${fromB} från ${nameB}.`;
            }
            setDetail(`${explanation}${!ancestorsOnly ? ' Den markerade kortaste vägen kan också gå via ingifte.' : ''}`);
        } else {
            setStatus('Koppling via familj eller ingifte');
            setDetail('Ingen gemensam ana finns registrerad. Den markerade vägen visar hur personerna hänger ihop i filen.');
        }
    };

    const scan = () => {
        if (isScanning) return;
        setIsScanning(true);
        setStatus('Söker i släktträdet…');
        setDetail('');
        scanTimer.current = window.setTimeout(() => {
            const results = findAllCousinMarriages(families);
            setGlobalResults(results);
            setIsScanning(false);
            setStatus(results.length ? `${results.length} par med registrerade gemensamma anor` : 'Inga par med gemensamma anor hittades.');
            setDetail(results.length ? 'Välj ett par för att se kopplingen i trädet. Flera familjeposter för samma personer visas som en rad.' : '');
            scanTimer.current = null;
        }, 0);
    };

    const selectPair = (pair: SharedAncestryPair) => {
        const nodes = new Set<string>([pair.husb, pair.wife, ...pair.familyIds]);
        const paths: string[][] = [];
        for (const ancestorId of pair.sharedAncestors) {
            for (const personId of [pair.husb, pair.wife]) {
                const path = findRelationshipPath(families, personId, ancestorId, true);
                if (!path) continue;
                path.forEach(id => nodes.add(id));
                paths.push(path);
            }
        }
        const edges = getMultiplePathEdges(paths);
        for (const familyId of pair.familyIds) {
            edges.add(`e-${pair.husb}-${familyId}`);
            edges.add(`e-${pair.wife}-${familyId}`);
        }
        onPathFound([...nodes], edges);
        if (window.innerWidth <= 768) setIsOpen(false);
        setStatus(pair.relationType);
        setDetail(`Markerar ${personById.get(pair.husb)?.name ?? 'Person A'} och ${personById.get(pair.wife)?.name ?? 'Person B'} samt deras närmaste registrerade gemensamma ${pair.sharedAncestors.length === 1 ? 'ana' : 'anor'}.`);
    };

    const clear = () => {
        if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
        scanTimer.current = null;
        setIsScanning(false);
        setPersonA('');
        setPersonB('');
        setStatus('');
        setDetail('');
        setGlobalResults(null);
        setResultsQuery('');
        onClear();
    };

    const changeMode = (nextMode: 'relationship' | 'global') => {
        if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
        scanTimer.current = null;
        setIsScanning(false);
        setMode(nextMode);
        clearAnalysis();
    };

    return (
        <Panel position="top-right" className={`relationship-panel nowheel nodrag ${isOpen ? 'open' : ''}`}>
            <button className="legend-mobile-toggle" type="button" aria-expanded={isOpen} onClick={() => setIsOpen(open => !open)}>
                {isOpen ? 'Dölj analys' : status ? `Analys: ${status}` : 'Öppna analys'}
            </button>
            <div className="panel-content">
                <h3>Analysverktyg</h3>
                <div className="tab-group" role="tablist" aria-label="Analys">
                    <button type="button" role="tab" aria-selected={mode === 'relationship'} className={`tab-btn ${mode === 'relationship' ? 'active' : ''}`} onClick={() => changeMode('relationship')}>Släktskap</button>
                    <button type="button" role="tab" aria-selected={mode === 'global'} className={`tab-btn ${mode === 'global' ? 'active' : ''}`} onClick={() => changeMode('global')}>Gemensamma anor</button>
                </div>

                {mode === 'relationship' ? (
                    <div role="tabpanel">
                        {selectedPersonId && personById.has(selectedPersonId) && personA !== selectedPersonId && (
                            <button type="button" className="analysis-use-selection" onClick={() => { setPersonA(selectedPersonId); clearAnalysis(); }}>Använd vald person som A</button>
                        )}
                        <PersonPicker label="Person A" people={sortedIndividuals} value={personA} onChange={id => { setPersonA(id); clearAnalysis(); }} />
                        <PersonPicker label="Person B" people={sortedIndividuals} value={personB} onChange={id => { setPersonB(id); clearAnalysis(); }} />
                        <label className="analysis-ancestor-choice">
                            <input type="checkbox" checked={ancestorsOnly} onChange={event => { setAncestorsOnly(event.target.checked); clearAnalysis(); }} />
                            Visa vägen via gemensamma anor
                        </label>
                        <div className="button-group">
                            <button type="button" className="primary-btn" onClick={calculate}>Analysera</button>
                            <button type="button" className="secondary-btn" onClick={clear}>Rensa</button>
                        </div>
                        {status && <div className="status-message" role="status"><strong>{status}</strong>{detail && <p>{detail}</p>}</div>}
                    </div>
                ) : (
                    <div role="tabpanel">
                        <p className="analysis-description">Sök bland registrerade par som delar en ana. Mycket nära kopplingar kan också visa fel i släktfilen.</p>
                        <div className="button-group">
                            <button type="button" className="primary-btn" disabled={isScanning} onClick={scan}>{isScanning ? 'Söker…' : 'Sök i trädet'}</button>
                            <button type="button" className="secondary-btn" onClick={clear}>Rensa</button>
                        </div>
                        {status && <div className="status-message analysis-status-global" role="status"><strong>{status}</strong>{detail && <p>{detail}</p>}</div>}
                        {globalResults && globalResults.length > 0 && (
                            <div className="analysis-results">
                                <label htmlFor="analysis-results-query">Sök bland {globalResults.length} par</label>
                                <input id="analysis-results-query" type="search" value={resultsQuery} placeholder="Namn eller relation" onChange={event => setResultsQuery(event.target.value)} />
                                <p className="analysis-result-count">{filteredResults.length} {filteredResults.length === 1 ? 'träff' : 'träffar'}</p>
                                <ul>
                                    {filteredResults.map(pair => (
                                        <li key={`${pair.husb}:${pair.wife}`}>
                                            <button type="button" onClick={() => selectPair(pair)}>
                                                <strong>{personLabel(personById.get(pair.husb) ?? { id: pair.husb, name: 'Okänd' })}</strong>
                                                <span>och</span>
                                                <strong>{personLabel(personById.get(pair.wife) ?? { id: pair.wife, name: 'Okänd' })}</strong>
                                                <small>{pair.relationType} · {pair.sharedAncestors.length} {pair.sharedAncestors.length === 1 ? 'närmaste gemensam ana' : 'närmaste gemensamma anor'}{pair.familyIds.length > 1 ? ` · ${pair.familyIds.length} familjeposter` : ''}</small>
                                                {(repeatedPairNames.get(`${personById.get(pair.husb)?.name ?? ''}|${personById.get(pair.wife)?.name ?? ''}`) ?? 0) > 1 && (
                                                    <small>Person-ID: {pair.husb} / {pair.wife}</small>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Panel>
    );
}
