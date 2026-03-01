import { useState, useEffect, useMemo } from 'react';
import { parseGedcomData } from './utils/gedcomParser';
import { geocodePlaces, updateLocationCache, hydrateGeocoderCache, type Coordinates } from './utils/geocoder';
import { tagIndividualsBySide, calculateGenerations, type FamilySide } from './utils/relationship';

import { FamilyTreeViewer } from './components/FamilyTreeViewer';
import { FamilyMap } from './components/FamilyMap';
import { ReactFlowProvider } from '@xyflow/react';
import './index.css';

function App() {
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'map'>('tree');
  const [googleApiKey, setGoogleApiKey] = useState<string>(() => localStorage.getItem('slakten_google_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);

  const urlReadOnly = useMemo(() => {
    return !window.location.search.includes('edit=true');
  }, []);

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
      loadDefaultGedcom();
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

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setGoogleApiKey(key);
    localStorage.setItem('slakten_google_api_key', key);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div className="settings-container" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <button
          className="secondary-btn"
          onClick={() => setShowSettings(!showSettings)}
          style={{ padding: '6px 12px', fontSize: '0.8rem', display: urlReadOnly ? 'none' : 'block' }}
        >
          ⚙️ Settings
        </button>
        {showSettings && (
          <div style={{
            position: 'absolute', top: '35px', right: '0',
            background: 'var(--bg-secondary)', padding: '15px',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid var(--border-color)', width: '250px'
          }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>Google Maps API Key (Optional)</label>
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
              If provided, map pins will load 50x faster. Otherwise, it defaults to the free 1 request/sec OpenStreetMap limits.
            </p>
            <button
              className="secondary-btn"
              onClick={() => {
                if (confirm('Are you sure you want to clear the geocode cache? This will force all places to be re-fetched.')) {
                  localStorage.removeItem('slakten_geocode_cache');
                  window.location.reload();
                }
              }}
              style={{ width: '100%', marginTop: '10px', fontSize: '0.75rem', color: '#e74c3c' }}
            >
              🗑️ Clear Cache
            </button>

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '15px', paddingTop: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>Update Family Tree</label>
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
                📁 Select New .ged File
              </label>
            </div>
          </div>
        )}
      </div>

      <h1 className="app-title">Berring Släktträd</h1>

      <p className="app-subtitle">Visualizing Family Connections & Intersections</p>

      {individuals.length === 0 ? (
        <div className="upload-overlay">
          <div className="upload-box">
            <h2>Welcome to Släktträd Visualizer</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Upload your GEDCOM (.ged) file to view a stunning interactive Directed Acyclic Graph of your family history.
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
                  Select GEDCOM File
                </label>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            background: 'var(--bg-secondary)',
            padding: '5px',
            borderRadius: '8px',
            display: 'flex',
            gap: '5px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <button
              onClick={() => setViewMode('tree')}
              className={`view-toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
            >
              Tree View
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            >
              Map View
            </button>
          </div>

          {viewMode === 'tree' ? (
            <ReactFlowProvider>
              <FamilyTreeViewer individuals={individuals} families={families} />
            </ReactFlowProvider>
          ) : (
            <FamilyMap
              individuals={individuals}
              families={families}
              sideMap={sideMap}
              generationMap={generationMap}
              locationsCache={locationsCache}
              loadingCount={geocodingStatus}
              onLocationUpdate={handleLocationUpdate}
              readOnly={urlReadOnly}
            />


          )}

        </div>
      )}
    </div>
  );
}

export default App;
