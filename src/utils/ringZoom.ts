export interface RingZoomPoint {
  x: number;
  y: number;
}

export interface RingZoomBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RingZoomInput {
  zoom: number;
  pan: RingZoomPoint;
  nextZoom: number;
  clientX: number;
  clientY: number;
  bounds: RingZoomBounds;
  canvasRadius: number;
}

export interface RingZoomResult {
  zoom: number;
  pan: RingZoomPoint;
}

export const MIN_RING_ZOOM = 1;
export const MAX_RING_ZOOM = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Zoom a square SVG viewBox around a client-space pointer. An SVG using the
 * default preserveAspectRatio="xMidYMid meet" paints into a centered square
 * inside its rectangular element; the smaller element dimension is therefore
 * the scale for both axes.
 */
export function zoomRingAtPointer(input: RingZoomInput): RingZoomResult {
  const currentZoom = Number.isFinite(input.zoom)
    ? clamp(input.zoom, MIN_RING_ZOOM, MAX_RING_ZOOM)
    : MIN_RING_ZOOM;
  const nextZoom = Number.isFinite(input.nextZoom)
    ? clamp(input.nextZoom, MIN_RING_ZOOM, MAX_RING_ZOOM)
    : currentZoom;
  const radius = Number.isFinite(input.canvasRadius) && input.canvasRadius > 0
    ? input.canvasRadius : 0;
  const currentRadius = radius / currentZoom;
  const nextRadius = radius / nextZoom;
  const maxPan = Math.max(0, radius - nextRadius);
  const pointerScale = Math.min(input.bounds.width, input.bounds.height) / 2;
  const hasUsablePointer = pointerScale > 0 && Number.isFinite(pointerScale)
    && Number.isFinite(input.bounds.width) && Number.isFinite(input.bounds.height)
    && Number.isFinite(input.bounds.left) && Number.isFinite(input.bounds.top)
    && Number.isFinite(input.clientX) && Number.isFinite(input.clientY);
  const offsetX = hasUsablePointer
    ? (input.clientX - input.bounds.left - input.bounds.width / 2) / pointerScale : 0;
  const offsetY = hasUsablePointer
    ? (input.clientY - input.bounds.top - input.bounds.height / 2) / pointerScale : 0;
  const panX = Number.isFinite(input.pan.x) ? input.pan.x : 0;
  const panY = Number.isFinite(input.pan.y) ? input.pan.y : 0;

  return {
    zoom: nextZoom,
    pan: {
      x: maxPan === 0 ? 0 : clamp(panX + offsetX * (currentRadius - nextRadius), -maxPan, maxPan),
      y: maxPan === 0 ? 0 : clamp(panY + offsetY * (currentRadius - nextRadius), -maxPan, maxPan),
    },
  };
}
