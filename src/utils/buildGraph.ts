import type { Edge, Node } from '@xyflow/react';

export function buildGraph(individuals: any[], families: any[]) {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    individuals.forEach((ind) => {
        nodes.push({
            id: ind.id,
            type: 'customNode',
            data: {
                id: ind.id,
                name: ind.name,
                birthDate: ind.birthDate,
                deathDate: ind.deathDate,
                birthPlace: ind.birthPlace,
                deathPlace: ind.deathPlace,
                sex: ind.sex,
                type: 'individual',
            },
            position: { x: 0, y: 0 },
        });
    });

    families.forEach((fam) => {
        // Add a union node for the family
        nodes.push({
            id: fam.id,
            type: 'familyNode',
            data: { type: 'family' },
            position: { x: 0, y: 0 },
        });

        if (fam.husb) {
            edges.push({
                id: `e-${fam.husb}-${fam.id}`,
                source: fam.husb,
                target: fam.id,
                type: 'smoothstep',
            });
        }

        if (fam.wife) {
            edges.push({
                id: `e-${fam.wife}-${fam.id}`,
                source: fam.wife,
                target: fam.id,
                type: 'smoothstep',
            });
        }

        fam.children.forEach((childId: string) => {
            edges.push({
                id: `e-${fam.id}-${childId}`,
                source: fam.id,
                target: childId,
                type: 'smoothstep',
            });
        });
    });

    return { nodes, edges };
}
