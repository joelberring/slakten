import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const CustomNode = memo(({ data }: any) => {
    const isMale = data.sex === 'M';
    const isFemale = data.sex === 'F';
    const highlightClass = data.isHighlighted ? 'highlighted' : data.isDimmed ? 'dimmed' : '';

    return (
        <div className={`individual-node ${isMale ? 'male' : isFemale ? 'female' : ''} ${highlightClass} ${data.isExpanded ? 'expanded' : ''} ${data.isPrintMode ? 'print-mode' : ''}`}>
            <Handle type="target" position={data.isPrintMode ? Position.Left : Position.Top} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />

            {!data.isPrintMode && (
                <div className="node-controls-top">
                    <button
                        className={`expansion-toggle node-toggle ${data.isExpanded ? 'expanded' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onToggle?.(data.id);
                        }}
                        title={data.isExpanded ? "Dölj" : "Expandera föräldrar"}
                    >
                        {data.isExpanded ? '−' : '+'}
                    </button>
                    <button
                        className="action-btn expand-all-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onExpandAll?.(data.id);
                        }}
                        title="Expandera alla förfäder"
                    >
                        🚀
                    </button>
                </div>
            )}

            <div className="node-content">
                <div className="node-header">{data.name}</div>
                <div className="node-dates">
                    {data.birthDate ? `${data.isPrintMode ? 'f.' : '✶'} ${data.birthDate}` : ''}
                    {data.birthDate && data.deathDate ? (data.isPrintMode ? ' - ' : ' — ') : ''}
                    {data.deathDate ? `${data.isPrintMode ? 'd.' : '✝'} ${data.deathDate}` : ''}
                </div>
                {!data.isPrintMode && (data.birthPlace || data.deathPlace) && (
                    <div className="node-locality" title={data.birthPlace || data.deathPlace}>
                        📍 {data.birthPlace || data.deathPlace}
                    </div>
                )}
            </div>

            {!data.isPrintMode && data.hasSiblings && (
                <button
                    className={`action-btn sibling-toggle-btn ${data.siblingsExpanded ? 'active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onToggleSiblings?.(data.id);
                    }}
                    title={data.siblingsExpanded ? "Dölj syskon" : "Visa syskon"}
                >
                    {data.siblingsExpanded ? '👥−' : '👥+'}
                </button>
            )}

            {!data.isPrintMode && data.hasSpouse && (
                <button
                    className={`action-btn spouse-toggle-btn ${data.spousesExpanded ? 'active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onToggleSpouses?.(data.id);
                    }}
                    title={data.spousesExpanded ? "Dölj partner" : "Visa partner"}
                >
                    {data.spousesExpanded ? '💍−' : '💍+'}
                </button>
            )}
            <Handle type="source" position={data.isPrintMode ? Position.Right : Position.Bottom} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />
        </div>
    );
});
