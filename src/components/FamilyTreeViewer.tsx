import { useState, useEffect, useCallback } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Background,
    Controls,
    MiniMap,
    Panel,
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
    const [collapsedFamilyIds, setCollapsedFamilyIds] = useState<Set<string>>(new Set());

    const toggleFamily = useCallback((familyId: string) => {
        setCollapsedFamilyIds(prev => {
            const next = new Set(prev);
            if (next.has(familyId)) next.delete(familyId);
            else next.add(familyId);
            return next;
        });
    }, []);

    useEffect(() => {
        if (individuals.length > 0 && families.length > 0) {
            const { nodes: initialNodes, edges: initialEdges } = buildGraph(individuals, families);

            // Inject toggle handler and state into data
            const enrichedNodes = initialNodes.map(node => {
                if (node.type === 'familyNode') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            id: node.id,
                            onToggle: toggleFamily,
                            isCollapsed: collapsedFamilyIds.has(node.id)
                        }
                    };
                }
                return node;
            });

            // Filtering Logic: Hide descendants of collapsed families
            const visibleNodeIds = new Set<string>();
            const visibleEdgeIds = new Set<string>();

            // Find roots (individuals without parents or the specific Joel/Annika roots)
            const joel = individuals.find(i => i.name?.toLowerCase().includes('joel') && i.name?.toLowerCase().includes('berring'));
            const annika = individuals.find(i => i.name?.toLowerCase().includes('annika') && i.name?.toLowerCase().includes('messing'));
            const startNodes = [joel?.id, annika?.id].filter(Boolean) as string[];

            const traverse = (nodeId: string) => {
                if (visibleNodeIds.has(nodeId)) return;
                visibleNodeIds.add(nodeId);

                // Find outgoing edges
                const outgoingEdges = initialEdges.filter(e => e.source === nodeId);

                // If this is a collapsed family node, don't follow edges to children (descendants)
                if (collapsedFamilyIds.has(nodeId)) {
                    // We DO allow edges to parents if we were going upwards, 
                    // but buildGraph is mostly children direction... wait.
                    // In our graph: Parents -> Family Node -> Children.
                    return;
                }

                outgoingEdges.forEach(edge => {
                    visibleEdgeIds.add(edge.id);
                    traverse(edge.target);
                });

                // Also follow incoming edges (to find ancestors) - ancestors should usually always be visible?
                // Or maybe we only collapse "downwards" (ancestors). 
                // In genealogy, "up" is ancestors. The graph is TB (Top to Bottom).
                // So Top = Ancestors.
                // If we collapse a family, we hide the CHILDREN (bottom).
                // Let's stick to: Follow ALL edges except if source is a collapsed family.
            };

            // Also need to find ancestors. Let's do a simple recursive reachability from roots
            // but in BOTH directions.
            const queue = [...startNodes];
            const visited = new Set<string>(startNodes);

            while (queue.length > 0) {
                const currId = queue.shift()!;
                visibleNodeIds.add(currId);

                // Upwards (parents)
                initialEdges.filter(e => e.target === currId).forEach(edge => {
                    visibleEdgeIds.add(edge.id);
                    if (!visited.has(edge.source)) {
                        visited.add(edge.source);
                        queue.push(edge.source);
                    }
                });

                // Downwards (children)
                if (!collapsedFamilyIds.has(currId)) {
                    initialEdges.filter(e => e.source === currId).forEach(edge => {
                        visibleEdgeIds.add(edge.id);
                        if (!visited.has(edge.target)) {
                            visited.add(edge.target);
                            queue.push(edge.target);
                        }
                    });
                }
            }

            const filteredNodes = enrichedNodes.filter(n => visibleNodeIds.has(n.id));
            const filteredEdges = initialEdges.filter(e => visibleEdgeIds.has(e.id));

            try {
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                    filteredNodes,
                    filteredEdges,
                    'TB'
                );
                setBaseNodes(layoutedNodes);
                setBaseEdges(layoutedEdges);
                setNodes([...layoutedNodes]);
                setEdges([...layoutedEdges]);
            } catch (err) {
                console.error('Error computing layout:', err);
            }
        }
    }, [individuals, families, collapsedFamilyIds, toggleFamily, setNodes, setEdges]);

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

    const expandAll = useCallback(() => {
        setCollapsedFamilyIds(new Set());
    }, []);

    const collapseAll = useCallback(() => {
        const allFamilyIds = families.map(f => f.id);
        setCollapsedFamilyIds(new Set(allFamilyIds));
    }, [families]);

    // Initial collapse - only on first load with data
    const [hasInitializedCollapse, setHasInitializedCollapse] = useState(false);
    useEffect(() => {
        if (families.length > 0 && !hasInitializedCollapse) {
            collapseAll();
            setHasInitializedCollapse(true);
        }
    }, [families, hasInitializedCollapse, collapseAll]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.05}
            maxZoom={1.5}
            attributionPosition="bottom-right"
        >
            <Background color="#ffffff" gap={16} size={1} />
            <Controls style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fill: 'var(--text-primary)' }} />

            <Panel position="bottom-right" className="tree-controls-panel" style={{
                marginBottom: '80px', // Avoid overlap with bottom nav if it was there (but it's gone now?)
                display: 'flex', gap: '8px'
            }}>
                <button className="secondary-btn" onClick={expandAll} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>Visa Allt</button>
                <button className="secondary-btn" onClick={collapseAll} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>Dölj Allt</button>
            </Panel>

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
