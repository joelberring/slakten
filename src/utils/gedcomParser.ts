import { parse } from 'parse-gedcom';

export interface GedcomNode {
    type: string;
    data?: any;
    value?: string;
    children?: GedcomNode[];
}

export function parseGedcomData(fileContent: string) {
    const rawParsed = parse(fileContent);
    const parsed: GedcomNode[] = (rawParsed.children || []) as any;

    const individuals = new Map<string, any>();
    const families = new Map<string, any>();

    for (const node of parsed) {
        if (node.type === 'INDI' && node.data?.xref_id) {
            const id = node.data.xref_id;
            const children = node.children || [];
            const nameNode = children.find(n => n.type === 'NAME');
            const sexNode = children.find(n => n.type === 'SEX');

            const events: any[] = [];

            // Iterate through ALL children to catch multiple BIRT, DEAT, RESI, etc.
            children.forEach(child => {
                const type = child.type;
                if (['BIRT', 'DEAT', 'RESI', 'CHR', 'BAPM', 'OCCU', 'GRAD', 'BURI'].includes(type)) {
                    const dateNode = child.children?.find(n => n.type === 'DATE');
                    const placeNode = child.children?.find(n => n.type === 'PLAC');
                    if (placeNode?.value) {
                        events.push({
                            type,
                            date: dateNode?.value || '',
                            place: placeNode.value
                        });
                    }
                }
            });

            // Primary places for compatibility
            const birth = events.find(e => e.type === 'BIRT');
            const death = events.find(e => e.type === 'DEAT');

            individuals.set(id, {
                id: id,
                name: nameNode ? (nameNode.value || '').replace(/\//g, '') : 'Unknown',
                birthDate: birth?.date || '',
                birthPlace: birth?.place || '',
                deathDate: death?.date || '',
                deathPlace: death?.place || '',
                sex: sexNode?.value || 'U',
                events: events // New field with all geocodable events
            });

        } else if (node.type === 'FAM' && node.data?.xref_id) {
            const id = node.data.xref_id;
            const children = node.children || [];
            const husbNode = children.find(n => n.type === 'HUSB');
            const wifeNode = children.find(n => n.type === 'WIFE');
            const childrenNodes = children.filter(n => n.type === 'CHIL');

            // Collect all marriage events (some might have multiple)
            const marriageEvents: any[] = [];
            children.forEach(child => {
                if (child.type === 'MARR' || child.type === 'DIV') {
                    const dateNode = child.children?.find(n => n.type === 'DATE');
                    const placeNode = child.children?.find(n => n.type === 'PLAC');
                    if (placeNode?.value) {
                        marriageEvents.push({
                            type: child.type,
                            date: dateNode?.value || '',
                            place: placeNode.value
                        });
                    }
                }
            });

            const primaryMarr = marriageEvents.find(e => e.type === 'MARR');

            families.set(id, {
                id: id,
                husb: husbNode?.data?.pointer,
                wife: wifeNode?.data?.pointer,
                children: childrenNodes.map(n => n.data?.pointer).filter(Boolean),
                marriageDate: primaryMarr?.date || '',
                marriagePlace: primaryMarr?.place || '',
                events: marriageEvents
            });

        }
    }


    return { individuals: Array.from(individuals.values()), families: Array.from(families.values()) };
}
