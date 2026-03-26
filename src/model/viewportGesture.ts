import type { Viewport } from "./types";

export type LocalTouchPoint = {
  x: number;
  y: number;
};

export type TwoTouchGestureInput = {
  startViewport: Viewport;
  startTouches: readonly [LocalTouchPoint, LocalTouchPoint];
  currentTouches: readonly [LocalTouchPoint, LocalTouchPoint];
  minZoom: number;
  maxZoom: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTouchMidpoint(
  [touchA, touchB]: readonly [LocalTouchPoint, LocalTouchPoint],
): LocalTouchPoint {
  return {
    x: (touchA.x + touchB.x) / 2,
    y: (touchA.y + touchB.y) / 2,
  };
}

export function getTouchDistance(
  [touchA, touchB]: readonly [LocalTouchPoint, LocalTouchPoint],
): number {
  return Math.max(Math.hypot(touchB.x - touchA.x, touchB.y - touchA.y), 1);
}

export function buildViewportFromTwoTouchGesture({
  startViewport,
  startTouches,
  currentTouches,
  minZoom,
  maxZoom,
}: TwoTouchGestureInput): Viewport {
  const startMid = getTouchMidpoint(startTouches);
  const currentMid = getTouchMidpoint(currentTouches);
  const startDistance = getTouchDistance(startTouches);
  const currentDistance = getTouchDistance(currentTouches);
  const unclampedZoom = startViewport.zoom * (currentDistance / startDistance);
  const zoom = clamp(unclampedZoom, minZoom, maxZoom);
  const worldX = (startMid.x - startViewport.panX) / startViewport.zoom;
  const worldY = (startMid.y - startViewport.panY) / startViewport.zoom;

  return {
    panX: currentMid.x - worldX * zoom,
    panY: currentMid.y - worldY * zoom,
    zoom,
  };
}
