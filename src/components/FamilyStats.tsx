import { useMemo } from 'react';
import { calculateFamilyStats } from '../utils/stats';

interface Props {
    individuals: any[];
    generationMap: Map<string, number>;
}

export function FamilyStats({ individuals, generationMap }: Props) {
    const stats = useMemo(() => calculateFamilyStats(individuals, generationMap), [individuals, generationMap]);

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
            </div>
        </div>
    );
}
