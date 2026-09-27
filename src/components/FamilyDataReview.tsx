import { useMemo, useState, type ReactNode } from 'react';
import { buildDataReview, type ReviewPerson } from '../utils/dataReview';
import type { LocationReviewRow } from '../utils/locationReview';
import type { PersonSourceEvidence } from '../utils/sourceEvidence';
import './family-data-review.css';

export interface FamilyDataReviewProps {
    individuals: readonly ReviewPerson[];
    /** Optional current branch; all people are used when this is absent. */
    visiblePersonIds?: ReadonlySet<string> | null;
    /** Explicit SOUR citations extracted from the currently loaded GEDCOM. */
    sourceEvidence?: ReadonlyMap<string, readonly PersonSourceEvidence[]>;
    /** Place review rows from the existing map review pipeline. */
    placeRows?: readonly LocationReviewRow[];
    onSelectPerson: (personId: string) => void;
    onOpenMap: () => void;
}

type ReviewSection = 'dates' | 'duplicates' | 'sources' | 'places';

function searchable(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('sv');
}

function YearLine({ person }: { person: ReviewPerson }) {
    const birth = person.birthDate?.trim() || '?';
    const death = person.deathDate?.trim() || '?';
    return <span className="data-review-years">{birth} – {death}</span>;
}

function PersonAction({ person, onSelectPerson, children }: {
    person: ReviewPerson;
    onSelectPerson: (personId: string) => void;
    children?: ReactNode;
}) {
    return (
        <div className="data-review-person-row">
            <div>
                <button className="data-review-person-link" type="button" onClick={() => onSelectPerson(person.id)}>
                    {person.name?.trim() || 'Namn saknas'} <span aria-hidden="true">↗</span>
                </button>
                <YearLine person={person} />
                {children}
            </div>
        </div>
    );
}

export function FamilyDataReview({
    individuals,
    visiblePersonIds,
    sourceEvidence,
    placeRows,
    onSelectPerson,
    onOpenMap,
}: FamilyDataReviewProps) {
    const [section, setSection] = useState<ReviewSection>('dates');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(80);
    const review = useMemo(() => buildDataReview(individuals, visiblePersonIds), [individuals, visiblePersonIds]);
    const sourcePeople = useMemo(() => review.people.filter(person => (sourceEvidence?.get(person.id)?.length ?? 0) > 0), [review.people, sourceEvidence]);
    const dateIssues = useMemo(() => {
        const rows = new Map<string, { person: ReviewPerson; issues: string[] }>();
        const add = (person: ReviewPerson, label: string) => {
            const row = rows.get(person.id) ?? { person, issues: [] };
            row.issues.push(label);
            rows.set(person.id, row);
        };
        for (const person of review.missingBirthYear) add(person, 'Födelseår saknas');
        for (const person of review.missingDeathYear) add(person, 'Dödsår saknas');
        for (const entry of review.uncertainDates) add(entry.person, 'Ungefärligt datum');
        return [...rows.values()];
    }, [review]);
    const visiblePlaces = placeRows ?? [];
    const missingPlaces = visiblePlaces.filter(row => row.coordinates === null);
    const flaggedPlaces = visiblePlaces.filter(row => row.flags.length > 0);
    const needle = searchable(query.trim());
    const changeSection = (next: ReviewSection) => { setSection(next); setQuery(''); setLimit(80); };
    const filterByName = (person: ReviewPerson) => !needle || searchable(person.name ?? '').includes(needle);

    const sectionItems = section === 'dates'
        ? dateIssues.filter(row => filterByName(row.person))
        : section === 'duplicates'
            ? review.duplicateSuggestions.filter(group => !needle || searchable(group.name).includes(needle))
            : section === 'sources'
                ? sourcePeople.filter(filterByName)
                : visiblePlaces.filter(row => !needle || searchable(row.place).includes(needle));

    return (
        <div className="data-review">
            <div className="data-review-intro">
                <span className="data-review-kicker">GRANSKA UNDERLAGET</span>
                <p>Förslag att kontrollera i GEDCOM-filen. Uppgifterna ändras inte här.</p>
                {visiblePersonIds && <span className="data-review-scope">Visar vald släktgren · {review.people.length.toLocaleString('sv-SE')} personer</span>}
            </div>

            <div className="data-review-summary" aria-label="Granskningsöversikt">
                <button type="button" aria-pressed={section === 'dates'} onClick={() => changeSection('dates')}>
                    <span>Tidsuppgifter</span><strong>{dateIssues.length.toLocaleString('sv-SE')}</strong><small>personer att kontrollera</small>
                </button>
                <button type="button" aria-pressed={section === 'duplicates'} onClick={() => changeSection('duplicates')}>
                    <span>Möjliga dubbletter</span><strong>{review.duplicateSuggestions.length.toLocaleString('sv-SE')}</strong><small>grupper med samma namn och födelseår</small>
                </button>
                <button type="button" aria-pressed={section === 'sources'} onClick={() => changeSection('sources')}>
                    <span>Källor</span><strong>{sourcePeople.length.toLocaleString('sv-SE')}</strong><small>personer med källhänvisning</small>
                </button>
                <button type="button" aria-pressed={section === 'places'} onClick={() => changeSection('places')}>
                    <span>Platser</span><strong>{missingPlaces.length.toLocaleString('sv-SE')}</strong><small>utan koordinat</small>
                </button>
            </div>

            <section className="data-review-panel" aria-label="Granskningslista">
                <div className="data-review-panel-header">
                    <div>
                        <span className="data-review-kicker">{section === 'dates' ? '01 / TID' : section === 'duplicates' ? '02 / PERSONER' : section === 'sources' ? '03 / KÄLLOR' : '04 / PLATSER'}</span>
                        <h2>{section === 'dates' ? 'Tidsuppgifter' : section === 'duplicates' ? 'Möjliga dubbletter' : section === 'sources' ? 'Källhänvisningar' : 'Platsuppgifter'}</h2>
                    </div>
                    {section === 'places' && <button type="button" className="data-review-map-button" onClick={onOpenMap}>Öppna kartans platsgranskning ↗</button>}
                </div>

                {section === 'dates' && <p className="data-review-note">Dödsår föreslås bara för personer födda senast 1910 eller med ett dödsdatum utan läsbart årtal. Ungefärliga datum behåller originaltexten.</p>}
                {section === 'duplicates' && <p className="data-review-note">Samma namn och födelseår kan tillhöra olika personer. Jämför familj, plats och källor innan du ändrar något.</p>}
                {section === 'sources' && <p className="data-review-note">Här visas uttryckliga källhänvisningar i den importerade filen. Avsaknad av hänvisning säger inget om uppgiftens riktighet.</p>}
                {section === 'places' && <p className="data-review-note">{visiblePlaces.length.toLocaleString('sv-SE')} unika platser i {visiblePersonIds ? 'hela filen' : 'filen'}, varav {Math.max(0, visiblePlaces.length - missingPlaces.length).toLocaleString('sv-SE')} har koordinat. {flaggedPlaces.length.toLocaleString('sv-SE')} har granskningsförslag.</p>}

                <label className="data-review-search-label">
                    Sök {section === 'places' ? 'plats' : 'person'}
                    <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(80); }} placeholder={section === 'places' ? 'Skriv ett ortnamn' : 'Skriv ett namn'} />
                </label>

                <div className="data-review-list">
                    {section === 'dates' && dateIssues.filter(row => filterByName(row.person)).slice(0, limit).map(row => (
                        <PersonAction key={row.person.id} person={row.person} onSelectPerson={onSelectPerson}>
                            <div className="data-review-badges">{row.issues.map(issue => <span key={issue}>{issue}</span>)}</div>
                            {review.uncertainDates.find(entry => entry.person.id === row.person.id)?.events.map(event => <small className="data-review-detail" key={event}>{event}</small>)}
                            {(sourceEvidence?.get(row.person.id)?.length ?? 0) > 0 && <small className="data-review-detail">{sourceEvidence?.get(row.person.id)?.length} källhänvisningar i filen</small>}
                        </PersonAction>
                    ))}
                    {section === 'duplicates' && review.duplicateSuggestions.filter(group => !needle || searchable(group.name).includes(needle)).slice(0, limit).map(group => (
                        <div className="data-review-duplicate" key={`${group.name}-${group.birthYear}`}>
                            <h3>{group.name} <span>född {group.birthYear}</span></h3>
                            <div>{group.people.map(person => <PersonAction key={person.id} person={person} onSelectPerson={onSelectPerson}>
                                {person.birthPlace && <small className="data-review-detail">Födelseplats: {person.birthPlace}</small>}
                                <small className="data-review-detail">GEDCOM-ID: {person.id}</small>
                            </PersonAction>)}</div>
                        </div>
                    ))}
                    {section === 'sources' && sourcePeople.filter(filterByName).slice(0, limit).map(person => (
                        <PersonAction key={person.id} person={person} onSelectPerson={onSelectPerson}>
                            <ul className="data-review-source-list">{sourceEvidence?.get(person.id)?.slice(0, 3).map((citation, index) => <li key={`${citation.context}-${citation.label}-${index}`}>
                                <strong>{citation.context}</strong> · {citation.label}{citation.page ? `, ${citation.page}` : ''}
                            </li>)}</ul>
                            {(sourceEvidence?.get(person.id)?.length ?? 0) > 3 && <small className="data-review-detail">+ {(sourceEvidence?.get(person.id)?.length ?? 0) - 3} källhänvisningar</small>}
                        </PersonAction>
                    ))}
                    {section === 'places' && visiblePlaces.filter(row => !needle || searchable(row.place).includes(needle)).slice(0, limit).map(row => <div className="data-review-place" key={row.place}>
                        <div><strong>{row.place}</strong><span>{row.uses} {row.uses === 1 ? 'förekomst' : 'förekomster'}</span></div>
                        <small>{row.flags[0]?.message ?? (row.coordinates ? 'Koordinat finns' : 'Koordinat saknas')}</small>
                    </div>)}
                    {sectionItems.length === 0 && <p className="data-review-empty">{needle ? 'Inga träffar för sökningen.' : 'Inga uppgifter i den här gruppen.'}</p>}
                </div>
                {sectionItems.length > limit && <button className="data-review-more" type="button" onClick={() => setLimit(current => current + 80)}>Visa fler ({sectionItems.length - limit} kvar)</button>}
            </section>
        </div>
    );
}
