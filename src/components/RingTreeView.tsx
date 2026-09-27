import { useEffect, useMemo, useRef, useState } from 'react';
import { buildRingTree, MAX_RING_GENERATIONS } from '../utils/ringTree';
import type { RingFamily, RingIndividual, RingTreeNode } from '../utils/ringTree';
import { buildRingColorScale, getApproximateLifespan } from '../utils/ringColor';
import type { RingColorMode } from '../utils/ringColor';
import { planRingLabel } from '../utils/ringLabels';
import { zoomRingAtPointer } from '../utils/ringZoom';
import type { RingViewSnapshot } from '../utils/savedViews';
import '../ring-tree.css';

interface Props {
  individuals: RingIndividual[];
  families: RingFamily[];
  initialPersonId?: string | null;
  selectedPersonId?: string | null;
  onSelectPerson?: (id: string) => void;
  snapshot?: RingViewSnapshot;
  restoreVersion?: number;
  onSnapshotChange?: (snapshot: RingViewSnapshot) => void;
}

type DetailOption = 'dates' | 'residence' | 'children' | 'partners' | 'places';
type DetailVisibility = Record<DetailOption, boolean>;

const CORE_RADIUS = 76;
const RING_WIDTH = 54;
const RING_GAP = 2.5;
const MAX_RESULTS = 24;

const COLOR_MODES: Record<RingColorMode, { label: string; description: string }> = {
  century: { label: 'Födelseårhundrade', description: 'Färgen visar när personen föddes.' },
  residence: { label: 'Bostadsregion', description: 'Färgen visar senast registrerad bostadsort eller region.' },
  birthRegion: { label: 'Födelseregion', description: 'Färgen visar regionen för den registrerade födelseorten.' },
  lifespan: { label: 'Livslängd', description: 'Färgen visar ungefärlig livslängd i åldersgrupper.' },
  overlap: { label: 'Släktled som möts', description: 'Samma färg visar en person som finns i flera grenar.' },
};

function polar(radius: number, angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}

function sectorPath(inner: number, outer: number, first: number, last: number): string {
  const gap = Math.min(0.45, (last - first) / 8);
  const start = first + gap;
  const end = last - gap;
  const outerStart = polar(outer, start);
  const outerEnd = polar(outer, end);
  const innerEnd = polar(inner, end);
  const innerStart = polar(inner, start);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function shortName(name: string, limit: number): string {
  const parts = name.trim().split(/\s+/);
  const concise = parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : name;
  return concise.length <= limit ? concise : `${concise.slice(0, Math.max(3, limit - 1)).trimEnd()}…`;
}

function centuryLabel(century: number | null): string {
  return century === null ? 'Okänt århundrade' : `${century}-tal`;
}

function relationLabel(node: RingTreeNode): string {
  if (node.generation === 1) return 'Utgångsperson';
  return node.relation === 'father' ? 'Fadersled' : 'Modersled';
}

function nodeLabel(node: RingTreeNode): string {
  return [node.name, `generation ${node.generation}`, relationLabel(node), centuryLabel(node.century)].join(', ');
}

function nodeCenter(node: RingTreeNode): { x: number; y: number } {
  if (node.generation === 1) return { x: 0, y: 0 };
  const inner = CORE_RADIUS + (node.generation - 2) * (RING_WIDTH + RING_GAP) + RING_GAP;
  return polar(inner + RING_WIDTH / 2, (node.startAngle + node.endAngle) / 2);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <p className="ring-tree-detail-row"><span>{label}</span><strong>{value || 'Ingen uppgift'}</strong></p>;
}

export function RingTreeView({ individuals, families, initialPersonId, selectedPersonId, onSelectPerson, snapshot, restoreVersion, onSnapshotChange }: Props) {
  const defaultPerson = useMemo(() =>
    individuals.find(person => {
      const name = person.name?.toLocaleLowerCase('sv') ?? '';
      return name.includes('joel') && name.includes('berring');
    }) ?? individuals[0], [individuals]);
  const personById = useMemo(() => new Map(individuals.map(person => [person.id, person])), [individuals]);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(snapshot?.rootPersonId ?? initialPersonId ?? selectedPersonId ?? null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [generations, setGenerations] = useState(snapshot?.generations ?? 12);
  const [colorMode, setColorMode] = useState<RingColorMode>(snapshot?.colorMode ?? 'century');
  const [parentFamilyChoices, setParentFamilyChoices] = useState<Record<string, string>>(snapshot?.parentFamilyChoices ?? {});
  const [viewport, setViewport] = useState({ zoom: snapshot?.zoom ?? 1, pan: snapshot?.pan ?? { x: 0, y: 0 } });
  const { zoom, pan } = viewport;
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  const [visible, setVisible] = useState<DetailVisibility>(snapshot?.visible ?? {
    dates: true,
    residence: false,
    children: false,
    partners: false,
    places: false,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const popoverCloseRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<SVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const ignoreClickRef = useRef(false);
  const restoredVersionRef = useRef(restoreVersion);

  const rootId = focusPersonId && personById.has(focusPersonId)
    ? focusPersonId
    : defaultPerson?.id ?? '';
  const chart = useMemo(() => buildRingTree(individuals, families, rootId, generations, { parentFamilyChoices }),
    [individuals, families, rootId, generations, parentFamilyChoices]);
  const colorScale = useMemo(() => buildRingColorScale(chart.nodes, colorMode), [chart.nodes, colorMode]);
  const gradientIdByCategory = useMemo(() =>
    new Map(colorScale.legend.map((item, index) => [item.categoryKey, `ring-color-${index}`])),
    [colorScale.legend]);
  const selected = chart.nodes.find(node => node.key === selectedKey) ?? chart.nodes[0];
  const popoverNode = popoverKey ? chart.nodes.find(node => node.key === popoverKey && node.personId) : undefined;
  const popoverParentChoice = popoverNode?.parentChoices.find(choice =>
    choice.familyId === popoverNode.selectedParentFamilyId);
  const popoverOccurrences = popoverNode?.personId
    ? chart.nodes.filter(node => node.personId === popoverNode.personId).length : 0;
  const root = chart.nodes[0];
  const selectedAssignment = selected ? colorScale.assignments.get(selected.key) : undefined;
  const selectedOccurrences = selected?.personId
    ? chart.nodes.filter(node => node.personId === selected.personId)
    : [];
  const renderedGenerations = Math.max(3, chart.renderedGenerations);
  const outerRadius = CORE_RADIUS + (renderedGenerations - 1) * (RING_WIDTH + RING_GAP);
  const canvasRadius = outerRadius + 56;
  const viewRadius = canvasRadius / zoom;
  const maxPan = Math.max(0, canvasRadius - viewRadius);
  const pixelsPerWorldUnit = Math.min(stageSize.width, stageSize.height) / (2 * viewRadius);
  const coreScale = pixelsPerWorldUnit || 1;
  const coreRadiusPx = (CORE_RADIUS - 4) * pixelsPerWorldUnit;
  const coreNamePx = Math.min(42, Math.max(11, 17 * coreScale));
  const coreCaptionPx = Math.min(13, Math.max(8, 8 * coreScale));
  const coreCaptionOffsetWorld = (coreNamePx / 2 + coreCaptionPx / 2 + 7) / coreScale;
  const coreNameCandidate = coreRadiusPx < 48 ? root?.name.split(/\s+/)[0] ?? '' : root?.name ?? '';
  const coreNameLength = Math.min(22, Math.max(3, Math.floor(coreRadiusPx * 1.8 / (coreNamePx * 0.58))));
  const coreName = shortName(coreNameCandidate, coreNameLength);
  const showCoreCaptions = coreRadiusPx >= 24;
  const labelPlans = useMemo(() => new Map(chart.nodes
    .filter(node => node.generation > 1 && node.personId)
    .map(node => {
      const innerRadius = CORE_RADIUS + (node.generation - 2) * (RING_WIDTH + RING_GAP) + RING_GAP;
      return [node.key, planRingLabel(node, {
        zoom,
        pixelsPerWorldUnit,
        innerRadius,
        outerRadius: innerRadius + RING_WIDTH,
        details: visible,
      })] as const;
    })), [chart.nodes, zoom, pixelsPerWorldUnit, visible]);
  const normalizedQuery = query.trim().toLocaleLowerCase('sv');
  const matches = useMemo(() => normalizedQuery
    ? individuals.filter(person => person.name?.toLocaleLowerCase('sv').includes(normalizedQuery))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'sv'))
      .slice(0, MAX_RESULTS)
    : [], [individuals, normalizedQuery]);

  useEffect(() => {
    if (restoreVersion === restoredVersionRef.current) return;
    restoredVersionRef.current = restoreVersion;
    if (!snapshot) return;
    setFocusPersonId(snapshot.rootPersonId ?? initialPersonId ?? null);
    setGenerations(snapshot.generations);
    setColorMode(snapshot.colorMode);
    setParentFamilyChoices(snapshot.parentFamilyChoices ?? {});
    setViewport({ zoom: snapshot.zoom, pan: snapshot.pan });
    setVisible(snapshot.visible);
    setSelectedKey(null);
    setPopoverKey(null);
    setCategoryFilter(null);
  }, [restoreVersion, snapshot, initialPersonId]);

  useEffect(() => {
    if (!selectedPersonId || !personById.has(selectedPersonId)) return;
    if (chart.nodes.find(node => node.key === selectedKey)?.personId === selectedPersonId) return;
    const occurrence = chart.nodes.find(node => node.personId === selectedPersonId);
    if (occurrence) {
      setSelectedKey(occurrence.key);
    } else {
      setFocusPersonId(selectedPersonId);
      setSelectedKey(null);
      setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
    }
  }, [selectedPersonId, personById, chart.nodes, selectedKey]);

  useEffect(() => {
    onSnapshotChange?.({ rootPersonId: rootId, generations, colorMode, zoom, pan, visible, parentFamilyChoices });
  }, [rootId, generations, colorMode, zoom, pan, visible, parentFamilyChoices, onSnapshotChange]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize(previous => previous.width === width && previous.height === height
        ? previous : { width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [rootId]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const bounds = svg.getBoundingClientRect();
      const deltaPixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const { clientX, clientY } = event;
      setViewport(current => zoomRingAtPointer({
        zoom: current.zoom,
        pan: current.pan,
        nextZoom: current.zoom * Math.exp(-deltaPixels * 0.0015),
        clientX,
        clientY,
        bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
        canvasRadius,
      }));
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [canvasRadius, rootId]);

  useEffect(() => {
    if (popoverNode) popoverCloseRef.current?.focus();
  }, [popoverNode]);

  function choosePerson(personId: string) {
    const occurrence = chart.nodes.find(node => node.personId === personId);
    if (occurrence) {
      setSelectedKey(occurrence.key);
      setPopoverKey(null);
    } else {
      setFocusPersonId(personId);
      setSelectedKey(null);
      setPopoverKey(null);
      setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
    }
    setQuery('');
    onSelectPerson?.(personId);
  }

  function recenterOnPerson(personId: string) {
    setFocusPersonId(personId);
    setSelectedKey(null);
    setPopoverKey(null);
    setCategoryFilter(null);
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
    onSelectPerson?.(personId);
  }

  function recenterOnSelected() {
    if (selected?.personId) recenterOnPerson(selected.personId);
  }

  function toggleOption(option: DetailOption) {
    setVisible(previous => ({ ...previous, [option]: !previous[option] }));
  }

  function chooseParentFamily(personId: string, familyId: string) {
    setParentFamilyChoices(previous => ({ ...previous, [personId]: familyId }));
    setPopoverKey(null);
    setCategoryFilter(null);
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function changeZoom(next: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    setViewport(current => zoomRingAtPointer({
      zoom: current.zoom,
      pan: current.pan,
      nextZoom: next,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      canvasRadius,
    }));
  }

  function showWholeTree() {
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
    ignoreClickRef.current = false;
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.hypot(deltaX, deltaY) > 4) {
      if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
      drag.moved = true;
      ignoreClickRef.current = true;
    }
    if (!drag.moved) return;
    const bounds = svg.getBoundingClientRect();
    const scale = 2 * viewRadius / Math.min(bounds.width, bounds.height);
    setViewport(current => ({ ...current, pan: {
      x: Math.max(-maxPan, Math.min(maxPan, drag.panX - deltaX * scale)),
      y: Math.max(-maxPan, Math.min(maxPan, drag.panY - deltaY * scale)),
    } }));
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function chooseNode(node: RingTreeNode, trigger: SVGElement, keyboard = false) {
    if (keyboard) ignoreClickRef.current = false;
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    setSelectedKey(node.key);
    triggerRef.current = trigger;
    setPopoverKey(node.personId && !onSelectPerson ? node.key : null);
    if (node.personId) onSelectPerson?.(node.personId);
  }

  function closePopover() {
    setPopoverKey(null);
    if (triggerRef.current?.isConnected) triggerRef.current.focus();
  }

  function fillFor(node: RingTreeNode): string {
    const assignment = colorScale.assignments.get(node.key);
    const gradientId = assignment && gradientIdByCategory.get(assignment.categoryKey);
    return assignment?.known && gradientId ? `url(#${gradientId})` : 'url(#ring-tree-unknown)';
  }

  return (
    <section className="ring-tree-shell" aria-label="Släktträd som årsringar">
      <header className="ring-tree-header">
        <div className="ring-tree-heading">
          <p className="ring-tree-eyebrow">ETT SLÄKTTRÄD I ÅRSRINGAR</p>
          <h1>Generationer som växer bakåt i tiden</h1>
          <p>Du är i mitten. Varje ring är en generation. {COLOR_MODES[colorMode].description}</p>
        </div>
        <div className="ring-tree-controls">
          <div className="ring-tree-search">
            <label htmlFor="ring-tree-person-search">Hitta person</label>
            <input
              id="ring-tree-person-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Sök namn i släkten"
              autoComplete="off"
            />
            {normalizedQuery && (
              <div className="ring-tree-search-results" aria-label="Sökresultat">
                {matches.length ? matches.map(person => (
                  <button key={person.id} type="button" onClick={() => choosePerson(person.id)}>
                    <strong>{person.name || 'Okänd person'}</strong>
                    <span>{person.birthDate || 'Årtal saknas'}</span>
                  </button>
                )) : <p>Inga personer hittades.</p>}
              </div>
            )}
          </div>
          <div className="ring-tree-depth">
            <label htmlFor="ring-tree-generations">Generationer</label>
            <select
              id="ring-tree-generations"
              value={generations}
              onChange={event => {
                setGenerations(Number(event.target.value));
                setSelectedKey(null);
                setPopoverKey(null);
                setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
              }}
            >
              {Array.from({ length: MAX_RING_GENERATIONS - 2 }, (_, index) => index + 3).map(count =>
                <option key={count} value={count}>{count} ringar</option>)}
            </select>
          </div>
          <div className="ring-tree-color-control">
            <label htmlFor="ring-tree-color-mode">Färga efter</label>
            <select
              id="ring-tree-color-mode"
              value={colorMode}
              onChange={event => {
                setColorMode(event.target.value as RingColorMode);
                setCategoryFilter(null);
              }}
            >
              {(Object.keys(COLOR_MODES) as RingColorMode[]).map(mode =>
                <option key={mode} value={mode}>{COLOR_MODES[mode].label}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="ring-tree-workspace">
        <div className="ring-tree-visual">
          <div className="ring-tree-visual-toolbar">
            <div>
              <strong>{chart.uniquePeopleCount} personer</strong>
              <span> · {chart.renderedGenerations} generationer från {root?.name || 'vald person'}</span>
              {chart.truncated && <span> · Diagrammet nådde sin säkerhetsgräns</span>}
              <span className="ring-tree-zoom-hint"> · Zooma med mushjulet för namn och fler uppgifter</span>
            </div>
            <div className="ring-tree-zoom-controls" aria-label="Zooma diagrammet">
              <button type="button" className="ring-tree-zoom-out" onClick={() => changeZoom(zoom / 1.5)} disabled={zoom <= 1} aria-label="Zooma ut">−</button>
              <span>{Math.round(zoom * 100)} %</span>
              <button type="button" className="ring-tree-zoom-in" onClick={() => changeZoom(zoom * 1.5)} disabled={zoom >= 12} aria-label="Zooma in">+</button>
              <button type="button" onClick={showWholeTree}>Visa hela</button>
            </div>
          </div>

          <div className="ring-tree-stage">
            {root ? (
              <svg
                ref={svgRef}
                className="ring-tree-svg"
                viewBox={`${pan.x - viewRadius} ${pan.y - viewRadius} ${viewRadius * 2} ${viewRadius * 2}`}
                role="group"
                aria-label={`Cirkelformat släktträd med ${chart.renderedGenerations} generationer`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
              >
                <defs>
                  <radialGradient id="ring-tree-halo">
                    <stop offset="0%" stopColor="#f8f4eb" />
                    <stop offset="82%" stopColor="#f4eee3" />
                    <stop offset="100%" stopColor="#e9dfcf" />
                  </radialGradient>
                  {colorScale.legend.map(item => {
                    const [light, middle, deep] = item.palette;
                    return (
                      <radialGradient key={item.categoryKey} id={gradientIdByCategory.get(item.categoryKey)} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={outerRadius}>
                        <stop offset="0%" stopColor={light} />
                        <stop offset="62%" stopColor={middle} />
                        <stop offset="100%" stopColor={deep} />
                      </radialGradient>
                    );
                  })}
                  <pattern id="ring-tree-unknown" width="8" height="8" patternUnits="userSpaceOnUse">
                    <rect width="8" height="8" fill="#dce0dc" />
                    <path d="M -2 8 L 8 -2 M 2 10 L 10 2" stroke="#b3bdb8" strokeWidth="1" />
                  </pattern>
                </defs>
                <circle r={outerRadius + 12} fill="url(#ring-tree-halo)" />
                {chart.nodes.filter(node => node.generation > 1).map(node => {
                  const inner = CORE_RADIUS + (node.generation - 2) * (RING_WIDTH + RING_GAP) + RING_GAP;
                  const outer = inner + RING_WIDTH;
                  const middleRadius = (inner + outer) / 2;
                  const middleAngle = (node.startAngle + node.endAngle) / 2;
                  const center = polar(middleRadius, middleAngle);
                  const tangent = ((middleAngle + 90) % 360 + 360) % 360;
                  const labelAngle = tangent > 90 && tangent < 270 ? tangent - 180 : tangent;
                  const labelPlan = labelPlans.get(node.key);
                  const segmentPath = sectorPath(inner, outer, node.startAngle, node.endAngle);
                  const clipId = `ring-tree-label-clip-${node.generation}-${node.slot}`;
                  const highlighted = selected?.key === node.key;
                  const samePerson = selected?.personId && node.personId === selected.personId;
                  const category = colorScale.assignments.get(node.key)?.categoryKey ?? 'unknown';
                  const dimmed = categoryFilter !== null && category !== categoryFilter;
                  return (
                    <g key={node.key}>
                      <path
                        className={`ring-tree-segment${highlighted ? ' is-selected' : ''}${samePerson && !highlighted ? ' is-related' : ''}${dimmed ? ' is-dimmed' : ''}${node.repeated ? ' is-repeated' : ''}${node.kind === 'cycle' ? ' is-cycle' : ''}${node.parentChoices.length > 1 ? ' has-parent-choices' : ''}`}
                        d={segmentPath}
                        fill={fillFor(node)}
                        data-person-id={node.personId ?? ''}
                        data-generation={node.generation}
                        data-century={node.century ?? 'unknown'}
                        data-color-category={category}
                        role="button"
                        tabIndex={0}
                        aria-label={nodeLabel(node)}
                        aria-pressed={highlighted}
                        onClick={event => chooseNode(node, event.currentTarget)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            chooseNode(node, event.currentTarget, true);
                          }
                        }}
                      >
                        <title>{nodeLabel(node)}</title>
                      </path>
                      {labelPlan?.visible && !dimmed && (
                        <>
                          <defs><clipPath id={clipId}><path d={segmentPath} /></clipPath></defs>
                          <g clipPath={`url(#${clipId})`}>
                            <text className="ring-tree-segment-label"
                              x={center.x} y={center.y}
                              transform={`rotate(${labelAngle} ${center.x} ${center.y})`}
                              fontSize={labelPlan.fontSizeWorld}
                              textAnchor="middle" dominantBaseline="central"
                              data-person-id={node.personId ?? ''}
                              data-generation={node.generation}
                              aria-hidden="true">
                              {labelPlan.lines.map((line, index) => (
                                <tspan key={`${line.kind}-${index}`}
                                  className={line.kind === 'name' ? 'ring-tree-segment-name' : 'ring-tree-segment-detail'}
                                  x={center.x}
                                  y={center.y + (index - (labelPlan.lines.length - 1) / 2) * labelPlan.lineHeightWorld}>
                                  {line.text}
                                </tspan>
                              ))}
                            </text>
                          </g>
                        </>
                      )}
                    </g>
                  );
                })}
                {Array.from({ length: renderedGenerations - 1 }, (_, index) => {
                  const inner = CORE_RADIUS + index * (RING_WIDTH + RING_GAP);
                  return [0.3, 0.6].map(part => (
                    <circle key={`${index}-${part}`} className="ring-tree-grain-ring" r={inner + RING_WIDTH * part} />
                  ));
                })}
                {Array.from({ length: renderedGenerations - 1 }, (_, index) => (
                  <circle key={index} className="ring-tree-generation-guide" r={CORE_RADIUS + index * (RING_WIDTH + RING_GAP) + RING_WIDTH + RING_GAP / 2} />
                ))}
                {selectedOccurrences.length > 1 && selected && (
                  <g className="ring-tree-overlap-links" aria-hidden="true">
                    {selectedOccurrences.filter(node => node.key !== selected.key).map(node => {
                      const from = nodeCenter(selected);
                      const to = nodeCenter(node);
                      return (
                        <path key={node.key} className="ring-tree-overlap-link"
                          d={`M ${from.x} ${from.y} Q 0 0 ${to.x} ${to.y}`}
                          data-person-id={selected.personId ?? ''} />
                      );
                    })}
                  </g>
                )}
                <circle
                  className={`ring-tree-segment ring-tree-core${selected?.key === root.key ? ' is-selected' : ''}${categoryFilter !== null && colorScale.assignments.get(root.key)?.categoryKey !== categoryFilter ? ' is-dimmed' : ''}`}
                  r={CORE_RADIUS - 4}
                  fill={fillFor(root)}
                  data-person-id={root.personId ?? ''}
                  data-generation="1"
                  data-century={root.century ?? 'unknown'}
                  data-color-category={colorScale.assignments.get(root.key)?.categoryKey ?? 'unknown'}
                  role="button"
                  tabIndex={0}
                  aria-label={nodeLabel(root)}
                  aria-pressed={selected?.key === root.key}
                  onClick={event => chooseNode(root, event.currentTarget)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      chooseNode(root, event.currentTarget, true);
                    }
                  }}
                >
                  <title>{nodeLabel(root)}</title>
                </circle>
                {showCoreCaptions && (
                  <text className="ring-tree-core-caption" y={-coreCaptionOffsetWorld}
                    fontSize={coreCaptionPx / coreScale} textAnchor="middle" dominantBaseline="middle"
                    aria-hidden="true">UTGÅNGSPERSON</text>
                )}
                <text className="ring-tree-core-name" y="0"
                  fontSize={coreNamePx / coreScale} textAnchor="middle" dominantBaseline="middle"
                  aria-hidden="true">{coreName}</text>
                {showCoreCaptions && (
                  <text className="ring-tree-core-caption" y={coreCaptionOffsetWorld}
                    fontSize={coreCaptionPx / coreScale} textAnchor="middle" dominantBaseline="middle"
                    aria-hidden="true">{centuryLabel(root.century)}</text>
                )}
              </svg>
            ) : <p className="ring-tree-empty">Ingen person att visa. Läs in en GEDCOM-fil och välj en utgångsperson.</p>}
            {popoverNode && (
              <aside className="ring-tree-person-popover" role="dialog" aria-modal="false"
                aria-labelledby="ring-tree-popover-title" aria-describedby="ring-tree-popover-summary"
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closePopover();
                  }
                }}>
                <div className="ring-tree-popover-header">
                  <div>
                    <span className="ring-tree-popover-kicker">Generation {popoverNode.generation} · {relationLabel(popoverNode)}</span>
                    <h3 id="ring-tree-popover-title">{popoverNode.name}</h3>
                  </div>
                  <button ref={popoverCloseRef} className="ring-tree-popover-close" type="button"
                    onClick={closePopover} aria-label="Stäng personrutan">×</button>
                </div>
                <p id="ring-tree-popover-summary" className="ring-tree-popover-summary">
                  {centuryLabel(popoverNode.century)}
                  {popoverOccurrences > 1 ? ` · förekommer ${popoverOccurrences} gånger i släktträdet` : ''}
                </p>
                <section className="ring-tree-popover-section">
                  <h4>Levnadsuppgifter</h4>
                  <DetailRow label="Född" value={popoverNode.birthDate} />
                  <DetailRow label="Födelseort" value={popoverNode.birthPlace} />
                  <DetailRow label="Död" value={popoverNode.deathDate} />
                  <DetailRow label="Dödsort" value={popoverNode.deathPlace} />
                </section>
                {popoverNode.residences.length > 0 && (
                  <section className="ring-tree-popover-section">
                    <h4>Bostadsorter</h4>
                    <ul>{popoverNode.residences.map((residence, index) => (
                      <li key={`${residence.place}-${index}`}>
                        {residence.place}{residence.date ? ` · ${residence.date}` : ''}
                      </li>
                    ))}</ul>
                  </section>
                )}
                {(popoverParentChoice || popoverNode.partners.length > 0 || popoverNode.children.length > 0) && (
                  <section className="ring-tree-popover-section">
                    <h4>Familj</h4>
                    {popoverParentChoice && (
                      <>
                        <DetailRow label="Far" value={popoverParentChoice.father?.name ?? ''} />
                        <DetailRow label="Mor" value={popoverParentChoice.mother?.name ?? ''} />
                      </>
                    )}
                    {popoverNode.partners.length > 0 && (
                      <DetailRow label="Partner" value={popoverNode.partners.map(person => person.name).join(', ')} />
                    )}
                    {popoverNode.children.length > 0 && (
                      <DetailRow label="Barn" value={popoverNode.children.map(person => person.name).join(', ')} />
                    )}
                  </section>
                )}
                {popoverNode.parentChoices.length > 1 && (
                  <p className="ring-tree-popover-summary">Flera föräldrakopplingar finns. Välj gren i personpanelen.</p>
                )}
                {popoverNode.personId !== rootId && (
                  <div className="ring-tree-popover-actions">
                    <button type="button" onClick={() => recenterOnPerson(popoverNode.personId!)}>Visa som utgångsperson</button>
                  </div>
                )}
              </aside>
            )}
          </div>
          <div className="ring-tree-legend" aria-label={`Färgnyckel för ${COLOR_MODES[colorMode].label.toLocaleLowerCase('sv')}`}>
            <div className="ring-tree-legend-title">
              <strong>{COLOR_MODES[colorMode].label}</strong>
              <span>Ringarna = generationer · klicka på en sektor för detaljer · dra för att flytta</span>
            </div>
            <div className="ring-tree-legend-items">
              {colorScale.legend.map(item => {
                const [light, middle, deep] = item.palette;
                return (
                  <button key={item.categoryKey} type="button" className="ring-tree-legend-item"
                    data-century={colorMode === 'century' ? item.categoryKey.replace('century:', '') : undefined}
                    data-category={item.categoryKey}
                    aria-pressed={categoryFilter === item.categoryKey}
                    onClick={() => setCategoryFilter(current => current === item.categoryKey ? null : item.categoryKey)}>
                    <span className={`ring-tree-legend-swatch${item.known ? '' : ' ring-tree-legend-unknown'}`}
                      style={item.known ? { background: `linear-gradient(120deg, ${light}, ${middle}, ${deep})` } : undefined} />
                    {item.label} <small>{item.count}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="ring-tree-sidebar">
          <div className="ring-tree-sidebar-heading">
            <p className="ring-tree-eyebrow">UTFORSKA SLÄKTEN</p>
            <h2>Personuppgifter</h2>
            <p>Välj uppgifter för personpanelen och de inzoomade ringarna.</p>
          </div>
          <fieldset className="ring-tree-options">
            <legend>Visa information</legend>
            {([
              ['dates', 'Levnadsår'],
              ['residence', 'Bostadsort'],
              ['children', 'Barn'],
              ['partners', 'Partner'],
              ['places', 'Födelse- och dödsort'],
            ] as const).map(([option, label]) => (
              <label key={option} htmlFor={`ring-tree-show-${option}`}>
                <input id={`ring-tree-show-${option}`} type="checkbox" checked={visible[option]}
                  onChange={() => toggleOption(option)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <div className="ring-tree-details" aria-live="polite">
            {selected ? (
              <>
                <div className="ring-tree-person-heading">
                  <span>GENERATION {selected.generation} · {relationLabel(selected)}</span>
                  <h3>{selected.name}</h3>
                  <p>{centuryLabel(selected.century)}{selected.repeated ? ' · förekommer i flera grenar' : ''}</p>
                  {colorMode !== 'century' && selectedAssignment && (
                    <p className="ring-tree-color-note">
                      Färg: {selectedAssignment.label}
                      {colorMode === 'lifespan' && getApproximateLifespan(selected) !== null
                        ? ` · cirka ${getApproximateLifespan(selected)} år` : ''}
                    </p>
                  )}
                </div>
                {selected.personId ? (
                  <>
                    {selected.personId !== rootId && (
                      <button className="ring-tree-recenter" type="button" onClick={recenterOnSelected}>
                        Visa {selected.name} i mitten <span aria-hidden="true">↗</span>
                      </button>
                    )}
                    {selectedOccurrences.length > 1 && (
                      <section className="ring-tree-detail-group">
                        <h4>Släktled som möts</h4>
                        <p>Den här personen förekommer {selectedOccurrences.length} gånger. De markerade sektorerna hör till samma person.</p>
                        <div className="ring-tree-occurrences">
                          {selectedOccurrences.map(occurrence => (
                            <button key={occurrence.key} type="button" aria-pressed={selected.key === occurrence.key}
                              onClick={() => {
                                setSelectedKey(occurrence.key);
                                setPopoverKey(null);
                              }}>
                              Generation {occurrence.generation} · {occurrence.relation === 'self' ? 'mitten' : occurrence.relation === 'father' ? 'fadersled' : 'modersled'}
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                    {selected.parentChoices.length > 1 && (
                      <section className="ring-tree-detail-group">
                        <h4>Föräldrakopplingar</h4>
                        <p>Källan anger flera olika föräldrakopplingar. Välj vilken gren de yttre ringarna ska följa för den här personen.</p>
                        <div className="ring-tree-parent-choices">
                          {selected.parentChoices.map(choice => (
                            <button key={choice.familyId} className="ring-tree-parent-choice" type="button"
                              aria-pressed={selected.selectedParentFamilyId === choice.familyId}
                              onClick={() => chooseParentFamily(selected.personId!, choice.familyId)}>
                              <span>{choice.father?.name || 'Okänd far'} · {choice.mother?.name || 'Okänd mor'}</span>
                              <small>{selected.selectedParentFamilyId === choice.familyId ? 'Visas i ringarna' : 'Visa denna gren'}</small>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                    {visible.dates && (
                      <section className="ring-tree-detail-group">
                        <h4>Levnadsår</h4>
                        <DetailRow label="Född" value={selected.birthDate} />
                        <DetailRow label="Död" value={selected.deathDate} />
                      </section>
                    )}
                    {visible.residence && (
                      <section className="ring-tree-detail-group">
                        <h4>Bostadsort</h4>
                        {selected.residences.length ? <ul>{selected.residences.map((residence, index) =>
                          <li key={`${residence.place}-${index}`}><strong>{residence.place}</strong>{residence.date && <span> · {residence.date}</span>}</li>)}</ul>
                          : <p>Ingen bostadsort registrerad.</p>}
                      </section>
                    )}
                    {visible.children && (
                      <section className="ring-tree-detail-group">
                        <h4>Barn ({selected.children.length})</h4>
                        {selected.children.length ? <ul>{selected.children.map(child =>
                          <li key={child.id}>{child.name}</li>)}</ul> : <p>Inga barn registrerade.</p>}
                      </section>
                    )}
                    {visible.partners && (
                      <section className="ring-tree-detail-group">
                        <h4>Partner ({selected.partners.length})</h4>
                        {selected.partners.length ? <ul>{selected.partners.map(partner =>
                          <li key={partner.id}>{partner.name}</li>)}</ul> : <p>Ingen partner registrerad.</p>}
                      </section>
                    )}
                    {visible.places && (
                      <section className="ring-tree-detail-group">
                        <h4>Födelse- och dödsort</h4>
                        <DetailRow label="Född" value={selected.birthPlace} />
                        <DetailRow label="Död" value={selected.deathPlace} />
                      </section>
                    )}
                    {selected.hasMore && <p className="ring-tree-data-note">Den här grenen fortsätter utanför de valda ringarna.</p>}
                    {selected.kind === 'cycle' && <p className="ring-tree-data-note">En cirkulär koppling i källan avslutar den här grenen.</p>}
                  </>
                ) : <p className="ring-tree-data-note">Föräldern saknas i källan. Ingen person har lagts till här.</p>}
              </>
            ) : <p>Välj en person i diagrammet.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
