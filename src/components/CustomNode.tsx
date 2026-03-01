import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const CustomNode = memo(({ data }: any) => {
    const isMale = data.sex === 'M';
    const isFemale = data.sex === 'F';
    const highlightClass = data.isHighlighted ? 'highlighted' : data.isDimmed ? 'dimmed' : '';

    return (
        <div className={`individual-node ${isMale ? 'male' : isFemale ? 'female' : ''} ${highlightClass} ${data.isExpanded ? 'expanded' : ''}`}>
            <Handle type="target" position={Position.Top} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />

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

            <div className="node-content">
                <div className="node-header">{data.name}</div>
                <div className="node-dates">
                    {data.birthDate ? `✶ ${data.birthDate}` : ''}
                    {data.birthDate && data.deathDate ? ' — ' : ''}
                    {data.deathDate ? `✝ ${data.deathDate}` : ''}
                </div>
                {(data.birthPlace || data.deathPlace) && (
                    <div className="node-locality" title={data.birthPlace || data.deathPlace}>
                        📍 {data.birthPlace || data.deathPlace}
                    </div>
                )}
            </div>

            {data.hasSiblings && (
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
            <Handle type="source" position={Position.Bottom} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />
        </div>
    );
});
