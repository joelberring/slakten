import { useMemo } from 'react';
import { calculateFamilyStats } from '../utils/stats';

interface Props {
    individuals: any[];
    families: any[];
    generationMap: Map<string, number>;
}

export function FamilyStats({ individuals, families, generationMap }: Props) {
    const stats = useMemo(() => calculateFamilyStats(individuals, families, generationMap), [individuals, families, generationMap]);

    return (
        <div className="stats-container">
            <div className="stats-header">
                <h2>Släktstatistik</h2>
                <p>Insikter från {stats.totalPeople} personer i trädet ({stats.peopleWithKnownAge} med känd ålder).</p>
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
            </div>
            <div className="stats-footer-spacer" style={{ height: '100px' }}></div>
        </div>
    );
}
