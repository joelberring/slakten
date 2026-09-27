import { useEffect, useId, useRef, useState } from 'react';
import {
  deleteSavedView,
  MAX_SAVED_VIEWS,
  readSavedViews,
  renameSavedView,
  saveView,
  type SavedViewSnapshot,
  type SavedViewState,
} from '../utils/savedViews';
import '../saved-views.css';

interface Props {
  datasetKey: string;
  current: SavedViewState;
  personName: string | null;
  onRestore: (snapshot: SavedViewSnapshot) => void;
}

const VIEW_LABELS: Record<SavedViewState['viewMode'], string> = {
  tree: 'Släktträd',
  map: 'Karta',
  stats: 'Statistik',
  rings: 'Årsringar',
  review: 'Underlag',
};

const BRANCH_LABELS: Record<SavedViewState['branchMode'], string> = {
  all: 'Hela släkten',
  ancestors: 'Anor',
  descendants: 'Efterkommande',
};

function description(item: SavedViewSnapshot): string {
  const parts = [VIEW_LABELS[item.viewMode]];
  if (item.personName) parts.push(item.personName);
  if (item.branchMode !== 'all') parts.push(BRANCH_LABELS[item.branchMode]);
  if (item.viewMode === 'rings' && item.ring) parts.push(`${item.ring.generations} ringar`);
  return parts.join(' · ');
}

export function SavedViewsControl({ datasetKey, current, personName, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const nameId = useId();
  const views = readSavedViews(datasetKey);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) {
      setName(personName ? `${personName} · ${VIEW_LABELS[current.viewMode]}`.slice(0, 80) : VIEW_LABELS[current.viewMode]);
      setMessage('');
      setEditingId(null);
      setDeletingId(null);
      window.setTimeout(() => nameRef.current?.focus(), 0);
    }
    setOpen(!open);
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!datasetKey || !name.trim()) return;
    const saved = saveView(datasetKey, name, current, personName);
    if (!saved) {
      setMessage(views.length >= MAX_SAVED_VIEWS
        ? `Du kan spara högst ${MAX_SAVED_VIEWS} vyer för detta släktträd. Ta bort en äldre vy först.`
        : 'Vyn kunde inte sparas i den här webbläsaren. Kontrollera att lokal lagring är tillåten.');
      return;
    }
    setRevision(value => value + 1);
    setName('');
    setMessage(`”${saved.name}” har sparats.`);
  }

  function handleRename(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!editName.trim()) return;
    if (!renameSavedView(datasetKey, id, editName)) {
      setMessage('Namnet kunde inte sparas.');
      return;
    }
    setRevision(value => value + 1);
    setEditingId(null);
    setMessage('Namnet har ändrats.');
  }

  function handleDelete(id: string) {
    if (!deleteSavedView(datasetKey, id)) {
      setMessage('Vyn kunde inte tas bort.');
      return;
    }
    setRevision(value => value + 1);
    setDeletingId(null);
    setMessage('Vyn har tagits bort.');
  }

  return (
    <div className="saved-views" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="saved-views-trigger"
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span aria-hidden="true">☆</span> Sparade vyer{views.length > 0 ? ` (${views.length})` : ''}
      </button>
      {open && (
        <section className="saved-views-panel" id={panelId} role="dialog" aria-label="Sparade vyer">
          <div className="saved-views-heading">
            <div>
              <span className="saved-views-eyebrow">ÅTERVÄND HIT</span>
              <h2>Sparade vyer</h2>
            </div>
            <button type="button" className="saved-views-close" aria-label="Stäng sparade vyer" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button>
          </div>
          <p className="saved-views-help">Spara person, släktgren och visning. Vyerna finns kvar i den här webbläsaren.</p>
          <form className="saved-views-form" onSubmit={handleSave}>
            <label htmlFor={nameId}>Namn på aktuell vy</label>
            <div className="saved-views-form-row">
              <input ref={nameRef} id={nameId} value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Till exempel mormors anor" />
              <button type="submit" disabled={!datasetKey || !name.trim() || views.length >= MAX_SAVED_VIEWS}>Spara</button>
            </div>
          </form>
          {views.length >= MAX_SAVED_VIEWS && (
            <p className="saved-views-message">Ta bort en äldre vy för att kunna spara en ny.</p>
          )}
          {message && <p className="saved-views-message" role="status">{message}</p>}
          <div className="saved-views-list-heading">
            <strong>Mina vyer</strong>
            <span>{views.length} av {MAX_SAVED_VIEWS}</span>
          </div>
          {views.length === 0 ? (
            <p className="saved-views-empty">Inga vyer sparade ännu.</p>
          ) : (
            <ul className="saved-views-list">
              {views.map(item => (
                <li className="saved-views-item" key={item.id}>
                  {editingId === item.id ? (
                    <form className="saved-views-rename" onSubmit={event => handleRename(event, item.id)}>
                      <label className="sr-only" htmlFor={`${panelId}-${item.id}`}>Nytt namn på {item.name}</label>
                      <input autoFocus id={`${panelId}-${item.id}`} value={editName} maxLength={80} onChange={event => setEditName(event.target.value)} />
                      <button type="submit" disabled={!editName.trim()}>Klart</button>
                      <button type="button" onClick={() => setEditingId(null)}>Avbryt</button>
                    </form>
                  ) : deletingId === item.id ? (
                    <div className="saved-views-confirm">
                      <span>Ta bort ”{item.name}”?</span>
                      <button type="button" onClick={() => handleDelete(item.id)}>Ta bort</button>
                      <button type="button" onClick={() => setDeletingId(null)}>Avbryt</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="saved-views-open" onClick={() => { onRestore(item); setOpen(false); }}>
                        <strong>{item.name}</strong>
                        <span>{description(item)}</span>
                      </button>
                      <div className="saved-views-item-actions">
                        <button type="button" onClick={() => { setEditingId(item.id); setEditName(item.name); setDeletingId(null); }} aria-label={`Byt namn på ${item.name}`}>Byt namn</button>
                        <button type="button" onClick={() => { setDeletingId(item.id); setEditingId(null); }} aria-label={`Ta bort ${item.name}`}>Ta bort</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
