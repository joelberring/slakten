/** A deliberately conservative, read-only review of the imported people. */
export interface ReviewPerson {
    id: string;
    name?: string;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
}

export interface UncertainDate {
    person: ReviewPerson;
    events: string[];
}

export interface DuplicateSuggestion {
    name: string;
    birthYear: number;
    people: ReviewPerson[];
}

export interface DataReviewSummary {
    people: ReviewPerson[];
    missingBirthYear: ReviewPerson[];
    missingDeathYear: ReviewPerson[];
    uncertainDates: UncertainDate[];
    duplicateSuggestions: DuplicateSuggestion[];
}

function yearIn(date: string | undefined): number | null {
    const match = date?.match(/\b\d{3,4}\b/);
    return match ? Number(match[0]) : null;
}

function isApproximate(date: string | undefined): boolean {
    if (!date) return false;
    return /\b(?:ABT|ABOUT|BEF|BEFORE|AFT|AFTER|BET|BETWEEN|FROM|TO|EST|ESTIMATED|CAL|CALCULATED|CIR|CIRCA|CA|OMKRING|FÖRE|EFTER)\b|~|\b\d{3,4}\s*[-–]\s*\d{3,4}\b/i.test(date);
}

function normalizedName(name: string | undefined): string {
    return (name ?? '').normalize('NFKC').toLocaleLowerCase('sv')
        .replace(/[./,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function comparePeople(left: ReviewPerson, right: ReviewPerson): number {
    const leftName = left.name ?? '';
    const rightName = right.name ?? '';
    return leftName.localeCompare(rightName, 'sv') || left.id.localeCompare(right.id);
}

/** Suggestions only: records are never merged or marked erroneous. */
export function buildDataReview(
    individuals: readonly ReviewPerson[],
    visiblePersonIds?: ReadonlySet<string> | null,
): DataReviewSummary {
    const people = individuals.filter(person => !visiblePersonIds || visiblePersonIds.has(person.id))
        .sort(comparePeople);
    const missingBirthYear: ReviewPerson[] = [];
    const missingDeathYear: ReviewPerson[] = [];
    const uncertainDates: UncertainDate[] = [];
    const duplicateBuckets = new Map<string, ReviewPerson[]>();

    for (const person of people) {
        const birthYear = yearIn(person.birthDate);
        const deathYear = yearIn(person.deathDate);
        if (birthYear === null) missingBirthYear.push(person);
        // A missing death year is only a useful review prompt for historical
        // people or when a death event exists but its year cannot be read.
        if ((birthYear !== null && birthYear <= 1910 && deathYear === null)
            || (Boolean(person.deathDate?.trim()) && deathYear === null)) {
            missingDeathYear.push(person);
        }
        const events = [
            isApproximate(person.birthDate) ? `Födelse: ${person.birthDate}` : null,
            isApproximate(person.deathDate) ? `Död: ${person.deathDate}` : null,
        ].filter((entry): entry is string => entry !== null);
        if (events.length) uncertainDates.push({ person, events });

        const name = normalizedName(person.name);
        if (name && name !== 'unknown' && name !== 'okänd' && birthYear !== null) {
            const key = `${name}\u0000${birthYear}`;
            const bucket = duplicateBuckets.get(key) ?? [];
            bucket.push(person);
            duplicateBuckets.set(key, bucket);
        }
    }

    const duplicateSuggestions = [...duplicateBuckets.values()]
        .filter(bucket => bucket.length > 1)
        .map(bucket => ({
            name: bucket[0].name ?? '',
            birthYear: yearIn(bucket[0].birthDate) ?? 0,
            people: bucket.sort(comparePeople),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'sv') || left.birthYear - right.birthYear);

    return { people, missingBirthYear, missingDeathYear, uncertainDates, duplicateSuggestions };
}
