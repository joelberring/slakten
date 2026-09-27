import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import '../tree-stats.css';

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
    onViewRings?: (id: string) => void;
    selectedPersonId?: string | null;
    visiblePersonIds?: Set<string> | null;
    onSelectPerson?: (id: string) => void;
}

export function FamilyTreeViewer({ individuals, families, onFocusClear, focusNodeId, onViewRings, selectedPersonId, visiblePersonIds, onSelectPerson }: Props) {
    const { setCenter, getNode, fitView } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [pathNodes, setPathNodes] = useState<Set<string>>(new Set());
    const [pathEdges, setPathEdges] = useState<Set<string>>(new Set());

    const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
    const [siblingExpandedNodeIds, setSiblingExpandedNodeIds] = useState<Set<string>>(new Set());
    const [spouseExpandedNodeIds, setSpouseExpandedNodeIds] = useState<Set<string>>(new Set());
    const [lastExpandedId, setLastExpandedId] = useState<string | null>(null);
    const [isPrintMode, setIsPrintMode] = useState(false);
    const centeredFocusRef = useRef<string | null>(null);
    const analysisFocusRef = useRef<string | null>(null);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    // Roots identification
    const joel = useMemo(() => individuals.find(i => i.name?.toLowerCase().includes('joel') && i.name?.toLowerCase().includes('berring')), [individuals]);
    const annika = useMemo(() => individuals.find(i => i.name?.toLowerCase().includes('annika') && i.name?.toLowerCase().includes('messing')), [individuals]);
    const roots = useMemo(() => [joel?.id, annika?.id].filter(Boolean) as string[], [joel, annika]);
    // Analysis paths can lie outside the two default branches. Keep every
    // highlighted node visible even when neither default root reaches it.
    const displayRoots = useMemo(() => [...new Set([
        ...roots,
        ...(selectedPersonId ? [selectedPersonId] : []),
        ...pathNodes,
    ])], [roots, selectedPersonId, pathNodes]);

    const toggleNode = useCallback((nodeId: string) => {
        setExpandedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
                setLastExpandedId(nodeId);
            }
            return next;
        });
    }, []);

    // Expand the route once for each focus request. React Flow updates the
    // node list during layout; that update must not start another expansion.
    useEffect(() => {
        if (!focusNodeId || individuals.length === 0 || families.length === 0) return;

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
            return next.size === prev.size ? prev : next;
        });
        if (foundPath) {
            setPathNodes(new Set(foundPath));
            setPathEdges(getPathEdges(foundPath));
        }
    }, [focusNodeId, individuals.length, families, roots]);

    useEffect(() => {
        if (!focusNodeId) {
            centeredFocusRef.current = null;
            return;
        }
        if (centeredFocusRef.current === focusNodeId) return;
        if (!nodes.some(node => node.id === focusNodeId)) return;
        let clearTimer: number | undefined;
        const centerTimer = window.setTimeout(() => {
            const targetNode = getNode(focusNodeId);
            if (!targetNode) return;
            centeredFocusRef.current = focusNodeId;
            setCenter(targetNode.position.x + (targetNode.measured?.width ?? 0) / 2,
                targetNode.position.y + (targetNode.measured?.height ?? 0) / 2,
                { zoom: 0.7, duration: 550 });
            clearTimer = window.setTimeout(() => onFocusClear?.(), 600);
        }, 250);
        return () => {
            window.clearTimeout(centerTimer);
            if (clearTimer !== undefined) window.clearTimeout(clearTimer);
        };
    }, [focusNodeId, nodes, getNode, setCenter, onFocusClear]);

    // Compute all direct ancestors of the roots to distinguish bloodline from "ingifta"
    const ancestorIds = useMemo(() => {
        const ancestors = new Set<string>();
        const stack = [...roots];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const id = stack.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            ancestors.add(id);

            // Find families where this person is a child to go up
            families.forEach(f => {
                if (f.children?.includes(id)) {
                    if (f.husb) stack.push(f.husb);
                    if (f.wife) stack.push(f.wife);
                }
            });
        }
        return ancestors;
    }, [roots, families]);

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
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
                setLastExpandedId(nodeId);
            }
            return next;
        });
    }, []);

    const toggleSpouses = useCallback((nodeId: string) => {
        setSpouseExpandedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
                setLastExpandedId(nodeId);
            }
            return next;
        });
    }, []);

    // Check if a node has siblings that aren't yet visible
    const hasSiblings = useCallback((nodeId: string) => {
        const famIds = childToFamilyMap.get(nodeId) || [];
        for (const famId of famIds) {
            const children = familyChildrenMap.get(famId) || [];
            const otherChildren = children.filter(cId => cId !== nodeId);
            if (otherChildren.some(cId => individuals.some(i => i.id === cId))) return true;
        }
        return false;
    }, [childToFamilyMap, familyChildrenMap, individuals]);

    const hasSpouse = useCallback((nodeId: string) => {
        // Only show ring for "ingifta" (spouse that is NOT an ancestor)
        return families.some(f => {
            const spouseId = f.husb === nodeId ? f.wife : (f.wife === nodeId ? f.husb : null);
            return spouseId && individuals.some(i => i.id === spouseId) && !ancestorIds.has(spouseId);
        });
    }, [families, individuals, ancestorIds]);

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

            // 1. Identify families that should show ALL members (downward/lateral/sibling expansion)
            // This includes:
            // - Families of roots
            // - Families where a parent has spouse expansion toggled
            // - Families where a child has sibling expansion toggled
            const fullVisibilityFamilies = new Set<string>();
            families.forEach(f => {
                const husbMatch = f.husb && (roots.includes(f.husb) || spouseExpandedNodeIds.has(f.husb));
                const wifeMatch = f.wife && (roots.includes(f.wife) || spouseExpandedNodeIds.has(f.wife));
                const childMatch = f.children.some((cId: string) => siblingExpandedNodeIds.has(cId));

                if (husbMatch || wifeMatch || childMatch) {
                    fullVisibilityFamilies.add(f.id);
                }
            });

            // 2. BFS for visibility
            const visibleNodeIds = new Set<string>(displayRoots);
            const stack = [...displayRoots];
            const visited = new Set<string>(displayRoots);

            while (stack.length > 0) {
                const currId = stack.shift()!;
                const currIsFamilyNode = familyChildrenMap.has(currId);

                // Individual nodes are traversed if root, expanded upwards, or expanded for spouses
                const shouldTraverse = currIsFamilyNode ||
                    displayRoots.includes(currId) ||
                    expandedNodeIds.has(currId) ||
                    spouseExpandedNodeIds.has(currId);

                if (shouldTraverse) {
                    const neighbors = edgesByNode.get(currId) || [];
                    for (const { neighborId } of neighbors) {
                        const neighborIsFamilyNode = familyChildrenMap.has(neighborId);

                        // If going from Family Node -> Individual (Child side)
                        if (currIsFamilyNode && !neighborIsFamilyNode) {
                            const familyChildren = familyChildrenMap.get(currId) || [];
                            const isChild = familyChildren.includes(neighborId);

                            if (isChild) {
                                // If family has full visibility, show all children
                                // Otherwise, only show if child is an "expander" or sibling toggled
                                const isFullVis = fullVisibilityFamilies.has(currId);
                                const isExpander = displayRoots.includes(neighborId) || expandedNodeIds.has(neighborId);
                                const isSiblingToggled = siblingExpandedNodeIds.has(neighborId);

                                if (!isFullVis && !isExpander && !isSiblingToggled) {
                                    continue;
                                }
                            }
                        }

                        // If going from Individual -> Family Node (lateral/spouse expansion)
                        if (!currIsFamilyNode && neighborIsFamilyNode) {
                            const family = families.find(f => f.id === neighborId);
                            if (family && (family.husb === currId || family.wife === currId)) {
                                if (!fullVisibilityFamilies.has(neighborId)) {
                                    continue;
                                }
                            }
                        }

                        visibleNodeIds.add(neighborId);
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
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
                    onViewRings,
                    onSelectPerson,
                    onExpandAll: (id: string) => {
                        const toExpand = new Set<string>();
                        const collectAncestors = (currentId: string) => {
                            if (toExpand.has(currentId)) return;
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
                    onToggleSpouses: toggleSpouses,
                    hasSiblings: hasSiblings(node.id),
                    hasSpouse: hasSpouse(node.id),
                    siblingsExpanded: siblingExpandedNodeIds.has(node.id),
                    spousesExpanded: spouseExpandedNodeIds.has(node.id),
                    isExpanded: expandedNodeIds.has(node.id),
                    canCollapse: !roots.includes(node.id)
                }
            }));

            try {
                const layoutDirection = isPrintMode ? 'LR' : 'TB';
                const spacing = isPrintMode
                    ? { nodesep: 25, ranksep: 15, nodeWidth: 180, nodeHeight: 50 }
                    : (isMobile ? { nodesep: 32, ranksep: 28, nodeWidth: 180, nodeHeight: 112 } : { nodesep: 46, ranksep: 34, nodeWidth: 250, nodeHeight: 116 });

                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                    enrichedNodes.map(n => ({ ...n, data: { ...n.data, isPrintMode } })),
                    visibleEdges,
                    layoutDirection,
                    spacing
                );
                const finalNodes = layoutedNodes.map(node => {
                    const isPath = pathNodes.has(node.id);
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isHighlighted: isPath,
                            isDimmed: pathNodes.size > 0 && !isPath,
                            isSelected: node.type === 'customNode' && node.id === selectedPersonId,
                            isOutsideScope: node.type === 'customNode' && !!visiblePersonIds && !visiblePersonIds.has(node.id),
                        }
                    };
                });

                const finalEdges = layoutedEdges.map(edge => {
                    const isPath = pathEdges.has(edge.id);
                    return {
                        ...edge,
                        className: isPath ? 'highlighted-edge' : (pathEdges.size > 0 ? 'dimmed-edge' :
                            visiblePersonIds && !visiblePersonIds.has(edge.source) && !visiblePersonIds.has(edge.target) ? 'scope-muted-edge' : ''),
                        animated: isPath,
                    };
                });

                setNodes(finalNodes);
                setEdges(finalEdges);

                // If no user pan interaction occurred, attempt to center
                // Wait a brief moment for React Flow to render the new nodes
                if (lastExpandedId) {
                    const node = layoutedNodes.find(n => n.id === lastExpandedId);
                    if (node) {
                        setCenter(node.position.x + 120, node.position.y + 150, { zoom: isMobile ? 0.6 : 0.8, duration: 800 });
                    }
                    setLastExpandedId(null);
                }
            } catch (err) {
                console.error('Error computing layout:', err);
            }
        }
    }, [individuals, families, expandedNodeIds, siblingExpandedNodeIds, spouseExpandedNodeIds, pathNodes, pathEdges, toggleNode, toggleSiblings, hasSiblings, familyChildrenMap, roots, displayRoots, setNodes, setEdges, isPrintMode, onViewRings, onSelectPerson, selectedPersonId, visiblePersonIds]);

    useEffect(() => {
        const focusId = analysisFocusRef.current;
        if (!focusId || !nodes.some(node => node.id === focusId)) return;
        const timer = window.setTimeout(() => {
            if (analysisFocusRef.current !== focusId || !getNode(focusId)) return;
            analysisFocusRef.current = null;
            // Fit the selected person only. Fitting an entire long ancestry
            // path makes the result imperceptibly small on a phone.
            void fitView({ nodes: [{ id: focusId }], maxZoom: isMobile ? 0.95 : 0.85, duration: 350, padding: 0.35 });
        }, 140);
        return () => window.clearTimeout(timer);
    }, [nodes, getNode, fitView, isMobile]);

    const handlePathFound = useCallback((pNodes: string[], pEdges: Set<string>) => {
        const pSet = new Set(pNodes);

        setPathNodes(pSet);
        setPathEdges(pEdges);

        // Ensure path nodes are visible in the layout tree
        setExpandedNodeIds(prev => {
            const next = new Set(prev);
            pNodes.forEach(n => next.add(n));
            return next;
        });

        // Recenter only after React Flow has mounted the new analysis nodes.
        analysisFocusRef.current = pNodes[0] ?? null;
    }, []);

    const handleClear = useCallback(() => {
        analysisFocusRef.current = null;
        setPathNodes(new Set());
        setPathEdges(new Set());
    }, []);

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
        <div className={`react-flow-wrapper family-tree-surface ${isPrintMode ? 'print-mode-enabled' : ''}`}>
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
                <Background color="#cbbfa9" gap={24} size={1} />
                <Controls />

                <Panel position="bottom-right" className="tree-controls-panel">
                    <button className={`secondary-btn ${isPrintMode ? 'active' : ''}`} onClick={() => setIsPrintMode(!isPrintMode)} aria-pressed={isPrintMode}>
                        {isPrintMode ? 'Standardvy' : 'Kompaktvy'}
                    </button>
                    <button className="secondary-btn" onClick={expandAll}>Visa allt</button>
                    <button className="secondary-btn" onClick={collapseAll}>Dölj allt</button>
                </Panel>

                <MiniMap
                    nodeColor={(node) => {
                        if (node.type === 'familyNode') return '#9d6e4e';
                        if (node.data?.sex === 'M') return '#496b5e';
                        if (node.data?.sex === 'F') return '#a87356';
                        return '#b6aa94';
                    }}
                    maskColor="rgba(51, 63, 49, 0.22)"
                />

                <RelationshipFinder
                    individuals={individuals}
                    families={families}
                    selectedPersonId={selectedPersonId}
                    onPathFound={handlePathFound}
                    onClear={handleClear}
                />
            </ReactFlow>
        </div>
    );
}
