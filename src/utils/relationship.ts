import { extractYear } from './dateUtils.ts';

export interface RelationshipFamily {
    id: string;
    husb?: string;
    wife?: string;
    children: string[];
}

interface ParentLink { parentId: string; familyId: string }

export interface BloodRelationship {
    path: string[];
    commonAncestorId: string;
    generationsFromA: number;
    generationsFromB: number;
    label: string;
}

export interface SharedAncestryPair {
    familyId: string;
    familyIds: string[];
    husb: string;
    wife: string;
    sharedAncestors: string[];
    relationType: string;
    generationsFromHusb: number;
    generationsFromWife: number;
}

function parentLinks(families: readonly RelationshipFamily[]): Map<string, ParentLink[]> {
    const links = new Map<string, ParentLink[]>();
    for (const family of families) {
        for (const childId of family.children ?? []) {
            const parents = [family.husb, family.wife].filter((id): id is string => !!id && id !== childId);
            const current = links.get(childId) ?? [];
            for (const parentId of parents) {
                if (!current.some(link => link.parentId === parentId && link.familyId === family.id)) {
                    current.push({ parentId, familyId: family.id });
                }
            }
            links.set(childId, current);
        }
    }
    return links;
}

function ancestorRoutes(
    links: ReadonlyMap<string, ParentLink[]>,
    startId: string,
): Map<string, { generations: number; path: string[] }> {
    const routes = new Map<string, { generations: number; path: string[] }>([
        [startId, { generations: 0, path: [startId] }],
    ]);
    const queue = [startId];
    for (let index = 0; index < queue.length; index++) {
        const childId = queue[index];
        const route = routes.get(childId)!;
        for (const { parentId, familyId } of links.get(childId) ?? []) {
            if (routes.has(parentId)) continue;
            routes.set(parentId, {
                generations: route.generations + 1,
                path: [...route.path, familyId, parentId],
            });
            queue.push(parentId);
        }
    }
    return routes;
}

function closestSharedAncestors(
    first: ReadonlyMap<string, { generations: number }>,
    second: ReadonlyMap<string, { generations: number }>,
) {
    let bestSum = Infinity;
    let bestMax = Infinity;
    let match: { ancestors: string[]; firstGenerations: number; secondGenerations: number } | null = null;
    for (const [ancestorId, firstRoute] of first) {
        const secondRoute = second.get(ancestorId);
        if (!secondRoute) continue;
        const sum = firstRoute.generations + secondRoute.generations;
        const max = Math.max(firstRoute.generations, secondRoute.generations);
        if (sum < bestSum || (sum === bestSum && max < bestMax)) {
            bestSum = sum;
            bestMax = max;
            match = { ancestors: [ancestorId], firstGenerations: firstRoute.generations, secondGenerations: secondRoute.generations };
        } else if (sum === bestSum && max === bestMax && match &&
            firstRoute.generations === match.firstGenerations && secondRoute.generations === match.secondGenerations) {
            match.ancestors.push(ancestorId);
        }
    }
    return match;
}

export function describeBloodRelation(firstGenerations: number, secondGenerations: number): string {
    if (firstGenerations === 0 && secondGenerations === 0) return 'Samma person';
    if (firstGenerations === 0 || secondGenerations === 0) {
        const gap = Math.max(firstGenerations, secondGenerations);
        if (gap === 1) return 'Förälder och barn';
        if (gap === 2) return 'Mor-/farförälder och barnbarn';
        return `Ana och ättling, ${gap} generationer`;
    }
    if (firstGenerations === 1 && secondGenerations === 1) return 'Syskon';
    if (Math.min(firstGenerations, secondGenerations) === 1) {
        const gap = Math.max(firstGenerations, secondGenerations);
        return gap === 2 ? 'Förälders syskon och syskonbarn' : `Släkt via gemensam ana, ${firstGenerations} och ${secondGenerations} generationer`;
    }
    if (firstGenerations === secondGenerations) {
        if (firstGenerations === 2) return 'Kusiner';
        if (firstGenerations === 3) return 'Sysslingar';
        if (firstGenerations === 4) return 'Bryllingar';
    }
    if (Math.min(firstGenerations, secondGenerations) === 2 && Math.max(firstGenerations, secondGenerations) === 3) {
        return 'Kusin och kusinbarn';
    }
    return `Gemensamma anor, ${firstGenerations} och ${secondGenerations} generationer`;
}

/** Only recorded parent-child links count as blood ancestry; family nodes remain in the visual path. */
export function analyzeBloodRelationship(
    families: readonly RelationshipFamily[], startId: string, endId: string,
): BloodRelationship | null {
    if (!startId || !endId) return null;
    const links = parentLinks(families);
    const first = ancestorRoutes(links, startId);
    const second = ancestorRoutes(links, endId);
    const shared = closestSharedAncestors(first, second);
    if (!shared) return null;
    const commonAncestorId = shared.ancestors[0];
    const firstPath = first.get(commonAncestorId)!.path;
    const secondPath = second.get(commonAncestorId)!.path;
    return {
        path: [...firstPath, ...secondPath.slice(0, -1).reverse()],
        commonAncestorId,
        generationsFromA: shared.firstGenerations,
        generationsFromB: shared.secondGenerations,
        label: describeBloodRelation(shared.firstGenerations, shared.secondGenerations),
    };
}

export function findRelationshipPath(families: RelationshipFamily[], startId: string, endId: string, searchAncestorsOnly = false) {
    if (startId === endId) return [startId];

    if (searchAncestorsOnly) {
        return analyzeBloodRelationship(families, startId, endId)?.path ?? null;
    }

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

    return bfsShortestPath(adj, startId, endId);
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

export function findAllCousinMarriages(families: readonly RelationshipFamily[]): SharedAncestryPair[] {
    const links = parentLinks(families);
    const routesByPerson = new Map<string, ReturnType<typeof ancestorRoutes>>();
    const routesFor = (personId: string) => {
        let routes = routesByPerson.get(personId);
        if (!routes) {
            routes = ancestorRoutes(links, personId);
            routesByPerson.set(personId, routes);
        }
        return routes;
    };

    // A GEDCOM can contain several FAM records for the same pair. The blood
    // relationship is between people, so present that pair once and retain
    // every family record for highlighting.
    const pairs = new Map<string, SharedAncestryPair>();
    for (const family of families) {
        if (!family.husb || !family.wife || family.husb === family.wife) continue;
        const [firstId, secondId] = [family.husb, family.wife].sort();
        const pairKey = `${firstId}\u0000${secondId}`;
        const existing = pairs.get(pairKey);
        if (existing) {
            existing.familyIds.push(family.id);
            continue;
        }
        const shared = closestSharedAncestors(routesFor(family.husb), routesFor(family.wife));
        if (!shared) continue;
        pairs.set(pairKey, {
            familyId: family.id,
            familyIds: [family.id],
            husb: family.husb,
            wife: family.wife,
            sharedAncestors: shared.ancestors,
            relationType: describeBloodRelation(shared.firstGenerations, shared.secondGenerations),
            generationsFromHusb: shared.firstGenerations,
            generationsFromWife: shared.secondGenerations,
        });
    }
    return [...pairs.values()].sort((a, b) =>
        a.generationsFromHusb + a.generationsFromWife - b.generationsFromHusb - b.generationsFromWife ||
        a.familyId.localeCompare(b.familyId)
    );
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
