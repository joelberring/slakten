export type BranchMode = 'all' | 'ancestors' | 'descendants';

export interface ScopeFamily {
  husb?: string | null;
  wife?: string | null;
  children?: string[];
}

/** Follow recorded parent-child links in one direction, with a cycle guard. */
export function collectBranchPersonIds(
  families: ScopeFamily[],
  selectedPersonId: string | null,
  mode: BranchMode,
): Set<string> | null {
  if (!selectedPersonId || mode === 'all') return null;

  const relatives = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (!relatives.has(from)) relatives.set(from, new Set());
    relatives.get(from)!.add(to);
  };

  for (const family of families) {
    const parents = [family.husb, family.wife].filter((id): id is string => !!id);
    for (const child of family.children ?? []) {
      for (const parent of parents) {
        if (mode === 'ancestors') add(child, parent);
        else add(parent, child);
      }
    }
  }

  const found = new Set<string>([selectedPersonId]);
  const queue = [selectedPersonId];
  for (let index = 0; index < queue.length; index++) {
    for (const relative of relatives.get(queue[index]) ?? []) {
      if (found.has(relative)) continue;
      found.add(relative);
      queue.push(relative);
    }
  }
  return found;
}
