import { parse } from 'parse-gedcom';

interface GedcomSourceNode {
    type: string;
    value?: string;
    data?: { xref_id?: string; pointer?: string };
    children?: GedcomSourceNode[];
}

export interface PersonSourceEvidence {
    /** GEDCOM source title or the original unresolved source reference. */
    label: string;
    /** Event to which the citation belongs, if the GEDCOM gives one. */
    context: string;
    page?: string;
}

export type SourceEvidenceByPerson = Map<string, PersonSourceEvidence[]>;

const CONTEXT_LABELS: Record<string, string> = {
    BIRT: 'Födelse', DEAT: 'Död', CHR: 'Dop', BAPM: 'Dop',
    RESI: 'Bostad', OCCU: 'Yrke', BURI: 'Begravning',
    MARR: 'Vigsel', DIV: 'Skilsmässa', NAME: 'Namn',
};

function childValue(node: GedcomSourceNode, type: string): string | undefined {
    const value = node.children?.find(child => child.type === type)?.value?.trim();
    return value || undefined;
}

function compactText(value: string | undefined): string | undefined {
    const text = value?.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 300) : undefined;
}

/** Read explicit GEDCOM SOUR citations without inferring a source from other facts. */
export function extractSourceEvidence(fileContent: string): SourceEvidenceByPerson {
    const root = parse(fileContent) as GedcomSourceNode;
    const records = root.children ?? [];
    const sourceTitles = new Map<string, string>();
    for (const record of records) {
        if (record.type !== 'SOUR' || !record.data?.xref_id) continue;
        const title = compactText(childValue(record, 'TITL') ?? childValue(record, 'AUTH') ?? record.value);
        if (title) sourceTitles.set(record.data.xref_id, title);
    }

    const evidence: SourceEvidenceByPerson = new Map();
    const dedupe = new Map<string, Set<string>>();
    const add = (personId: string, citation: PersonSourceEvidence) => {
        const key = `${citation.context}\u0000${citation.label}\u0000${citation.page ?? ''}`;
        const seen = dedupe.get(personId) ?? new Set<string>();
        if (seen.has(key)) return;
        seen.add(key);
        dedupe.set(personId, seen);
        const items = evidence.get(personId) ?? [];
        items.push(citation);
        evidence.set(personId, items);
    };

    const collect = (node: GedcomSourceNode, people: readonly string[], context: string, depth: number) => {
        if (depth > 8) return;
        if (node.type === 'SOUR') {
            const pointer = node.data?.pointer;
            const label = compactText((pointer ? sourceTitles.get(pointer) : undefined)
                ?? node.value ?? pointer);
            if (label) {
                const page = compactText(childValue(node, 'PAGE'));
                for (const personId of people) add(personId, { label, context, ...(page ? { page } : {}) });
            }
            return;
        }
        const nextContext = CONTEXT_LABELS[node.type] ?? context;
        for (const child of node.children ?? []) collect(child, people, nextContext, depth + 1);
    };

    for (const record of records) {
        if (record.type === 'INDI' && record.data?.xref_id) {
            for (const child of record.children ?? []) collect(child, [record.data.xref_id], 'Person', 0);
        } else if (record.type === 'FAM') {
            const people = (record.children ?? [])
                .filter(child => child.type === 'HUSB' || child.type === 'WIFE')
                .map(child => child.data?.pointer)
                .filter((id): id is string => Boolean(id));
            if (people.length) {
                for (const child of record.children ?? []) {
                    if (child.type === 'HUSB' || child.type === 'WIFE' || child.type === 'CHIL') continue;
                    collect(child, people, 'Familj', 0);
                }
            }
        }
    }
    return evidence;
}
