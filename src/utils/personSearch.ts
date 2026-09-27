/** Normalize GEDCOM names before matching; slash removal can leave repeated spaces. */
export function normalizePersonSearch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('sv');
}

export function matchesPersonSearch(value: string, query: string): boolean {
    const search = normalizePersonSearch(query);
    return !!search && normalizePersonSearch(value).includes(search);
}
