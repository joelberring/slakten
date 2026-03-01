import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Background,
    Controls,
    MiniMap,
    Panel,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CustomNode } from './CustomNode';
import { FamilyNode } from './FamilyNode';
import { buildGraph } from '../utils/buildGraph';
import { getLayoutedElements } from '../utils/layout';
import { RelationshipFinder } from './RelationshipFinder';
import { findRelationshipPath, getPathEdges } from '../utils/relationship';

import type { Node, Edge } from '@xyflow/react';

const nodeTypes = {
    customNode: CustomNode,
    familyNode: FamilyNode,
};

interface Props {
    individuals: any[];
    families: any[];
    focusNodeId?: string | null;
    onFocusClear?: () => void;
    onAddManualSibling?: (targetId: string, name: string) => void;
}

export function FamilyTreeViewer({ individuals, families, onFocusClear, focusNodeId, onAddManualSibling }: Props) {
    const { setCenter } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Keep a clean copy of nodes/edges for resetting highlights easily without re-laying out
    const [baseNodes, setBaseNodes] = useState<Node[]>([]);
    const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
    const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

    // Roots identification
    const joel = useMemo(() => individuals.find(i => i.name?.toLowerCase().includes('joel') && i.name?.toLowerCase().includes('berring')), [individuals]);
    const annika = useMemo(() => individuals.find(i => i.name?.toLowerCase().includes('annika') && i.name?.toLowerCase().includes('messing')), [individuals]);
    const roots = useMemo(() => [joel?.id, annika?.id].filter(Boolean) as string[], [joel, annika]);

    const toggleNode = useCallback((nodeId: string) => {
        setExpandedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    // Unified effect to handle focusNodeId (e.g. from map view)
    useEffect(() => {
        if (!focusNodeId || individuals.length === 0 || families.length === 0) return;

        console.log(`Processing focusNodeId: ${focusNodeId}`);

        // 1. Find the path from roots to this node
        let foundPath: string[] | null = null;
        for (const rootId of roots) {
            const p = findRelationshipPath(families, rootId, focusNodeId, false);
            if (p && (!foundPath || p.length < foundPath.length)) {
                foundPath = p;
            }
        }

        // 2. Expand all nodes in the path OR just the target if no path found
        const nodesToExpand = foundPath ? foundPath : [focusNodeId];

        setExpandedNodeIds(prev => {
            const next = new Set(prev);
            nodesToExpand.forEach(id => next.add(id));
            return next;
        });

        // 3. Wait for layout to complete (nodes will have positions)
        // We'll use a local variable to keep track of retries for centering
        let retries = 0;
        const tryCenter = () => {
            const targetNode = nodes.find(n => n.id === focusNodeId);
            // If node exists and is not at (0,0) or has been layouted
            if (targetNode && (targetNode.position.x !== 0 || targetNode.position.y !== 0)) {
                console.log(`Centering on node: ${focusNodeId} at ${targetNode.position.x}, ${targetNode.position.y}`);

                // Highlight the path if we found one
                if (foundPath) {
                    const edges = getPathEdges(foundPath);
                    handlePathFound(foundPath, edges);
                }

                setCenter(targetNode.position.x, targetNode.position.y, { zoom: 0.7, duration: 1000 });

                // Clear the focus after a successful centering
                setTimeout(() => onFocusClear?.(), 1000);
            } else if (retries < 10) {
                retries++;
                setTimeout(tryCenter, 200);
            }
        };

        // Start checking for layouted nodes
        setTimeout(tryCenter, 300);

    }, [focusNodeId, individuals.length, families.length, roots, nodes.length]);

    useEffect(() => {
        if (individuals.length > 0 && families.length > 0) {
            const { nodes: initialNodes, edges: initialEdges } = buildGraph(individuals, families);

            // Visibility Logic: Recursive reachability based on expansion
            const visibleNodeIds = new Set<string>(roots);
            const stack = [...roots];
            const visitedForVisibility = new Set<string>(roots);

            while (stack.length > 0) {
                const currId = stack.shift()!;

                // If this node is expanded, all its neighbors are visible
                if (expandedNodeIds.has(currId)) {
                    initialEdges.forEach(edge => {
                        let neighborId: string | null = null;
                        if (edge.source === currId) neighborId = edge.target;
                        else if (edge.target === currId) neighborId = edge.source;

                        if (neighborId) {
                            visibleNodeIds.add(neighborId);
                            if (!visitedForVisibility.has(neighborId)) {
                                visitedForVisibility.add(neighborId);
                                stack.push(neighborId);
                            }
                        }
                    });
                }
            }

            // Visible edges are those where both source and target are visible
            const visibleEdges = initialEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
            const visibleNodes = initialNodes.filter(n => visibleNodeIds.has(n.id));

            // Enrich nodes with state and handlers
            const enrichedNodes = visibleNodes.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    id: node.id,
                    onToggle: toggleNode,
                    onExpandAll: (id: string) => {
                        const toExpand = new Set<string>();
                        const collectAncestors = (currentId: string) => {
                            toExpand.add(currentId);
                            const familiesWhereChild = families.filter(f => f.children.includes(currentId));
                            familiesWhereChild.forEach(f => {
                                if (f.husb) collectAncestors(f.husb);
                                if (f.wife) collectAncestors(f.wife);
                            });
                        };
                        collectAncestors(id);
                        setExpandedNodeIds(prev => {
                            const next = new Set(prev);
                            toExpand.forEach(eid => next.add(eid));
                            return next;
                        });
                    },
                    onAddSibling: (id: string) => {
                        const name = prompt("Ange namn för det nya syskonet:");
                        if (name && onAddManualSibling) {
                            onAddManualSibling(id, name);
                        }
                    },
                    isExpanded: expandedNodeIds.has(node.id),
                    canCollapse: !roots.includes(node.id)
                }
            }));

            try {
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                    enrichedNodes,
                    visibleEdges,
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
    }, [individuals, families, expandedNodeIds, toggleNode, roots, setNodes, setEdges]);

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
        const allIds = [
            ...individuals.map(i => i.id),
            ...families.map(f => f.id)
        ];
        setExpandedNodeIds(new Set(allIds));
    }, [individuals, families]);

    const collapseAll = useCallback(() => {
        setExpandedNodeIds(new Set(roots));
    }, [roots]);

    // Initial expansion
    const [hasInitialized, setHasInitialized] = useState(false);
    useEffect(() => {
        if (roots.length > 0 && !hasInitialized) {
            setExpandedNodeIds(new Set(roots));
            setHasInitialized(true);
        }
    }, [roots, hasInitialized]);


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
