/** Stable local identifier for saved views belonging to one GEDCOM text. */
export function datasetFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}
