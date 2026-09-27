import type { RingTreeNode } from './ringTree';

export interface RingLabelDetails {
  dates: boolean;
  residence: boolean;
  children: boolean;
  partners: boolean;
  places: boolean;
}

export interface RingLabelOptions {
  /** Current chart zoom; screen geometry still determines whether text fits. */
  zoom: number;
  /** Actual displayed SVG pixels per one viewBox/world unit. */
  pixelsPerWorldUnit: number;
  innerRadius: number;
  outerRadius: number;
  details: RingLabelDetails;
}

export interface RingLabelLine {
  kind: 'name' | 'detail';
  text: string;
}

export interface RingLabelPlan {
  visible: boolean;
  /** One name plus up to two optional fact lines. */
  lines: RingLabelLine[];
  fontSizeWorld: number;
  lineHeightWorld: number;
  maxWidthWorld: number;
  screenArcWidthPx: number;
  screenBandHeightPx: number;
}

function firstPlacePart(place: string): string {
  return place.split(',')[0]?.trim() ?? '';
}

function year(date: string): string | null {
  const matches = [...date.matchAll(/\b\d{4}\b/g)].map((match) => Number(match[0]));
  if (matches.length !== 1 || matches[0] < 1000 || matches[0] > 2099) return null;
  if (/\b(?:BET|AND|FROM|TO|BEF|AFT|BEFORE|AFTER)\b/i.test(date)) return null;
  const approximate = /\b(?:ABT|ABOUT|CIRCA|CA|CAL|EST)\b/i.test(date);
  return approximate ? `ca ${matches[0]}` : String(matches[0]);
}

function approximateWidthPx(text: string, fontSizePx: number): number {
  let units = 0;
  for (const char of text) {
    if (' ilI.,:;!|'.includes(char)) units += 0.31;
    else if ('MWÅÄÖmw'.includes(char)) units += 0.82;
    else if (char === ' ') units += 0.33;
    else units += 0.57;
  }
  return units * fontSizePx;
}

function fitText(text: string, widthPx: number, fontSizePx: number, allowShortName: boolean): string {
  const cleanText = text.trim().replace(/\s+/g, ' ');
  if (approximateWidthPx(cleanText, fontSizePx) <= widthPx) return cleanText;
  if (allowShortName) {
    const words = cleanText.split(' ');
    if (words.length > 2) {
      const short = `${words[0]} ${words.at(-1)}`;
      if (approximateWidthPx(short, fontSizePx) <= widthPx) return short;
    }
  }
  const chars = Array.from(cleanText);
  while (chars.length > 3 && approximateWidthPx(`${chars.join('')}…`, fontSizePx) > widthPx) chars.pop();
  return chars.length > 3 ? `${chars.join('').trimEnd()}…` : '';
}

function detailCandidates(node: RingTreeNode, details: RingLabelDetails): string[] {
  if (!node.personId) return [];
  const candidates: string[] = [];
  if (details.dates) {
    const birth = year(node.birthDate);
    const death = year(node.deathDate);
    if (birth && death) candidates.push(`f. ${birth} · d. ${death}`);
    else if (birth) candidates.push(`f. ${birth}`);
    else if (death) candidates.push(`d. ${death}`);
  }
  if (details.residence) {
    const place = firstPlacePart(node.residences.at(-1)?.place ?? '');
    if (place) candidates.push(`Bostad: ${place}`);
  }
  const counts: string[] = [];
  if (details.children && node.children.length) counts.push(`${node.children.length} barn`);
  if (details.partners && node.partners.length) counts.push(`${node.partners.length} partner`);
  if (counts.length) candidates.push(counts.join(' · '));
  if (details.places) {
    const birthPlace = firstPlacePart(node.birthPlace);
    const deathPlace = firstPlacePart(node.deathPlace);
    if (birthPlace) candidates.push(`Född: ${birthPlace}`);
    if (deathPlace) candidates.push(`Död: ${deathPlace}`);
  }
  return candidates;
}

/**
 * Plan SVG text in world units from the *displayed* width of a radial sector.
 * Labels remain about 12–14 screen pixels high as zoom grows, which lets more
 * names and facts become legible without a hard generation cutoff.
 */
export function planRingLabel(node: RingTreeNode, options: RingLabelOptions): RingLabelPlan {
  const scale = options.pixelsPerWorldUnit;
  const inner = options.innerRadius;
  const outer = options.outerRadius;
  const hidden: RingLabelPlan = {
    visible: false, lines: [], fontSizeWorld: 0, lineHeightWorld: 0,
    maxWidthWorld: 0, screenArcWidthPx: 0, screenBandHeightPx: 0,
  };
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(inner) || !Number.isFinite(outer) || outer <= inner) {
    return hidden;
  }

  const zoom = Number.isFinite(options.zoom) ? Math.max(1, options.zoom) : 1;
  const angularWidth = Math.max(0, Math.min(360, node.endAngle - node.startAngle));
  const midRadius = (inner + outer) / 2;
  const chordWorld = node.generation === 1
    ? 2 * outer * 0.8
    : 2 * midRadius * Math.sin(angularWidth * Math.PI / 360);
  // A straight tangent label must also stay inside the outer circle. Wide
  // half/quarter sectors have a long arc chord but a shorter usable tangent.
  const outerCircleChordWorld = 2 * Math.sqrt(Math.max(0, outer * outer - midRadius * midRadius));
  const screenArcWidthPx = Math.min(chordWorld, outerCircleChordWorld) * scale;
  const screenBandHeightPx = (node.generation === 1 ? 2 * outer * 0.8 : outer - inner) * scale;
  const fontSizePx = Math.min(14.5, 12 + Math.log2(zoom) * 0.65);
  const lineHeightPx = fontSizePx * 1.28;
  const availableWidthPx = Math.max(0, screenArcWidthPx - 12);
  const maxWidthWorld = availableWidthPx / scale;
  const base: RingLabelPlan = {
    ...hidden,
    fontSizeWorld: fontSizePx / scale,
    lineHeightWorld: lineHeightPx / scale,
    maxWidthWorld,
    screenArcWidthPx,
    screenBandHeightPx,
  };

  if (availableWidthPx < Math.max(43, fontSizePx * 3.6) || screenBandHeightPx < lineHeightPx + 4) return base;
  const name = fitText(node.name, availableWidthPx, fontSizePx, true);
  if (!name) return base;
  const lines: RingLabelLine[] = [{ kind: 'name', text: name }];

  // One fact line at moderate zoom, two when the sector can physically hold
  // three rows. All toggles are read on every call, so they apply immediately.
  const maxLines = zoom >= 2.2 && screenBandHeightPx >= 3 * lineHeightPx + 8
    ? 3
    : zoom >= 1.35 && screenBandHeightPx >= 2 * lineHeightPx + 8 ? 2 : 1;
  if (maxLines > 1) {
    for (const candidate of detailCandidates(node, options.details)) {
      const fitted = fitText(candidate, availableWidthPx, fontSizePx * 0.9, false);
      if (fitted) lines.push({ kind: 'detail', text: fitted });
      if (lines.length >= maxLines) break;
    }
  }
  return { ...base, visible: true, lines };
}
