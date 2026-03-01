import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const FamilyNode = memo(({ data }: any) => {
    const highlightClass = data?.isHighlighted ? 'highlighted' : data?.isDimmed ? 'dimmed' : '';

    return (
        <div className={`family-node ${highlightClass}`} title="Family Union">
            <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
            <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
        </div>
    );
});
