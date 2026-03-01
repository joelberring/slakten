import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const CustomNode = memo(({ data }: any) => {
    const isMale = data.sex === 'M';
    const isFemale = data.sex === 'F';
    const highlightClass = data.isHighlighted ? 'highlighted' : data.isDimmed ? 'dimmed' : '';

    return (
        <div className={`individual-node ${isMale ? 'male' : isFemale ? 'female' : ''} ${highlightClass} ${data.isExpanded ? 'expanded' : ''}`}>
            <Handle type="target" position={Position.Top} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />
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
                {!data.isExpanded && (
                    <button
                        className="expansion-toggle node-toggle"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onToggle?.(data.id);
                        }}
                    >
                        +
                    </button>
                )}
                {data.isExpanded && data.canCollapse && (
                    <button
                        className="expansion-toggle node-toggle expanded"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onToggle?.(data.id);
                        }}
                    >
                        −
                    </button>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} style={{ background: '#555', border: 'none', width: 8, height: 8 }} />
        </div>
    );
});
