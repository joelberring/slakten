import { useState, useMemo } from 'react';
import { calculateFamilyStats } from '../utils/stats';
import type { FamilySide } from '../utils/relationship';
import '../tree-stats.css';

interface Props {
    individuals: any[];
    families: any[];
    generationMap: Map<string, number>;
    sideMap: Map<string, FamilySide>;
    visiblePersonIds?: Set<string> | null;
}

export function FamilyStats({ individuals, families, generationMap, sideMap, visiblePersonIds }: Props) {
    const [sideFilter, setSideFilter] = useState<'both' | 'father' | 'mother'>('both');

    const filteredData = useMemo(() => {
        if (!visiblePersonIds && sideFilter === 'both') return { individuals, families };

        const filteredInds = individuals.filter(ind => visiblePersonIds
            ? visiblePersonIds.has(ind.id)
            : sideMap.get(ind.id) === sideFilter || sideMap.get(ind.id) === 'both');

        const filteredIndIds = new Set(filteredInds.map(i => i.id));
        const filteredFams = families.flatMap(fam => {
            const husb = filteredIndIds.has(fam.husb) ? fam.husb : undefined;
            const wife = filteredIndIds.has(fam.wife) ? fam.wife : undefined;
            const children = (fam.children ?? []).filter((id: string) => filteredIndIds.has(id));
            return husb || wife || children.length ? [{ ...fam, husb, wife, children }] : [];
        });

        return { individuals: filteredInds, families: filteredFams };
    }, [individuals, families, sideMap, sideFilter, visiblePersonIds]);

    const stats = useMemo(() => calculateFamilyStats(filteredData.individuals, filteredData.families, generationMap), [filteredData, generationMap]);

    return (
        <div className="stats-container family-stats-surface">
            <div className="stats-header">
                <div className="stats-header-copy">
                    <span className="stats-kicker">UR SLÄKTMATERIALET</span>
                    <p>{visiblePersonIds ? 'Statistik för den valda personens släktgren.' : 'Välj en släktgren och utforska ålder, namn och platser genom generationerna.'}</p>
                </div>
                {!visiblePersonIds && <div className="side-filter-container" role="group" aria-label="Välj släktgren">
                    <button type="button" onClick={() => setSideFilter('both')} aria-pressed={sideFilter === 'both'}>Båda sidor</button>
                    <button type="button" onClick={() => setSideFilter('father')} aria-pressed={sideFilter === 'father'}>Pappas sida</button>
                    <button type="button" onClick={() => setSideFilter('mother')} aria-pressed={sideFilter === 'mother'}>Mammas sida</button>
                </div>}
            </div>

            <div className="stats-summary" aria-label="Sammanfattning">
                <div className="stats-summary-item"><span>Personer i urvalet</span><strong>{stats.totalPeople.toLocaleString('sv-SE')}</strong></div>
                <div className="stats-summary-item"><span>Med känd livslängd</span><strong>{stats.peopleWithKnownAge.toLocaleString('sv-SE')}</strong></div>
                <div className="stats-summary-item"><span>Århundraden med data</span><strong>{stats.avgAgeByCentury.length}</strong></div>
            </div>

            <div className="stats-grid">
                {/* Average Age by Generation */}
                <div className="stats-card">
                    <span className="stats-card-kicker">01 / LIVSLÄNGD</span>
                    <h3>Medelålder per generation</h3>
                    <div className="chart-container">
                        {stats.avgAgeByGeneration.map(item => (
                            <div key={item.generation} className="chart-row">
                                <div className="chart-label">Gen. {item.generation}</div>
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
                    <span className="stats-card-kicker">02 / TID</span>
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
                    <span className="stats-card-kicker">03 / NAMN</span>
                    <h3>Vanligaste mansnamnen</h3>
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
                    <span className="stats-card-kicker">04 / NAMN</span>
                    <h3>Vanligaste kvinnonamnen</h3>
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

                <div className="stats-card full-width">
                    <span className="stats-card-kicker">05 / FAMILJ</span>
                    <h3>Ålder när barnen föddes</h3>
                    <div className="parental-age-summary">
                        <div className="parental-age-metric father">
                            <span>Pappor · medelålder</span>
                            <strong>{stats.avgParentalAge.total.fatherCount ? `${stats.avgParentalAge.total.father} år` : '—'}</strong>
                            <small>Baserat på {stats.avgParentalAge.total.fatherCount} födslar</small>
                        </div>
                        <div className="parental-age-metric mother">
                            <span>Mammor · medelålder</span>
                            <strong>{stats.avgParentalAge.total.motherCount ? `${stats.avgParentalAge.total.mother} år` : '—'}</strong>
                            <small>Baserat på {stats.avgParentalAge.total.motherCount} födslar</small>
                        </div>
                    </div>

                    <div className="parental-age-breakdown">
                        <div>
                            <h4>Per generation</h4>
                            <div className="chart-container">
                                {stats.avgParentalAge.byGeneration.map(item => (
                                    <div key={item.generation} className="chart-row duo-bar">
                                        <div className="chart-label">Gen. {item.generation}</div>
                                        <div className="chart-bar-bg dual">
                                            <div className="bar-set">
                                                <div className="chart-bar" style={{ width: `${(item.fatherAvg / 60) * 100}%` }}>
                                                    <span className="bar-value">{item.fatherAvg}</span>
                                                </div>
                                                <div className="chart-bar" style={{ width: `${(item.motherAvg / 60) * 100}%` }}>
                                                    <span className="bar-value">{item.motherAvg}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4>Per århundrade</h4>
                            <div className="chart-container">
                                {stats.avgParentalAge.byCentury.map(item => (
                                    <div key={item.century} className="chart-row duo-bar">
                                        <div className="chart-label">{item.century}</div>
                                        <div className="chart-bar-bg dual">
                                            <div className="bar-set">
                                                <div className="chart-bar" style={{ width: `${(item.fatherAvg / 60) * 100}%` }}>
                                                    <span className="bar-value">{item.fatherAvg}</span>
                                                </div>
                                                <div className="chart-bar" style={{ width: `${(item.motherAvg / 60) * 100}%` }}>
                                                    <span className="bar-value">{item.motherAvg}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <p className="parental-age-legend"><span className="parental-age-dot father" /> Pappor <span className="parental-age-dot mother" /> Mammor · år</p>
                </div>

                {/* Common Places by Generation */}
                <div className="stats-card full-width">
                    <span className="stats-card-kicker">06 / PLATSER</span>
                    <h3>Vanligaste platserna per generation</h3>
                    <div className="places-grid">
                        {stats.commonPlacesByGeneration.map(genItem => (
                            <div key={genItem.generation} className="gen-places-card">
                                <h4>
                                    Generation {genItem.generation}
                                </h4>
                                <div className="gen-places-list">
                                    {genItem.places.length > 0 ? genItem.places.map((place, pIdx) => (
                                        <div key={place.name} className="gen-place-item">
                                            <span title={place.name}>
                                                {pIdx + 1}. {place.name}
                                            </span>
                                            <strong>{place.count} st</strong>
                                        </div>
                                    )) : (
                                        <p className="stats-empty">Ingen platsdata tillgänglig</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div >
    );
}
