import { useState, useMemo } from 'react';
import { Panel } from '@xyflow/react';
import { findRelationshipPath, getPathEdges, getMultiplePathEdges, findAllCousinMarriages } from '../utils/relationship';

interface Props {
    individuals: any[];
    families: any[];

    onPathFound: (nodes: string[], edges: Set<string>) => void;
    onClear: () => void;
}

export function RelationshipFinder({ individuals, families, onPathFound, onClear }: Props) {
    const [mode, setMode] = useState<'relationship' | 'global'>('relationship');

    const [personA, setPersonA] = useState<string>('');
    const [personB, setPersonB] = useState<string>('');
    const [ancestorsOnly, setAncestorsOnly] = useState<boolean>(true);
    const [status, setStatus] = useState<string>('');
    const [globalResults, setGlobalResults] = useState<{ familyId: string, husb: string, wife: string, sharedAncestors: string[] }[] | null>(null);
    const [isOpen, setIsOpen] = useState(false);


    const sortedIndividuals = useMemo(() => {
        return [...individuals].sort((a, b) => a.name.localeCompare(b.name));
    }, [individuals]);

    const handleCalculateRelationship = () => {
        if (!personA || !personB) {
            setStatus('Vänligen välj två personer.');
            return;
        }

        const path = findRelationshipPath(families, personA, personB, ancestorsOnly);

        if (!path) {
            setStatus('Ingen släktskapskoppling hittades.');
            onClear();
        } else {
            setStatus(`Koppling hittad!`);
            const edges = getPathEdges(path);
            onPathFound(path, edges);
        }
    };

    const handleGlobalScan = () => {
        setStatus('Söker igenom hela släktträdet...');
        // Run in timeout to allow UI to update status
        setTimeout(() => {
            const results = findAllCousinMarriages(families);
            setGlobalResults(results);
            if (results.length === 0) {
                setStatus('Inga kusingiften eller anförlust hittades.');
            } else {
                setStatus(`Hittade ${results.length} äktenskap med gemensamma anor.`);
            }
        }, 50);
    };

    const handleSelectMarriage = (marriage: { familyId: string, husb: string, wife: string, sharedAncestors: string[] }) => {
        onClear(); // Reset first

        const allNodes = new Set<string>();
        const allPaths: string[][] = [];

        marriage.sharedAncestors.forEach(ancestorId => {
            const husbPath = findRelationshipPath(families, marriage.husb, ancestorId, true);
            const wifePath = findRelationshipPath(families, marriage.wife, ancestorId, true);

            if (husbPath) {
                husbPath.forEach(n => allNodes.add(n));
                allPaths.push(husbPath);
            }
            if (wifePath) {
                wifePath.forEach(n => allNodes.add(n));
                allPaths.push(wifePath);
            }
        });

        allNodes.add(marriage.husb);
        allNodes.add(marriage.wife);

        // Also capture the family node that connects them directly as spouses
        allNodes.add(marriage.familyId);

        const edges = getMultiplePathEdges(allPaths);

        // Add marriage edges
        edges.add(`e-${marriage.familyId}-${marriage.husb}`);
        edges.add(`e-${marriage.husb}-${marriage.familyId}`);
        edges.add(`e-${marriage.familyId}-${marriage.wife}`);
        edges.add(`e-${marriage.wife}-${marriage.familyId}`);

        onPathFound(Array.from(allNodes), edges);

        const husbName = individuals.find(i => i.id === marriage.husb)?.name || 'Okänd';
        const wifeName = individuals.find(i => i.id === marriage.wife)?.name || 'Okänd';
        setStatus(`Visar släktskap för kusiner: ${husbName} & ${wifeName}`);
    };

    const handleClear = () => {
        setPersonA('');
        setPersonB('');
        setStatus('');
        setGlobalResults(null);
        onClear();
    };


    return (
        <Panel position="top-right" className={`relationship-panel ${isOpen ? 'open' : ''}`}>
            <button
                className="legend-mobile-toggle"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'none', // Shown only on mobile via CSS
                }}
            >
                {isOpen ? 'Dölj Sök' : 'Sök Släktskap'}
            </button>

            <div className="panel-content">
                <h3>Analysverktyg</h3>

                <div className="tab-group">
                    <button
                        className={`tab-btn ${mode === 'relationship' ? 'active' : ''}`}
                        onClick={() => { setMode('relationship'); setStatus(''); setGlobalResults(null); }}
                    >
                        Släktskap
                    </button>
                    <button
                        className={`tab-btn ${mode === 'global' ? 'active' : ''}`}
                        onClick={() => { setMode('global'); setStatus(''); setGlobalResults(null); }}
                    >
                        Kusingiften
                    </button>
                </div>


                {mode === 'relationship' && (
                    <>
                        <div className="select-group">
                            <label>Person A</label>
                            <select value={personA} onChange={(e) => setPersonA(e.target.value)}>
                                <option value="">-- Välj person --</option>
                                {sortedIndividuals.map(ind => (
                                    <option key={ind.id} value={ind.id}>{ind.name} {ind.birthDate ? `(${ind.birthDate})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="select-group">
                            <label>Person B</label>
                            <select value={personB} onChange={(e) => setPersonB(e.target.value)}>
                                <option value="">-- Välj person --</option>
                                {sortedIndividuals.map(ind => (
                                    <option key={ind.id} value={ind.id}>{ind.name} {ind.birthDate ? `(${ind.birthDate})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="select-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={ancestorsOnly}
                                    onChange={(e) => setAncestorsOnly(e.target.checked)}
                                />
                                Endast blodsband (Gemensamma anor)
                            </label>
                        </div>

                        <div className="button-group">
                            <button className="primary-btn" onClick={handleCalculateRelationship}>Analysera</button>
                            <button className="secondary-btn" onClick={handleClear}>Rensa</button>
                        </div>
                    </>
                )}

                {mode === 'global' && (
                    <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                            Sök efter äktenskap där makarna delar gemensamma anor (kusingiften/anförlust).
                        </p>

                        <div className="button-group" style={{ marginBottom: '15px' }}>
                            <button className="primary-btn" onClick={handleGlobalScan}>Sök i trädet</button>
                            <button className="secondary-btn" onClick={handleClear}>Rensa</button>
                        </div>

                        {globalResults && globalResults.length > 0 && (
                            <div className="global-results" style={{ maxHeight: '250px', overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '10px' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>Hittade äktenskap:</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                                    {globalResults.map((result, idx) => {
                                        const husbName = individuals.find(i => i.id === result.husb)?.name || 'Okänd make';
                                        const wifeName = individuals.find(i => i.id === result.wife)?.name || 'Okänd maka';

                                        return (
                                            <li
                                                key={idx}
                                                style={{
                                                    padding: '8px',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s'
                                                }}
                                                className="result-item"
                                                onClick={() => handleSelectMarriage(result)}
                                            >
                                                <div style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{husbName} & {wifeName}</div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
                                                    Gemensamma anor: {result.sharedAncestors.length}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                {status && <div className="status-message">{status}</div>}
            </div>
        </Panel>
    );
}

// Add a little CSS helper right in the file or via index.css for the hover effect
const style = document.createElement('style');
style.textContent = `
    .result-item:hover {
        background-color: rgba(var(--accent-color-rgb), 0.1);
        border-radius: 4px;
    }
`;
document.head.appendChild(style);
