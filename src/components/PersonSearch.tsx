import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersonRecord } from './PersonPanel';

interface Props {
  individuals: PersonRecord[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
}

export function PersonSearch({ individuals, selectedPersonId, onSelectPerson }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = individuals.find(person => person.id === selectedPersonId);
  const normalized = query.trim().toLocaleLowerCase('sv');
  const matches = useMemo(() => normalized.length >= 2
    ? individuals.filter(person => person.name?.toLocaleLowerCase('sv').includes(normalized))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'sv'))
      .slice(0, 30)
    : [], [individuals, normalized]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return <div className="app-person-search" ref={containerRef}>
    <button className="app-utility-trigger" type="button" aria-expanded={open} aria-label="Sök person"
      title="Sök person" onClick={() => setOpen(previous => !previous)}>
      <span aria-hidden="true">⌕</span><span className="app-utility-label">{selected ? 'Byt person' : 'Sök person'}</span>
    </button>
    {open && <div className="app-person-search-menu" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <label htmlFor="app-person-search-input">Hitta person i släkten</label>
      <input ref={inputRef} id="app-person-search-input" type="search" value={query}
        onChange={event => setQuery(event.target.value)} placeholder="Sök på namn" autoComplete="off" />
      <div className="app-person-search-results" aria-live="polite">
        {normalized.length < 2 ? <p>Skriv minst två bokstäver.</p>
          : matches.length ? matches.map(person => <button type="button" key={person.id}
            onClick={() => { onSelectPerson(person.id); setOpen(false); setQuery(''); }}>
            <strong>{person.name || 'Okänd person'}</strong>
            <span>{person.birthDate || 'Årtal saknas'}</span>
          </button>) : <p>Ingen person hittades.</p>}
      </div>
    </div>}
  </div>;
}
