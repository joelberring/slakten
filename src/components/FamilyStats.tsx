import { useState, useMemo } from 'react';
import { calculateFamilyStats } from '../utils/stats';
import type { FamilySide } from '../utils/relationship';

interface Props {
    individuals: any[];
    families: any[];
    generationMap: Map<string, number>;
    sideMap: Map<string, FamilySide>;
}

export function FamilyStats({ individuals, families, generationMap, sideMap }: Props) {
    const [sideFilter, setSideFilter] = useState<'both' | 'father' | 'mother'>('both');

    const filteredData = useMemo(() => {
        if (sideFilter === 'both') return { individuals, families };

        const filteredInds = individuals.filter(ind => {
            const side = sideMap.get(ind.id);
            return side === sideFilter || side === 'both';
        });

        const filteredIndIds = new Set(filteredInds.map(i => i.id));
        const filteredFams = families.filter(fam => {
            // A family is included if either parent or any child is in the filtered list
            return filteredIndIds.has(fam.husb) || filteredIndIds.has(fam.wife) || fam.children.some((cId: string) => filteredIndIds.has(cId));
        });

        return { individuals: filteredInds, families: filteredFams };
    }, [individuals, families, sideMap, sideFilter]);

    const stats = useMemo(() => calculateFamilyStats(filteredData.individuals, filteredData.families, generationMap), [filteredData, generationMap]);

    return (
        <div className="stats-container">
            <div className="stats-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                        <h2>Släktstatistik</h2>
                        <p>Insikter från {stats.totalPeople} personer i trädet ({stats.peopleWithKnownAge} med känd ålder).</p>
                    </div>

                    <div className="side-filter-container" style={{
                        display: 'flex',
                        background: 'var(--bg-secondary)',
                        padding: '4px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <button
                            onClick={() => setSideFilter('both')}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '8px',
                                background: sideFilter === 'both' ? 'var(--accent-color)' : 'transparent',
                                color: sideFilter === 'both' ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                        >
                            Båda sidor
                        </button>
                        <button
                            onClick={() => setSideFilter('father')}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '8px',
                                background: sideFilter === 'father' ? 'var(--male-color)' : 'transparent',
                                color: sideFilter === 'father' ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                        >
                            Pappas sida
                        </button>
                        <button
                            onClick={() => setSideFilter('mother')}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '8px',
                                background: sideFilter === 'mother' ? 'var(--female-color)' : 'transparent',
                                color: sideFilter === 'mother' ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                        >
                            Mammas sida
                        </button>
                    </div>
                </div>
            </div>

            <div className="stats-grid">
                {/* Average Age by Generation */}
                <div className="stats-card">
                    <h3>Medelålder per generation</h3>
                    <div className="chart-container">
                        {stats.avgAgeByGeneration.map(item => (
                            <div key={item.generation} className="chart-row">
                                <div className="chart-label">Generation {item.generation}</div>
                                <div className="chart-bar-bg">
                                    <div
                                        className="chart-bar"
                                        style={{ width: `${(item.avgAge / 100) * 100}%` }}
                                    >
                                        <span className="bar-value">{item.avgAge} år</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Average Age by Century */}
                <div className="stats-card">
                    <h3>Medelålder per århundrade</h3>
                    <div className="chart-container">
                        {stats.avgAgeByCentury.map(item => (
                            <div key={item.century} className="chart-row">
                                <div className="chart-label">{item.century}</div>
                                <div className="chart-bar-bg">
                                    <div
                                        className="chart-bar accent-bar"
                                        style={{ width: `${(item.avgAge / 100) * 100}%` }}
                                    >
                                        <span className="bar-value">{item.avgAge} år</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Common Male Names */}
                <div className="stats-card">
                    <h3>Vanligaste Mansnamnen</h3>
                    <div className="name-list">
                        {stats.commonMaleNames.map((item, idx) => (
                            <div key={item.name} className="name-item">
                                <span className="name-rank">{idx + 1}.</span>
                                <span className="name-text">{item.name}</span>
                                <span className="name-count">{item.count} st</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Common Female Names */}
                <div className="stats-card">
                    <h3>Vanligaste Kvinnonamnen</h3>
                    <div className="name-list">
                        {stats.commonFemaleNames.map((item, idx) => (
                            <div key={item.name} className="name-item">
                                <span className="name-rank">{idx + 1}.</span>
                                <span className="name-text">{item.name}</span>
                                <span className="name-count">{item.count} st</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Parental Age at Birth */}
                <div className="stats-card full-width">
                    <h3>Genomsnittlig ålder vid barns födelse (Totalt)</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '15px', marginBottom: '30px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--male-color)' }}>{stats.avgParentalAge.total.father}</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Pappor (medelålder)</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Baserat på {stats.avgParentalAge.total.fatherCount} födslar</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--female-color)' }}>{stats.avgParentalAge.total.mother}</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Mammor (medelålder)</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Baserat på {stats.avgParentalAge.total.motherCount} födslar</div>
                        </div>
                    </div>

                    <div className="parental-age-breakdown" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                        <div>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', opacity: 0.9 }}>Per Generation</h4>
                            <div className="chart-container">
                                {stats.avgParentalAge.byGeneration.map(item => (
                                    <div key={item.generation} className="chart-row duo-bar">
                                        <div className="chart-label">Gen {item.generation}</div>
                                        <div className="chart-bar-bg dual">
                                            <div className="bar-set">
                                                <div className="chart-bar" style={{ width: `${(item.fatherAvg / 60) * 100}%`, background: 'var(--male-color)' }}>
                                                    <span className="bar-value">{item.fatherAvg}</span>
                                                </div>
                                                <div className="chart-bar" style={{ width: `${(item.motherAvg / 60) * 100}%`, background: 'var(--female-color)' }}>
                                                    <span className="bar-value">{item.motherAvg}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', opacity: 0.9 }}>Per Århundrade</h4>
                            <div className="chart-container">
                                {stats.avgParentalAge.byCentury.map(item => (
                                    <div key={item.century} className="chart-row duo-bar">
                                        <div className="chart-label" style={{ fontSize: '0.6rem' }}>{item.century}</div>
                                        <div className="chart-bar-bg dual">
                                            <div className="bar-set">
                                                <div className="chart-bar" style={{ width: `${(item.fatherAvg / 60) * 100}%`, background: 'var(--male-color)' }}>
                                                    <span className="bar-value">{item.fatherAvg}</span>
                                                </div>
                                                <div className="chart-bar" style={{ width: `${(item.motherAvg / 60) * 100}%`, background: 'var(--female-color)' }}>
                                                    <span className="bar-value">{item.motherAvg}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Common Places by Generation */}
                <div className="stats-card full-width">
                    <h3>Vanligaste bostadsorterna per generation</h3>
                    <div className="places-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '15px',
                        marginTop: '15px'
                    }}>
                        {stats.commonPlacesByGeneration.map(genItem => (
                            <div key={genItem.generation} className="gen-places-card" style={{
                                background: 'rgba(255,255,255,0.03)',
                                padding: '15px',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--accent-color)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '5px' }}>
                                    Generation {genItem.generation === 1 ? '1 (Joel/Annika)' : genItem.generation}
                                </h4>
                                <div className="gen-places-list">
                                    {genItem.places.length > 0 ? genItem.places.map((place, pIdx) => (
                                        <div key={place.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                                            <span style={{ opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                                                {pIdx + 1}. {place.name}
                                            </span>
                                            <span style={{ fontWeight: 600, opacity: 0.7 }}>{place.count} st</span>
                                        </div>
                                    )) : (
                                        <div style={{ fontSize: '0.75rem', opacity: 0.4, fontStyle: 'italic' }}>Ingen platsdata tillgänglig</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="stats-footer-spacer" style={{ height: '100px' }}></div>
        </div >
    );
}
