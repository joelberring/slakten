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
}

export function FamilyTreeViewer({ individuals, families, onFocusClear, focusNodeId }: Props) {
    const { setCenter } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Keep a clean copy of nodes/edges for resetting highlights easily without re-laying out
    const [baseNodes, setBaseNodes] = useState<Node[]>([]);
    const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
    const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
    const [siblingExpandedNodeIds, setSiblingExpandedNodeIds] = useState<Set<string>>(new Set());

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

    // Build a lookup: for each family node, which children does it have?
    const familyChildrenMap = useMemo(() => {
        const map = new Map<string, string[]>();
        families.forEach(f => map.set(f.id, f.children || []));
        return map;
    }, [families]);

    // Build a lookup: for each individual, which family nodes are they a child of?
    const childToFamilyMap = useMemo(() => {
        const map = new Map<string, string[]>();
        families.forEach(f => {
            (f.children || []).forEach((cId: string) => {
                if (!map.has(cId)) map.set(cId, []);
                map.get(cId)!.push(f.id);
            });
        });
        return map;
    }, [families]);

    const toggleSiblings = useCallback((nodeId: string) => {
        setSiblingExpandedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    // Check if a node has siblings that aren't yet visible
    const hasSiblings = useCallback((nodeId: string) => {
        const famIds = childToFamilyMap.get(nodeId) || [];
        for (const famId of famIds) {
            const children = familyChildrenMap.get(famId) || [];
            if (children.length > 1) return true;
        }
        return false;
    }, [childToFamilyMap, familyChildrenMap]);

    useEffect(() => {
        if (individuals.length > 0 && families.length > 0) {
            const { nodes: initialNodes, edges: initialEdges } = buildGraph(individuals, families);

            // Build edge adjacency for quick lookup
            const edgesByNode = new Map<string, Array<{ neighborId: string; edgeId: string; direction: 'up' | 'down' }>>();
            initialEdges.forEach(edge => {
                if (!edgesByNode.has(edge.source)) edgesByNode.set(edge.source, []);
                if (!edgesByNode.has(edge.target)) edgesByNode.set(edge.target, []);
                edgesByNode.get(edge.source)!.push({ neighborId: edge.target, edgeId: edge.id, direction: 'down' });
                edgesByNode.get(edge.target)!.push({ neighborId: edge.source, edgeId: edge.id, direction: 'up' });
            });

            // Visibility Logic: Recursive reachability based on expansion
            // Key change: when traversing FROM a family node DOWN to children,
            // only include the child that triggered the expansion, unless siblings are toggled
            const visibleNodeIds = new Set<string>(roots);
            const stack = [...roots];
            const visitedForVisibility = new Set<string>(roots);

            while (stack.length > 0) {
                const currId = stack.shift()!;

                if (expandedNodeIds.has(currId)) {
                    const neighbors = edgesByNode.get(currId) || [];
                    for (const { neighborId } of neighbors) {
                        const isFamilyNode = familyChildrenMap.has(neighborId);
                        const currIsFamilyNode = familyChildrenMap.has(currId);

                        // If current is a family node and neighbor is a child:
                        // Only show the child if either:
                        //   - The child is already in visibleNodeIds (it was the one that expanded up to this family)
                        //   - OR some visible child of this family has siblings toggled on
                        if (currIsFamilyNode && !isFamilyNode) {
                            const familyChildren = familyChildrenMap.get(currId) || [];
                            const isChildAlreadyVisible = visibleNodeIds.has(neighborId);
                            // Check if any already-visible child of this family has siblings expanded
                            const anySiblingToggled = familyChildren.some(cId => siblingExpandedNodeIds.has(cId) && visibleNodeIds.has(cId));

                            if (!isChildAlreadyVisible && !anySiblingToggled) {
                                continue; // Skip this sibling
                            }
                        }

                        visibleNodeIds.add(neighborId);
                        if (!visitedForVisibility.has(neighborId)) {
                            visitedForVisibility.add(neighborId);
                            stack.push(neighborId);
                        }
                    }
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
                    onToggleSiblings: toggleSiblings,
                    hasSiblings: hasSiblings(node.id),
                    siblingsExpanded: siblingExpandedNodeIds.has(node.id),
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
    }, [individuals, families, expandedNodeIds, siblingExpandedNodeIds, toggleNode, toggleSiblings, hasSiblings, familyChildrenMap, roots, setNodes, setEdges]);

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
