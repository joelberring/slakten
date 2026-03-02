import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const famNodeSize = 30; // Matches CSS

export const getLayoutedElements = (
    nodes: Node[],
    edges: Edge[],
    direction = 'TB',
    options = { nodesep: 60, ranksep: 80, nodeWidth: 240, nodeHeight: 110 }
) => {
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: options.nodesep,
        ranksep: options.ranksep
    });

    nodes.forEach((node) => {
        const isFam = node.type === 'familyNode';
        dagreGraph.setNode(node.id, {
            width: isFam ? famNodeSize : options.nodeWidth,
            height: isFam ? famNodeSize : options.nodeHeight,
        });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const isFam = node.type === 'familyNode';
        const w = isFam ? famNodeSize : options.nodeWidth;
        const h = isFam ? famNodeSize : options.nodeHeight;
        const newNode = { ...node };

        newNode.position = {
            x: nodeWithPosition.x - w / 2,
            y: nodeWithPosition.y - h / 2,
        };

        return newNode;
    });

    return { nodes: newNodes, edges };
};
