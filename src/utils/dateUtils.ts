/**
 * Utility to extract a numeric year from a GEDCOM date string.
 * GEDCOM dates can be: "14 JUN 1682", "ABT 1720", "BET 1650 AND 1660", "1750", etc.
 */
export function extractYear(dateStr: string | undefined): number | null {
    if (!dateStr) return null;

    // Clean up the string (remove common GEDCOM prefixes)
    const cleanStr = dateStr.replace(/ABT|BEF|AFT|BET|AND|EST/g, ' ').trim();

    // Look for 4 consecutive digits. 
    // If there are multiple (e.g., "BET 1850 AND 1860"), we take the first one for simplicity, 
    // but prioritize 4-digit numbers that look like years (1000-2100).
    const matches = cleanStr.match(/\d{4}/g);
    if (matches) {
        for (const m of matches) {
            const y = parseInt(m, 10);
            if (y > 1000 && y < 2100) return y;
        }
        return parseInt(matches[0], 10);
    }

    // Fallback for very old or partial dates
    const shortMatch = cleanStr.match(/\d{2,3}/);
    if (shortMatch) {
        return parseInt(shortMatch[0], 10);
    }

    return null;
}


/**
 * Returns the century string for a given year (e.g., 1682 -> "1600s").
 */
export function getCentury(year: number | null): string | null {
    if (year === null) return null;
    const century = Math.floor(year / 100) * 100;
    return `${century}s`;
}
