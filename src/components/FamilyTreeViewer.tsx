import { useState, useEffect, useCallback } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Background,
    Controls,
    MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CustomNode } from './CustomNode';
import { FamilyNode } from './FamilyNode';
import { buildGraph } from '../utils/buildGraph';
import { getLayoutedElements } from '../utils/layout';
import { RelationshipFinder } from './RelationshipFinder';

import type { Node, Edge } from '@xyflow/react';

const nodeTypes = {
    customNode: CustomNode,
    familyNode: FamilyNode,
};

interface Props {
    individuals: any[];
    families: any[];
}

export function FamilyTreeViewer({ individuals, families }: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Keep a clean copy of nodes/edges for resetting highlights easily without re-laying out
    const [baseNodes, setBaseNodes] = useState<Node[]>([]);
    const [baseEdges, setBaseEdges] = useState<Edge[]>([]);

    useEffect(() => {
        if (individuals.length > 0 && families.length > 0) {
            const { nodes: initialNodes, edges: initialEdges } = buildGraph(individuals, families);

            try {
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                    initialNodes,
                    initialEdges,
                    'TB'
                );
                setBaseNodes(layoutedNodes);
                setBaseEdges(layoutedEdges);
                // Initially show them without highlight states
                setNodes([...layoutedNodes]);
                setEdges([...layoutedEdges]);
            } catch (err) {
                console.error('Error computing layout:', err);
            }
        }
    }, [individuals, families, setNodes, setEdges]);

    const handlePathFound = useCallback((pathNodes: string[], pathEdges: Set<string>) => {
        const pSet = new Set(pathNodes);

        setNodes(baseNodes.map(node => {
            const isPath = pSet.has(node.id);
            return {
                ...node,
                data: {
                    ...node.data,
                    isHighlighted: isPath,
                    isDimmed: !isPath
                }
            };
        }));

        setEdges(baseEdges.map(edge => {
            const isPath = pathEdges.has(edge.id);
            return {
                ...edge,
                className: isPath ? 'highlighted-edge' : 'dimmed-edge',
                animated: isPath,
            };
        }));
    }, [baseNodes, baseEdges, setNodes, setEdges]);

    const handleClear = useCallback(() => {
        // Reset to base state
        setNodes(baseNodes.map(n => ({ ...n, data: { ...n.data, isHighlighted: false, isDimmed: false } })));
        setEdges(baseEdges.map(e => ({ ...e, className: '', animated: false })));
    }, [baseNodes, baseEdges, setNodes, setEdges]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            attributionPosition="bottom-right"
        >
            <Background color="#ffffff" gap={16} size={1} />
            <Controls style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fill: 'var(--text-primary)' }} />
            <MiniMap
                nodeColor={(node) => {
                    if (node.type === 'familyNode') return 'var(--accent-color)';
                    if (node.data?.sex === 'M') return 'var(--male-color)';
                    if (node.data?.sex === 'F') return 'var(--female-color)';
                    return '#eee';
                }}
                maskColor="rgba(0,0,0,0.5)"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            />

            <RelationshipFinder
                individuals={individuals}
                families={families}
                onPathFound={handlePathFound}
                onClear={handleClear}
            />
        </ReactFlow>
    );
}
