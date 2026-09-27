import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const CustomNode = memo(({ data }: any) => {
    const isMale = data.sex === 'M';
    const isFemale = data.sex === 'F';
    const highlightClass = data.isHighlighted ? 'highlighted' : data.isDimmed ? 'dimmed' : '';

    return (
        <div className={`individual-node ${isMale ? 'male' : isFemale ? 'female' : ''} ${highlightClass} ${data.isExpanded ? 'expanded' : ''} ${data.isPrintMode ? 'print-mode' : ''} ${data.isSelected ? 'person-selected' : ''} ${data.isOutsideScope ? 'person-outside-scope' : ''}`}>
            <Handle type="target" position={data.isPrintMode ? Position.Left : Position.Top} style={{ background: '#7e886f', border: '2px solid #fffdf8', width: 9, height: 9 }} />

            {!data.isPrintMode && (
                <div className="node-controls-top">
                    <button
                        type="button"
                        className={`expansion-toggle node-toggle ${data.isExpanded ? 'expanded' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onToggle?.(data.id);
                        }}
                        title={data.isExpanded ? 'Dölj föräldrar' : 'Visa föräldrar'}
                        aria-label={`${data.isExpanded ? 'Dölj' : 'Visa'} föräldrar till ${data.name}`}
                    >
                        {data.isExpanded ? '−' : '+'}
                    </button>
                    <button
                        type="button"
                        className="action-btn expand-all-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onExpandAll?.(data.id);
                        }}
                        title="Expandera alla förfäder"
                        aria-label={`Visa alla förfäder till ${data.name}`}
                    >
                        ⇈
                    </button>
                    {data.onViewRings && (
                        <button
                            type="button"
                            className="action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onViewRings(data.id);
                            }}
                            title="Visa denna person i årsringar"
                            aria-label={`Visa ${data.name} i årsringar`}
                        >
                            ◎
                        </button>
                    )}
                </div>
            )}

            <div className="node-content">
                <div className="node-header">{data.onSelectPerson && !data.isPrintMode
                    ? <button type="button" className="node-person-button nodrag" aria-label={`Visa uppgifter om ${data.name}`}
                        onClick={(event) => { event.stopPropagation(); data.onSelectPerson(data.id); }}>{data.name}</button>
                    : data.name}</div>
                <div className="node-dates">
                    {data.birthDate ? `f. ${data.birthDate}` : ''}
                    {data.birthDate && data.deathDate ? ' — ' : ''}
                    {data.deathDate ? `d. ${data.deathDate}` : ''}
                </div>
                {!data.isPrintMode && (data.birthPlace || data.deathPlace) && (
                    <div className="node-locality">
                        {data.birthPlace && <div className="locality-item" title={`Född: ${data.birthPlace}`}><span>Född</span> {data.birthPlace}</div>}
                        {data.deathPlace && <div className="locality-item" title={`Död: ${data.deathPlace}`}><span>Död</span> {data.deathPlace}</div>}
                    </div>
                )}
            </div>

            {!data.isPrintMode && data.hasSiblings && (
                <button
                    type="button"
                    className={`action-btn sibling-toggle-btn ${data.siblingsExpanded ? 'active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onToggleSiblings?.(data.id);
                    }}
                    title={data.siblingsExpanded ? "Dölj syskon" : "Visa syskon"}
                    aria-label={`${data.siblingsExpanded ? 'Dölj' : 'Visa'} syskon till ${data.name}`}
                >
                    {data.siblingsExpanded ? 'S−' : 'S+'}
                </button>
            )}

            {!data.isPrintMode && data.hasSpouse && (
                <button
                    type="button"
                    className={`action-btn spouse-toggle-btn ${data.spousesExpanded ? 'active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onToggleSpouses?.(data.id);
                    }}
                    title={data.spousesExpanded ? "Dölj partner" : "Visa partner"}
                    aria-label={`${data.spousesExpanded ? 'Dölj' : 'Visa'} partner till ${data.name}`}
                >
                    {data.spousesExpanded ? 'P−' : 'P+'}
                </button>
            )}
            <Handle type="source" position={data.isPrintMode ? Position.Right : Position.Bottom} style={{ background: '#7e886f', border: '2px solid #fffdf8', width: 9, height: 9 }} />
        </div>
    );
});
