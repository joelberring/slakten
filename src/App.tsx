import { useState, useEffect, useMemo } from 'react';
import { parseGedcomData } from './utils/gedcomParser';
import { geocodePlaces, updateLocationCache, hydrateGeocoderCache, type Coordinates } from './utils/geocoder';
import { tagIndividualsBySide, calculateGenerations, type FamilySide } from './utils/relationship';

import { FamilyTreeViewer } from './components/FamilyTreeViewer';
import { FamilyMap } from './components/FamilyMap';
import { FamilyStats } from './components/FamilyStats';
import { ReactFlowProvider } from '@xyflow/react';
import { IntroModal } from './components/IntroModal';
import './index.css';

function App() {
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tree' | 'map' | 'stats'>('tree');
  const [googleApiKey, setGoogleApiKey] = useState<string>(() => localStorage.getItem('slakten_google_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('slakten_intro_seen'));
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  const urlReadOnly = useMemo(() => {
    return !window.location.search.includes('edit=true');
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

  // Global Geocoding State
  const [locationsCache, setLocationsCache] = useState<Map<string, Coordinates | null>>(new Map());
  const [geocodingStatus, setGeocodingStatus] = useState({ resolved: 0, total: 0 });

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
    setLocationsCache(prev => {
      const next = new Map(prev);
      next.set(place, coords);
      return next;
    });
  };


  useEffect(() => {
    if (uniquePlaces.length > 0) {
      geocodePlaces(uniquePlaces, googleApiKey, (resolved, total, cache) => {
        setGeocodingStatus({ resolved, total });
        setLocationsCache(new Map(cache));
      }).catch(e => console.error("Background geocoding failed", e));
    }
  }, [uniquePlaces, googleApiKey]);

  // Automatic load of the default GEDCOM file if present
  useEffect(() => {
    const loadDefaultGedcom = async () => {
      try {
        // 1. Try to load prebaked locations FIRST
        const locResponse = await fetch('/locations.json');
        if (locResponse.ok) {
          const json = await locResponse.json();
          // Hydrate the utility's internal cache
          hydrateGeocoderCache(json);
          // Update local state
          const prebaked = new Map<string, Coordinates | null>(json);
          setLocationsCache(prebaked);
        }

        // 2. Then load the GEDCOM
        const response = await fetch('/berring_messing.ged');
        if (response.ok) {
          const text = await response.text();
          const { individuals: inds, families: fams } = parseGedcomData(text);
          setIndividuals(inds);
          setFamilies(fams);
        }
      } catch (error) {
        console.log("Error during initial data load:", error);
      }
    };

    if (individuals.length === 0) {
      loadDefaultGedcom().finally(() => setIsInitialLoading(false));
    } else {
      setIsInitialLoading(false);
    }
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
        } catch (error) {
          console.error("Error parsing GEDCOM:", error);
          alert("Failed to parse the GEDCOM file.");
        }
      }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleAddManualSibling = (targetId: string, name: string) => {
    // 1. Find the family where targetId is a child
    const family = families.find(f => f.children.includes(targetId));
    if (!family) {
      alert("Kunde inte hitta föräldrar för den här personen. Det går bara att lägga till syskon till personer som har registrerade föräldrar.");
      return;
    }

    // 2. Create new individual
    const newId = `manual-${Date.now()}`;
    const newInd = {
      id: newId,
      name: name,
      sex: 'U', // Unknown
      birthDate: '',
      deathDate: '',
      birthPlace: '',
      deathPlace: '',
      events: []
    };

    // 3. Update families and individuals
    setIndividuals(prev => [...prev, newInd]);
    setFamilies(prev => prev.map(f => {
      if (f.id === family.id) {
        return { ...f, children: [...f.children, newId] };
      }
      return f;
    }));
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setGoogleApiKey(key);
    localStorage.setItem('slakten_google_api_key', key);
  };

  return (
    <div id="app-root" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div className="settings-container" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <button
          className="secondary-btn"
          onClick={() => setShowSettings(!showSettings)}
          style={{ padding: '6px 12px', fontSize: '0.8rem', display: urlReadOnly ? 'none' : 'block' }}
        >
          ⚙️ Inställningar
        </button>
        {showSettings && (
          <div style={{
            position: 'absolute', top: '35px', right: '0',
            background: 'var(--bg-secondary)', padding: '15px',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid var(--border-color)', width: '250px'
          }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>Google Maps API-nyckel (Valfritt)</label>
            <input
              type="text"
              value={googleApiKey}
              onChange={handleApiKeyChange}
              placeholder="AIzaSy..."
              style={{
                width: '100%', padding: '8px', borderRadius: '4px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
              }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
              Om du anger en nyckel laddas kartnålar 50x snabbare. Annars används gratisgränsen för OpenStreetMap (1 anrop/sek).
            </p>
            <button
              className="secondary-btn"
              onClick={() => {
                if (confirm('Är du säker på att du vill rensa plats-cachen? Detta tvingar appen att hämta alla koordinater på nytt.')) {
                  localStorage.removeItem('slakten_geocode_cache');
                  window.location.reload();
                }
              }}
              style={{ width: '100%', marginTop: '10px', fontSize: '0.75rem', color: '#e74c3c' }}
            >
              🗑️ Rensa Cache
            </button>

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '15px', paddingTop: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>Uppdatera Släktträd</label>
              <input
                type="file"
                id="gedcom-reupload"
                accept=".ged"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="gedcom-reupload" className="secondary-btn" style={{
                display: 'block',
                textAlign: 'center',
                padding: '8px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: 'var(--accent-color)',
                color: 'white',
                border: 'none'
              }}>
                📁 Välj ny .ged-fil
              </label>
            </div>
          </div>
        )}
      </div>

      <p className="app-subtitle">Visualisera Släktens Kopplingar & Platser</p>

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
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="view-switcher-container">
            <button
              onClick={() => setViewMode('tree')}
              className={`view-toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
            >
              Trädvy
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            >
              Karta
            </button>
            <button
              onClick={() => setViewMode('stats')}
              className={`view-toggle-btn ${viewMode === 'stats' ? 'active' : ''}`}
            >
              Statistik
            </button>
          </div>

          {viewMode === 'tree' ? (
            <div className="view-container">
              <ReactFlowProvider>
                <div className="react-flow-wrapper">
                  <FamilyTreeViewer
                    individuals={individuals}
                    families={families}
                    focusNodeId={focusNodeId}
                    onFocusClear={() => setFocusNodeId(null)}
                    onAddManualSibling={handleAddManualSibling}
                  />
                </div>
              </ReactFlowProvider>
            </div>
          ) : viewMode === 'map' ? (
            <div className="view-container">
              <FamilyMap
                individuals={individuals}
                families={families}
                sideMap={sideMap}
                generationMap={generationMap}
                locationsCache={locationsCache}
                loadingCount={geocodingStatus}
                onLocationUpdate={handleLocationUpdate}
                readOnly={urlReadOnly}
                onShowInTree={(id) => {
                  setFocusNodeId(id);
                  setViewMode('tree');
                }}
              />
            </div>
          ) : (
            <div className="view-container" style={{ overflowY: 'auto' }}>
              <FamilyStats
                individuals={individuals}
                families={families}
                generationMap={generationMap}
              />
            </div>
          )}

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
