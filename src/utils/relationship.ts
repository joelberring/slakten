import { extractYear } from './dateUtils';

export function findRelationshipPath(families: any[], startId: string, endId: string, searchAncestorsOnly = false) {
    if (startId === endId) return [];

    const adj = new Map<string, string[]>();

    const addEdge = (u: string, v: string) => {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u)!.push(v);
    };

    families.forEach(fam => {
        fam.children.forEach((childId: string) => {
            addEdge(childId, fam.id);
            if (!searchAncestorsOnly) {
                addEdge(fam.id, childId);
            }
        });

        if (fam.husb) {
            addEdge(fam.id, fam.husb);
            if (!searchAncestorsOnly) {
                addEdge(fam.husb, fam.id);
            }
        }
        if (fam.wife) {
            addEdge(fam.id, fam.wife);
            if (!searchAncestorsOnly) {
                addEdge(fam.wife, fam.id);
            }
        }
    });

    if (searchAncestorsOnly) {
        return findCommonAncestorPath(adj, startId, endId);
    } else {
        return bfsShortestPath(adj, startId, endId);
    }
}

export function findDuplicateAncestors(families: any[], startId: string) {
    const adj = new Map<string, string[]>();

    const addEdge = (u: string, v: string) => {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u)!.push(v);
    };

    families.forEach(fam => {
        // Upwards only
        fam.children.forEach((childId: string) => {
            addEdge(childId, fam.id);
        });
        if (fam.husb) addEdge(fam.id, fam.husb);
        if (fam.wife) addEdge(fam.id, fam.wife);
    });

    // BFS to find all paths to all ancestors
    const queue: { id: string, path: string[] }[] = [{ id: startId, path: [startId] }];

    // Track how many independent paths reach a specific ancestor
    const ancestorPaths = new Map<string, string[][]>();

    while (queue.length > 0) {
        const { id, path } = queue.shift()!;

        if (!ancestorPaths.has(id)) {
            ancestorPaths.set(id, []);
        }

        // Only add if it's a completely distinct path (not just a sub-variation of the same branch)
        // For simplicity in pedigree collapse, if we reach the same node via different intermediate nodes,
        // it's a duplicate.
        ancestorPaths.get(id)!.push(path);

        const parents = adj.get(id) || [];
        for (const p of parents) {
            queue.push({ id: p, path: [...path, p] });
        }
    }

    // Filter to those with more than 1 distinct path 
    // (Meaning they are a common ancestor to different branches of the SAME person)
    const duplicates = new Map<string, string[][]>();
    for (const [id, paths] of ancestorPaths.entries()) {
        if (id === startId) continue; // skip self

        // We need to ensure the paths don't completely overlap just because of family nodes
        // A simple heuristic: if the first parent-node diverges, it's a true duplicate
        // But since we just want to highlight *any* pedigree collapse, we can just return all paths for nodes reached multiple times
        if (paths.length > 1) {
            duplicates.set(id, paths);
        }
    }

    // Since a duplicate ancestor will also make all THEIR ancestors duplicates, 
    // we want to find the *closest* duplicates (the ones where the branches actually merge).
    // We can just return everything and highlight it, creating a "heat map" of collapsed branches.
    return duplicates;
}

function bfsShortestPath(adj: Map<string, string[]>, startId: string, endId: string): string[] | null {
    const queue: string[] = [startId];
    const visited = new Set<string>();
    const parent = new Map<string, string>();

    visited.add(startId);

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === endId) return reconstructPath(parent, curr);

        const neighbors = adj.get(curr) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, curr);
                queue.push(neighbor);
            }
        }
    }
    return null;
}

function findCommonAncestorPath(upwardAdj: Map<string, string[]>, startId: string, endId: string): string[] | null {
    const startAncestors = new Map<string, string[]>();

    const queue1: { id: string, path: string[] }[] = [{ id: startId, path: [startId] }];
    while (queue1.length > 0) {
        const { id, path } = queue1.shift()!;
        if (!startAncestors.has(id)) {
            startAncestors.set(id, path);
            const parents = upwardAdj.get(id) || [];
            for (const p of parents) {
                queue1.push({ id: p, path: [...path, p] });
            }
        }
    }

    let shortestPath: string[] | null = null;
    let shortestLength = Infinity;

    const queue2: { id: string, path: string[] }[] = [{ id: endId, path: [endId] }];
    const visited2 = new Set<string>();

    while (queue2.length > 0) {
        const { id, path } = queue2.shift()!;

        if (!visited2.has(id)) {
            visited2.add(id);

            if (startAncestors.has(id)) {
                const pathToStart = startAncestors.get(id)!;
                const endPathReversed = [...path].reverse().slice(1);

                const fullPath = [...pathToStart, ...endPathReversed];
                if (fullPath.length < shortestLength) {
                    shortestLength = fullPath.length;
                    shortestPath = fullPath;
                }
            }

            const parents = upwardAdj.get(id) || [];
            for (const p of parents) {
                queue2.push({ id: p, path: [...path, p] });
            }
        }
    }

    return shortestPath;
}

function reconstructPath(parent: Map<string, string>, curr: string) {
    const path: string[] = [];
    let step: string | undefined = curr;
    while (step) {
        path.push(step);
        step = parent.get(step);
    }
    return path.reverse();
}

export function getPathEdges(pathNodes: string[]) {
    const edges = new Set<string>();
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const u = pathNodes[i];
        const v = pathNodes[i + 1];
        edges.add(`e-${u}-${v}`);
        edges.add(`e-${v}-${u}`);
    }
    return edges;
}

export function getMultiplePathEdges(paths: string[][]) {
    const edges = new Set<string>();
    paths.forEach(pathNodes => {
        for (let i = 0; i < pathNodes.length - 1; i++) {
            const u = pathNodes[i];
            const v = pathNodes[i + 1];
            edges.add(`e-${u}-${v}`);
            edges.add(`e-${v}-${u}`);
        }
    });
    return edges;
}

export function findAllCousinMarriages(families: any[]) {
    const adj = new Map<string, string[]>();

    const addEdge = (u: string, v: string) => {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u)!.push(v);
    };

    families.forEach(fam => {
        fam.children.forEach((childId: string) => {
            addEdge(childId, fam.id);
        });
        if (fam.husb) addEdge(fam.id, fam.husb);
        if (fam.wife) addEdge(fam.id, fam.wife);
    });

    const cousinMarriages: { familyId: string, husb: string, wife: string, sharedAncestors: string[] }[] = [];

    families.forEach(fam => {
        if (fam.husb && fam.wife) {
            const husbAnc = getAncestorsWithDistance(adj, fam.husb);
            const wifeAnc = getAncestorsWithDistance(adj, fam.wife);

            // First cousins share a grandparent (distance 2)
            // They should not share a parent (distance 1) -> siblings
            // And one should not be an ancestor of the other (distance 0 is self, but we check shared ancestors > 0)

            const sharedGrandparents = Array.from(husbAnc.keys()).filter(id =>
                husbAnc.get(id) === 2 && wifeAnc.get(id) === 2
            );

            const sharedParents = Array.from(husbAnc.keys()).filter(id =>
                husbAnc.get(id) === 1 && wifeAnc.get(id) === 1
            );

            // Not the same person, not siblings, share at least one grandparent
            if (fam.husb !== fam.wife && sharedParents.length === 0 && sharedGrandparents.length > 0) {
                cousinMarriages.push({
                    familyId: fam.id,
                    husb: fam.husb,
                    wife: fam.wife,
                    sharedAncestors: sharedGrandparents,
                });
            }
        }
    });

    return cousinMarriages;
}

function getAncestorsWithDistance(upwardAdj: Map<string, string[]>, startId: string): Map<string, number> {
    const ancestors = new Map<string, number>();
    const queue = [{ id: startId, dist: 0 }];

    while (queue.length > 0) {
        const { id, dist } = queue.shift()!;
        const parents = upwardAdj.get(id) || [];
        for (const p of parents) {
            if (!ancestors.has(p)) {
                ancestors.set(p, dist + 1);
                queue.push({ id: p, dist: dist + 1 });
            }
        }
    }
    return ancestors;
}



export type FamilySide = 'father' | 'mother' | 'both' | 'none';

export function tagIndividualsBySide(
    individuals: any[],
    families: any[],
    fatherId: string | undefined,
    motherId: string | undefined
): Map<string, FamilySide> {
    const sideMap = new Map<string, FamilySide>();
    const upAdj = new Map<string, string[]>(); // child -> [parents]
    const downAdj = new Map<string, string[]>(); // parent -> [children]

    families.forEach(fam => {
        const parents = [fam.husb, fam.wife].filter(Boolean) as string[];
        fam.children.forEach((childId: string) => {
            if (!upAdj.has(childId)) upAdj.set(childId, []);
            parents.forEach(p => {
                upAdj.get(childId)!.push(p);
                if (!downAdj.has(p)) downAdj.set(p, []);
                downAdj.get(p)!.push(childId);
            });
        });
    });

    const getAncestors = (startId: string | undefined) => {
        if (!startId) return new Set<string>();
        const res = new Set<string>();
        const queue = [startId];
        res.add(startId);
        while (queue.length > 0) {
            const curr = queue.shift()!;
            (upAdj.get(curr) || []).forEach(p => {
                if (!res.has(p)) { res.add(p); queue.push(p); }
            });
        }
        return res;
    };

    const getDescendants = (rootIds: Set<string>) => {
        const res = new Set<string>();
        const queue = Array.from(rootIds);
        queue.forEach(id => res.add(id));
        while (queue.length > 0) {
            const curr = queue.shift()!;
            (downAdj.get(curr) || []).forEach(c => {
                if (!res.has(c)) { res.add(c); queue.push(c); }
            });
        }
        return res;
    };

    const ancF = getAncestors(fatherId);
    const ancM = getAncestors(motherId);
    const descF = getDescendants(new Set(fatherId ? [fatherId] : []));
    const descM = getDescendants(new Set(motherId ? [motherId] : []));

    // Stricter Identity matching
    const indDetails = individuals.map(ind => ({
        id: ind.id,
        name: (ind.name || '').toLowerCase().replace(/[^a-zåäö\s]/g, ' ').trim(),
        bYear: extractYear(ind.birthDate),
        dYear: extractYear(ind.deathDate)
    })).filter(d => d.bYear || d.dYear);

    const bridgeNodes = new Set<string>();
    for (let i = 0; i < indDetails.length; i++) {
        for (let j = i + 1; j < indDetails.length; j++) {
            const d1 = indDetails[i];
            const d2 = indDetails[j];

            if (d1.bYear === d2.bYear && d1.dYear === d2.dYear) {
                const parts1 = d1.name.split(/\s+/).filter((p: string) => p.length > 1);
                const parts2 = d2.name.split(/\s+/).filter((p: string) => p.length > 1);

                // Very strict match: First and Last name tokens must match
                const firstMatch = parts1[0] === parts2[0];
                const lastMatch = parts1[parts1.length - 1] === parts2[parts2.length - 1];

                if (firstMatch && lastMatch && parts1.length >= 2 && parts2.length >= 2) {
                    // Check if they bridge the two root clusters
                    const relF = ancF.has(d1.id) || descF.has(d1.id) || ancF.has(d2.id) || descF.has(d2.id);
                    const relM = ancM.has(d1.id) || descM.has(d1.id) || ancM.has(d2.id) || descM.has(d2.id);

                    if (relF && relM) {
                        bridgeNodes.add(d1.id);
                        bridgeNodes.add(d2.id);
                    }
                }
            }
        }
    }

    // Process 'Both' set: Intersection of ancestors/descendants + bridge people and THEIR ancestors
    const sharedAnc = new Set<string>(Array.from(ancF).filter(id => ancM.has(id)));
    const sharedDesc = new Set<string>(Array.from(descF).filter(id => descM.has(id)));

    // Add bridges and bridge-ancestors
    const allBoth = new Set<string>([...sharedAnc, ...sharedDesc, ...bridgeNodes]);
    const bridgeQueue = Array.from(bridgeNodes);
    while (bridgeQueue.length > 0) {
        const curr = bridgeQueue.shift()!;
        (upAdj.get(curr) || []).forEach(p => {
            if (!allBoth.has(p)) { allBoth.add(p); bridgeQueue.push(p); }
        });
    }

    // Tag everything 'none' first
    individuals.forEach(ind => sideMap.set(ind.id, 'none'));

    // Tag 'both'
    allBoth.forEach(id => sideMap.set(id, 'both'));

    // Tag 'father' / 'mother' direct lines
    ancF.forEach(id => { if (sideMap.get(id) === 'none') sideMap.set(id, 'father'); });
    descF.forEach(id => { if (sideMap.get(id) === 'none') sideMap.set(id, 'father'); });
    ancM.forEach(id => { if (sideMap.get(id) === 'none') sideMap.set(id, 'mother'); });
    descM.forEach(id => { if (sideMap.get(id) === 'none') sideMap.set(id, 'mother'); });

    // Exclusive Clan Propagation:
    // Fill in siblings/uncles of exclusive ancestors (those who aren't 'both')
    const fillClan = (rootSet: Set<string>, side: FamilySide) => {
        const queue = Array.from(rootSet).filter(id => sideMap.get(id) === side);
        const visited = new Set<string>(queue);
        while (queue.length > 0) {
            const curr = queue.shift()!;
            // Go down to fill branch
            (downAdj.get(curr) || []).forEach(c => {
                if (sideMap.get(c) === 'none') {
                    sideMap.set(c, side);
                    if (!visited.has(c)) { visited.add(c); queue.push(c); }
                }
            });
            // Also go sideways to siblings (via parents) if parent is ONLY on this side
            (upAdj.get(curr) || []).forEach(p => {
                if (sideMap.get(p) === side) { // Parent is exclusive to this side
                    (downAdj.get(p) || []).forEach(sib => {
                        if (sideMap.get(sib) === 'none') {
                            sideMap.set(sib, side);
                            if (!visited.has(sib)) { visited.add(sib); queue.push(sib); }
                        }
                    });
                }
            });
        }
    };

    fillClan(ancF, 'father');
    fillClan(ancM, 'mother');

    return sideMap;
}

export function calculateGenerations(
    families: any[],
    rootIds: string[]
): Map<string, number> {
    const genMap = new Map<string, number>();
    const upAdj = new Map<string, string[]>(); // child -> [parents]
    const downAdj = new Map<string, string[]>(); // parent -> [children]

    families.forEach(fam => {
        const parents = [fam.husb, fam.wife].filter(Boolean) as string[];
        fam.children.forEach((childId: string) => {
            if (!upAdj.has(childId)) upAdj.set(childId, []);
            parents.forEach(p => {
                upAdj.get(childId)!.push(p);
                if (!downAdj.has(p)) downAdj.set(p, []);
                downAdj.get(p)!.push(childId);
            });
        });
    });

    const queue: { id: string, gen: number }[] = [];
    rootIds.forEach(id => {
        if (id) {
            queue.push({ id, gen: 1 });
            genMap.set(id, 1);
        }
    });

    // BFS Upwards (Ancestors)
    let head = 0;
    while (head < queue.length) {
        const { id, gen } = queue[head++];
        (upAdj.get(id) || []).forEach(p => {
            if (!genMap.has(p)) {
                genMap.set(p, gen + 1);
                queue.push({ id: p, gen: gen + 1 });
            }
        });
    }

    // BFS Downwards (Descendants)
    const dQueue: { id: string, gen: number }[] = [];
    rootIds.forEach(id => {
        if (id) {
            const currentGen = genMap.get(id) || 1;
            dQueue.push({ id, gen: currentGen });
        }
    });

    head = 0;
    while (head < dQueue.length) {
        const { id, gen } = dQueue[head++];
        (downAdj.get(id) || []).forEach(c => {
            if (!genMap.has(c)) {
                genMap.set(c, gen - 1);
                dQueue.push({ id: c, gen: gen - 1 });
            }
        });
    }

    return genMap;
}
