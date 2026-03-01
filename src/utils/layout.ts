import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 80;
const famNodeSize = 20;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    dagreGraph.setGraph({ rankdir: direction, nodesep: 30, ranksep: 60 });

    nodes.forEach((node) => {
        const isFam = node.type === 'familyNode';
        dagreGraph.setNode(node.id, {
            width: isFam ? famNodeSize : nodeWidth,
            height: isFam ? famNodeSize : nodeHeight,
        });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const isFam = node.type === 'familyNode';
        const w = isFam ? famNodeSize : nodeWidth;
        const h = isFam ? famNodeSize : nodeHeight;
        const newNode = { ...node };

        // We are shifting the dagre node position (anchor=center center)
        // to the top left so it matches React Flow node anchor point (top left).
        newNode.position = {
            x: nodeWithPosition.x - w / 2,
            y: nodeWithPosition.y - h / 2,
        };

        return newNode;
    });

    return { nodes: newNodes, edges };
};
