import { useState, useEffect, useMemo, useCallback } from 'react';
import { parseGedcomData } from './utils/gedcomParser';
import { resolvePlaces, updateLocationCache, hydrateGeocoderCache, hydrateLocationPrecision, getLocalLocationCandidates, setLocationReviewStatus, undoLocationReview, type Coordinates, type LocationReviewStatus, type LocationSource, type LocationPrecision } from './utils/geocoder';
import { tagIndividualsBySide, calculateGenerations, type FamilySide } from './utils/relationship';
import { collectBranchPersonIds, type BranchMode } from './utils/familyScope';
import { datasetFingerprint } from './utils/datasetFingerprint';
import { collectPlaceUses, buildLocationReviewRows } from './utils/locationReview';
import { sharedLocationReviewFlags } from './data/locationReviewFlags';
import { extractSourceEvidence, type SourceEvidenceByPerson } from './utils/sourceEvidence';
import { migrateDefaultSavedViews, type RingViewSnapshot, type SavedViewSnapshot, type SavedViewState } from './utils/savedViews';

import { FamilyTreeViewer } from './components/FamilyTreeViewer';
import { FamilyMap } from './components/FamilyMap';
import { FamilyStats } from './components/FamilyStats';
import { RingTreeView } from './components/RingTreeView';
import { FamilyDataReview } from './components/FamilyDataReview';
import { PersonPanel } from './components/PersonPanel';
import { PersonSearch } from './components/PersonSearch';
import { SavedViewsControl } from './components/SavedViewsControl';
import { ReactFlowProvider } from '@xyflow/react';
import { IntroModal } from './components/IntroModal';
import './index.css';

const EMPTY_LOCATIONS = new Map<string, Coordinates | null>();
const EMPTY_LOCATION_SOURCES = new Map<string, LocationSource>();
const EMPTY_LOCATION_PRECISION = new Map<string, LocationPrecision>();
const EMPTY_LOCATION_COVERAGE = { resolved: 0, total: 0, sharedResolved: 0, localResolved: 0 };
const DEFAULT_RING_VIEW: RingViewSnapshot = {
  generations: 12,
  colorMode: 'century',
  zoom: 1,
  pan: { x: 0, y: 0 },
  visible: { dates: true, residence: false, children: false, partners: false, places: false },
};

function App() {
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [mapDataVersion, setMapDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [viewMode, setViewMode] = useState<SavedViewState['viewMode']>('tree');
  const [datasetKey, setDatasetKey] = useState('');
  const [sourceEvidence, setSourceEvidence] = useState<SourceEvidenceByPerson>(new Map());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [personPanelOpen, setPersonPanelOpen] = useState(false);
  const [branchMode, setBranchMode] = useState<BranchMode>('all');
  const [ringSnapshot, setRingSnapshot] = useState<RingViewSnapshot>(DEFAULT_RING_VIEW);
  const [ringRestoreVersion, setRingRestoreVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('slakten_intro_seen'));
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const handleFocusClear = useCallback(() => setFocusNodeId(null), []);
  const [ringPersonId, setRingPersonId] = useState<string | null>(null);
  const handleViewRings = useCallback((id: string) => {
    setSelectedPersonId(id);
    setRingPersonId(id);
    setRingSnapshot(previous => ({ ...previous, rootPersonId: id, zoom: 1, pan: { x: 0, y: 0 } }));
    setRingRestoreVersion(previous => previous + 1);
    setPersonPanelOpen(false);
    setViewMode('rings');
  }, []);

  const peopleById = useMemo(() => new Map(individuals.map(person => [person.id, person])), [individuals]);
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) : undefined;
  const visiblePersonIds = useMemo(() => collectBranchPersonIds(families, selectedPersonId, branchMode),
    [families, selectedPersonId, branchMode]);

  const handleSelectPerson = useCallback((id: string) => {
    if (!peopleById.has(id)) return;
    setSelectedPersonId(id);
    setPersonPanelOpen(true);
    if (viewMode === 'tree') setFocusNodeId(id);
  }, [peopleById, viewMode]);

  const handleOpenPersonView = useCallback((nextView: SavedViewState['viewMode']) => {
    if (nextView === 'tree' && selectedPersonId) setFocusNodeId(selectedPersonId);
    if (nextView === 'rings' && selectedPersonId) {
      setRingPersonId(selectedPersonId);
      setRingSnapshot(previous => ({ ...previous, rootPersonId: selectedPersonId, zoom: 1, pan: { x: 0, y: 0 } }));
      setRingRestoreVersion(previous => previous + 1);
    }
    setViewMode(nextView);
    setPersonPanelOpen(false);
  }, [selectedPersonId]);

  const handleRestoreView = useCallback((snapshot: SavedViewSnapshot) => {
    if (snapshot.datasetKey !== datasetKey) return;
    const personId = snapshot.personId && peopleById.has(snapshot.personId) ? snapshot.personId : null;
    setSelectedPersonId(personId);
    setBranchMode(personId ? snapshot.branchMode : 'all');
    setRingSnapshot(snapshot.ring ?? DEFAULT_RING_VIEW);
    setRingPersonId(snapshot.ring?.rootPersonId ?? personId);
    setRingRestoreVersion(previous => previous + 1);
    setFocusNodeId(snapshot.viewMode === 'tree' ? personId : null);
    setViewMode(snapshot.viewMode);
    setPersonPanelOpen(false);
  }, [datasetKey, peopleById]);

  const urlReadOnly = useMemo(() => {
    return new URLSearchParams(window.location.search).get('edit') !== 'true';
  }, []);

  useEffect(() => {
    if (isInitialLoading) {
      document.body.classList.add('loading');
    } else {
      document.body.classList.remove('loading');
    }
  }, [isInitialLoading]);

  // Detect root individuals and compute lineages/generations
  const { sideMap, generationMap } = useMemo(() => {
    if (individuals.length === 0) {
      return {
        sideMap: new Map<string, FamilySide>(),
        generationMap: new Map<string, number>()
      };
    }

    // Find Joel Berring and Annika Messing by name
    const joel = individuals.find(i => i.name?.toLowerCase().includes('joel') && i.name?.toLowerCase().includes('berring'));
    const annika = individuals.find(i => i.name?.toLowerCase().includes('annika') && i.name?.toLowerCase().includes('messing'));

    const roots = [joel?.id, annika?.id].filter(Boolean) as string[];

    return {
      sideMap: tagIndividualsBySide(individuals, families, joel?.id, annika?.id),
      generationMap: calculateGenerations(families, roots)
    };
  }, [individuals, families]);

  // A shared, checked-in catalog supplies coordinates for every visitor.
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locationRevision, setLocationRevision] = useState(0);

  const uniquePlaces = useMemo(() => {
    const places = new Set<string>();
    individuals.forEach(ind => {
      if (ind.birthPlace) places.add(ind.birthPlace);
      if (ind.deathPlace) places.add(ind.deathPlace);
      if (ind.events) {
        ind.events.forEach((e: any) => {
          if (e.place) places.add(e.place);
        });
      }
    });
    families.forEach(fam => {
      if (fam.marriagePlace) places.add(fam.marriagePlace);
      if (fam.events) {
        fam.events.forEach((e: any) => {
          if (e.place) places.add(e.place);
        });
      }
    });
    return Array.from(places).filter(p => p.trim() !== '');
  }, [individuals, families]);

  const handleLocationUpdate = (place: string, coords: Coordinates) => {
    updateLocationCache(place, coords);
    setLocationRevision(previous => previous + 1);
  };

  const handleReviewStatusUpdate = (place: string, status: LocationReviewStatus | null) => {
    setLocationReviewStatus(place, status);
    setLocationRevision(previous => previous + 1);
  };

  const handleLocationUndo = (place: string) => {
    undoLocationReview(place);
    setLocationRevision(previous => previous + 1);
  };

  // Resolve the already stored coordinates before the map's first render.
  // This avoids a transient empty map while a state-setting effect catches up.
  const locationResolution = useMemo(() => {
    // Local corrections mutate a module cache, so the revision triggers a new lookup.
    void locationRevision;
    if (catalogState === 'loading') return null;
    return resolvePlaces(uniquePlaces);
  }, [uniquePlaces, catalogState, locationRevision]);
  const locationsCache = locationResolution?.cache ?? EMPTY_LOCATIONS;
  const locationSources = locationResolution?.sources ?? EMPTY_LOCATION_SOURCES;
  const locationPrecision = locationResolution?.precision ?? EMPTY_LOCATION_PRECISION;
  const locationCoverage = locationResolution ?? EMPTY_LOCATION_COVERAGE;
  const placeReviewRows = useMemo(() => viewMode === 'review'
    ? buildLocationReviewRows(collectPlaceUses(individuals, families), locationsCache, locationSources, sharedLocationReviewFlags)
    : [], [viewMode, individuals, families, locationsCache, locationSources]);
  const savedViewState = useMemo<SavedViewState>(() => ({
    viewMode, personId: selectedPersonId, branchMode, ring: ringSnapshot,
  }), [viewMode, selectedPersonId, branchMode, ringSnapshot]);

  // Automatic load of the default GEDCOM file if present
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const loadDefaultGedcom = async () => {
      try {
        // The default data and its location catalogs are static. Fetch them together, then resolve all known
        // places synchronously before showing either the tree or the map.
        const [catalogResult, precisionResult, gedcomResult] = await Promise.allSettled([
          fetch('locations.json', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('Location catalog unavailable');
            return response.json() as Promise<unknown>;
          }),
          fetch('location-precision.json', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('Optional location precision unavailable');
            return response.json() as Promise<unknown>;
          }),
          fetch('berring_messing-cleaned.ged', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('Default GEDCOM unavailable');
            return response.text();
          }),
        ]);
        if (cancelled) return;

        // Older deployments may have no companion file. In that case the app
        // simply makes no claim about the precision of shared points.
        hydrateLocationPrecision(precisionResult.status === 'fulfilled' ? precisionResult.value : []);

        if (catalogResult.status === 'fulfilled') {
          hydrateGeocoderCache(catalogResult.value);
          setCatalogState('ready');
        } else {
          console.error('Could not load shared location catalog:', catalogResult.reason);
          setCatalogState('error');
        }

        if (gedcomResult.status === 'fulfilled') {
          const { individuals: inds, families: fams } = parseGedcomData(gedcomResult.value);
          setIndividuals(inds);
          setFamilies(fams);
          setSourceEvidence(extractSourceEvidence(gedcomResult.value));
          const defaultDatasetKey = datasetFingerprint(gedcomResult.value);
          migrateDefaultSavedViews(defaultDatasetKey);
          setDatasetKey(defaultDatasetKey);
        } else {
          console.error('Could not load default GEDCOM:', gedcomResult.reason);
        }
      } catch (error) {
        console.log("Error during initial data load:", error);
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    };

    void loadDefaultGedcom();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);




  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        try {
          const { individuals: inds, families: fams } = parseGedcomData(text);
          setIndividuals(inds);
          setFamilies(fams);
          setSourceEvidence(extractSourceEvidence(text));
          setDatasetKey(datasetFingerprint(text));
          setSelectedPersonId(null);
          setBranchMode('all');
          setPersonPanelOpen(false);
          setFocusNodeId(null);
          setRingPersonId(null);
          setRingSnapshot(DEFAULT_RING_VIEW);
          setRingRestoreVersion(previous => previous + 1);
          // A new family file needs fresh generation filters and marker state.
          setMapDataVersion(previous => previous + 1);
        } catch (error) {
          console.error("Error parsing GEDCOM:", error);
          alert("Failed to parse the GEDCOM file.");
        }
      }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleLocationExport = () => {
    const candidates = getLocalLocationCandidates();
    const file = new Blob([JSON.stringify(candidates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'slakten-platser-lokalt.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div id="app-root" className="app-root">

      {isInitialLoading ? (
        <div className="upload-overlay">
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 600, marginTop: '20px' }}>Berrings och Messings släktträd</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Färdigställer din upplevelse...</p>
          </div>
        </div>
      ) : individuals.length === 0 ? (
        <div className="upload-overlay">
          <div className="upload-box">
            <h2>Berrings och Messings släktträd</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Ladda upp din GEDCOM-fil (.ged) för att se en interaktiv graf över din släkthistoria.
            </p>
            {loading ? (
              <div className="loading-spinner"></div>
            ) : (
              <div>
                <input
                  type="file"
                  id="gedcom-upload"
                  accept=".ged"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <label htmlFor="gedcom-upload" className="upload-btn">
                  Välj GEDCOM-fil
                </label>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="app-layout">
          <header className="app-topbar">
            <div className="app-brand" aria-label="Berrings och Messings släktarkiv">
              <span className="app-brand-mark" aria-hidden="true">◎</span>
              <div>
                <span className="app-brand-eyebrow">SLÄKTARKIV</span>
                <strong>Berring &amp; Messing</strong>
              </div>
            </div>
            <nav className="view-switcher-container" aria-label="Välj vy">
              <button onClick={() => setViewMode('tree')} className={`view-toggle-btn ${viewMode === 'tree' ? 'active' : ''}`} aria-pressed={viewMode === 'tree'}>Trädvy</button>
              <button onClick={() => setViewMode('map')} className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`} aria-pressed={viewMode === 'map'}>Karta</button>
              <button onClick={() => setViewMode('stats')} className={`view-toggle-btn ${viewMode === 'stats' ? 'active' : ''}`} aria-pressed={viewMode === 'stats'}>Statistik</button>
              <button onClick={() => setViewMode('rings')} className={`view-toggle-btn ${viewMode === 'rings' ? 'active' : ''}`} aria-pressed={viewMode === 'rings'}>Årsringar</button>
              <button onClick={() => setViewMode('review')} className={`view-toggle-btn ${viewMode === 'review' ? 'active' : ''}`} aria-pressed={viewMode === 'review'}>Underlag</button>
            </nav>
            <div className="app-topbar-actions">
              <PersonSearch individuals={individuals} selectedPersonId={selectedPersonId} onSelectPerson={handleSelectPerson} />
              <SavedViewsControl datasetKey={datasetKey} current={savedViewState} personName={selectedPerson?.name ?? null} onRestore={handleRestoreView} />
              {!urlReadOnly && (
                <div className="settings-container">
                  <button
                    className="settings-trigger"
                    type="button"
                    aria-expanded={showSettings}
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <span aria-hidden="true">⚙</span> Inställningar
                  </button>
                  {showSettings && (
                    <div className="settings-menu">
                      <strong>Kartans platser</strong>
                      <p>Koordinaterna hämtas från en gemensam platskatalog. Dina ändringar sparas bara i denna webbläsare tills de granskats och lagts till i katalogen.</p>
                      <button className="settings-menu-button" type="button" onClick={handleLocationExport}>
                        Exportera lokala koordinater
                      </button>
                      <div className="settings-menu-divider">
                        <strong>Uppdatera släktträd</strong>
                        <input type="file" id="gedcom-reupload" accept=".ged" onChange={handleFileUpload} hidden />
                        <label htmlFor="gedcom-reupload" className="settings-menu-button settings-menu-upload">Välj ny .ged-fil</label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {selectedPerson && <div className="app-selection-bar" role="group" aria-label="Vald person och släktgren">
            <button type="button" className="app-selection-person" onClick={() => setPersonPanelOpen(true)}
              title="Visa personuppgifter">{selectedPerson.name || 'Okänd person'} <span aria-hidden="true">↗</span></button>
            <div className="app-branch-options" role="group" aria-label="Välj släktgren">
              <button type="button" aria-pressed={branchMode === 'all'} onClick={() => setBranchMode('all')}>Alla</button>
              <button type="button" aria-pressed={branchMode === 'ancestors'} onClick={() => setBranchMode('ancestors')}>Anor</button>
              <button type="button" aria-pressed={branchMode === 'descendants'} onClick={() => setBranchMode('descendants')}>Efterkommande</button>
            </div>
            {visiblePersonIds && <span className="app-selection-count">{visiblePersonIds.size.toLocaleString('sv-SE')} personer</span>}
            {viewMode === 'rings' && branchMode === 'descendants' && <span className="app-selection-note">Årsringar visar anor; urvalet gäller övriga vyer.</span>}
            <button type="button" className="app-selection-clear" onClick={() => { setSelectedPersonId(null); setBranchMode('all'); setPersonPanelOpen(false); }} aria-label="Rensa personval">Rensa</button>
          </div>}

          <div className="app-stage">
            {viewMode === 'tree' ? (
              <main className="app-page-shell">
                <header className="app-page-heading">
                  <div>
                    <span className="app-page-eyebrow">SLÄKTENS LINJER</span>
                    <h1>Släktträd</h1>
                    <p>Utforska personerna och sambanden mellan generationerna.</p>
                  </div>
                </header>
                <div className="app-page-surface app-tree-surface">
                  <ReactFlowProvider>
                    <div className="react-flow-wrapper">
                      <FamilyTreeViewer
                        individuals={individuals}
                        families={families}
                        focusNodeId={focusNodeId}
                        onFocusClear={handleFocusClear}
                        onViewRings={handleViewRings}
                        selectedPersonId={selectedPersonId}
                        visiblePersonIds={visiblePersonIds}
                        onSelectPerson={handleSelectPerson}
                      />
                    </div>
                  </ReactFlowProvider>
                </div>
              </main>
            ) : viewMode === 'stats' ? (
              <main className="app-page-shell app-stats-page">
                <header className="app-page-heading">
                  <div>
                    <span className="app-page-eyebrow">SLÄKTEN I SIFFROR</span>
                    <h1>Statistik</h1>
                    <p>Se mönster i generationer, levnadsår och platser.</p>
                  </div>
                </header>
                <div className="app-page-surface app-stats-surface">
                  <FamilyStats
                    individuals={individuals}
                    families={families}
                    generationMap={generationMap}
                    sideMap={sideMap}
                    visiblePersonIds={visiblePersonIds}
                  />
                </div>
              </main>
            ) : viewMode === 'rings' ? (
              <div className="view-container">
                <RingTreeView individuals={individuals} families={families}
                  initialPersonId={ringPersonId} selectedPersonId={selectedPersonId}
                  onSelectPerson={handleSelectPerson} snapshot={ringSnapshot}
                  restoreVersion={ringRestoreVersion} onSnapshotChange={setRingSnapshot} />
              </div>
            ) : viewMode === 'review' ? (
              <main className="app-page-shell app-review-page">
                <header className="app-page-heading">
                  <div>
                    <span className="app-page-eyebrow">KÄLLOR OCH KVALITET</span>
                    <h1>Underlag</h1>
                    <p>Hitta uppgifter som kan behöva kompletteras eller kontrolleras.</p>
                  </div>
                </header>
                <div className="app-page-surface app-review-surface">
                  <FamilyDataReview individuals={individuals} visiblePersonIds={visiblePersonIds}
                    sourceEvidence={sourceEvidence} placeRows={placeReviewRows}
                    onSelectPerson={handleSelectPerson} onOpenMap={() => setViewMode('map')} />
                </div>
              </main>
            ) : null}

            {/* Keep map state prepared while another view is shown. */}
            <main
              className="app-page-shell app-map-page"
              aria-hidden={viewMode !== 'map'}
              style={{
                position: 'absolute', inset: 0,
                display: viewMode === 'map' ? 'flex' : 'none',
              }}
            >
              <header className="app-page-heading">
                <div>
                  <span className="app-page-eyebrow">PLATSER GENOM TIDEN</span>
                  <h1>Karta</h1>
                  <p>Följ släktens rörelser mellan orter och regioner.</p>
                </div>
              </header>
              <div className="app-page-surface app-map-surface"><FamilyMap
                key={mapDataVersion}
                active={viewMode === 'map'}
                selectedPersonId={selectedPersonId}
                visiblePersonIds={visiblePersonIds}
                onSelectPerson={handleSelectPerson}
                individuals={individuals}
                families={families}
                sideMap={sideMap}
                generationMap={generationMap}
                locationsCache={locationsCache}
                locationSources={locationSources}
                locationPrecision={locationPrecision}
                coverage={locationCoverage}
                catalogAvailable={catalogState === 'ready'}
                onLocationUpdate={handleLocationUpdate}
                onReviewStatusUpdate={handleReviewStatusUpdate}
                onLocationUndo={handleLocationUndo}
                readOnly={urlReadOnly}
                onShowInTree={(id) => {
                  setSelectedPersonId(id);
                  setPersonPanelOpen(true);
                  setFocusNodeId(id);
                  setViewMode('tree');
                }}
              /></div>
            </main>
            {personPanelOpen && selectedPersonId && <PersonPanel personId={selectedPersonId}
              individuals={individuals} families={families}
              sourceLabels={(sourceEvidence.get(selectedPersonId) ?? []).map(item =>
                `${item.context}: ${item.label}${item.page ? `, ${item.page}` : ''}`)}
              onClose={() => setPersonPanelOpen(false)} onSelectPerson={handleSelectPerson}
              onOpenView={handleOpenPersonView} />}
          </div>

          {showIntro && (
            <IntroModal onClose={() => {
              setShowIntro(false);
              localStorage.setItem('slakten_intro_seen', 'true');
            }} />
          )}

        </div>
      )
      }
    </div >
  );
}

export default App;
