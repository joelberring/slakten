import { useEffect, useMemo, useRef } from 'react';
import { extractYear } from '../utils/dateUtils';
import '../person-panel.css';

export interface PersonRecord {
  id: string;
  name?: string;
  sex?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  events?: Array<{ type?: string; date?: string; place?: string }>;
}

export interface PersonFamily {
  id: string;
  husb?: string | null;
  wife?: string | null;
  children?: string[];
  marriageDate?: string;
  marriagePlace?: string;
  events?: Array<{ type?: string; date?: string; place?: string }>;
}

type ViewMode = 'tree' | 'map' | 'stats' | 'rings' | 'review';

interface Props {
  personId: string;
  individuals: PersonRecord[];
  families: PersonFamily[];
  sourceLabels?: string[];
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onOpenView: (view: ViewMode) => void;
}

interface LifeEvent {
  type: string;
  date: string;
  place: string;
}

const EVENT_LABELS: Record<string, string> = {
  BIRT: 'Född', DEAT: 'Död', RESI: 'Bostad', CHR: 'Dop', BAPM: 'Dop',
  OCCU: 'Yrke', GRAD: 'Examen', BURI: 'Begravning', MARR: 'Vigsel', DIV: 'Skilsmässa',
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

function uniqueEvents(person: PersonRecord, families: PersonFamily[]): LifeEvent[] {
  const events: LifeEvent[] = [
    { type: 'BIRT', date: person.birthDate ?? '', place: person.birthPlace ?? '' },
    ...(person.events ?? []).map(event => ({ type: event.type ?? '', date: event.date ?? '', place: event.place ?? '' })),
    { type: 'DEAT', date: person.deathDate ?? '', place: person.deathPlace ?? '' },
  ];
  for (const family of families) {
    if (family.husb !== person.id && family.wife !== person.id) continue;
    events.push({ type: 'MARR', date: family.marriageDate ?? '', place: family.marriagePlace ?? '' });
    events.push(...(family.events ?? []).map(event => ({
      type: event.type ?? '', date: event.date ?? '', place: event.place ?? '',
    })));
  }
  const seen = new Set<string>();
  return events.filter(event => {
    if (!event.date.trim() && !event.place.trim()) return false;
    const key = `${event.type}\u0000${event.date}\u0000${event.place}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    const yearA = extractYear(a.date) ?? Number.POSITIVE_INFINITY;
    const yearB = extractYear(b.date) ?? Number.POSITIVE_INFINITY;
    return yearA - yearB || a.type.localeCompare(b.type, 'sv');
  });
}

export function PersonPanel({ personId, individuals, families, sourceLabels = [], onClose, onSelectPerson, onOpenView }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const peopleById = useMemo(() => new Map(individuals.map(person => [person.id, person])), [individuals]);
  const person = peopleById.get(personId);
  const relatives = useMemo(() => {
    const parentIds = new Set<string>();
    const partnerIds = new Set<string>();
    const childIds = new Set<string>();
    for (const family of families) {
      if (family.children?.includes(personId)) {
        if (family.husb) parentIds.add(family.husb);
        if (family.wife) parentIds.add(family.wife);
      }
      if (family.husb === personId || family.wife === personId) {
        const partner = family.husb === personId ? family.wife : family.husb;
        if (partner) partnerIds.add(partner);
        for (const child of family.children ?? []) childIds.add(child);
      }
    }
    const known = (ids: Set<string>) => [...ids].map(id => peopleById.get(id)).filter((entry): entry is PersonRecord => !!entry)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'sv'));
    return { parents: known(parentIds), partners: known(partnerIds), children: known(childIds) };
  }, [families, peopleById, personId]);
  const events = useMemo(() => person ? uniqueEvents(person, families) : [], [person, families]);

  useEffect(() => { closeRef.current?.focus(); }, [personId]);
  if (!person) return null;

  const relationshipGroups = [
    { label: 'Föräldrar', people: relatives.parents },
    { label: 'Partner', people: relatives.partners },
    { label: 'Barn', people: relatives.children },
  ];

  return (
    <aside className="app-person-panel" role="dialog" aria-modal="false" aria-labelledby="app-person-title"
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div className="app-person-panel-heading">
        <span>PERSON I SLÄKTEN</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Stäng personuppgifter">×</button>
      </div>
      <h2 id="app-person-title">{person.name?.trim() || 'Okänd person'}</h2>
      <p className="app-person-years">{person.birthDate || '?'} – {person.deathDate || '?'}</p>

      <div className="app-person-view-links" aria-label="Visa personen i en vy">
        <button type="button" onClick={() => onOpenView('tree')}>Trädvy</button>
        <button type="button" onClick={() => onOpenView('rings')}>Årsringar</button>
        <button type="button" onClick={() => onOpenView('map')}>Karta</button>
      </div>

      <section className="app-person-section">
        <h3>Livshändelser</h3>
        {events.length ? <ol className="app-person-events">{events.map((event, index) => (
          <li key={`${event.type}-${event.date}-${event.place}-${index}`}>
            <span className="app-person-event-dot" aria-hidden="true" />
            <div>
              <strong>{eventLabel(event.type)}</strong>
              {event.date && <span>{event.date}</span>}
              {event.place && <small>{event.place}</small>}
            </div>
          </li>
        ))}</ol> : <p className="app-person-empty">Inga daterade eller platsbundna händelser finns registrerade.</p>}
      </section>

      {relationshipGroups.map(group => (
        <section className="app-person-section" key={group.label}>
          <h3>{group.label} <span>{group.people.length}</span></h3>
          {group.people.length ? <div className="app-person-relatives">{group.people.map(relative => (
            <button key={relative.id} type="button" onClick={() => onSelectPerson(relative.id)}>
              <strong>{relative.name || 'Okänd person'}</strong>
              <span>{relative.birthDate || 'Årtal saknas'}</span>
            </button>
          ))}</div> : <p className="app-person-empty">Ingen uppgift.</p>}
        </section>
      ))}

      {sourceLabels.length > 0 && <section className="app-person-section">
        <h3>Källhänvisningar <span>{sourceLabels.length}</span></h3>
        <ul className="app-person-sources">{sourceLabels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>
      </section>}
    </aside>
  );
}
