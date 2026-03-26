import { describe, expect, it } from "vitest";
import {
  buildViewportFromTwoTouchGesture,
  getTouchMidpoint,
  type LocalTouchPoint,
} from "./viewportGesture";
import type { Viewport } from "./types";

function clientToWorld(point: LocalTouchPoint, viewport: Viewport): LocalTouchPoint {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

describe("viewportGesture", () => {
  it("keeps the same world point under the pinch midpoint", () => {
    const startViewport: Viewport = { panX: 40, panY: -20, zoom: 1.5 };
    const startTouches = [{ x: 100, y: 120 }, { x: 220, y: 180 }] as const;
    const currentTouches = [{ x: 70, y: 90 }, { x: 250, y: 210 }] as const;

    const next = buildViewportFromTwoTouchGesture({
      startViewport,
      startTouches,
      currentTouches,
      minZoom: 0.15,
      maxZoom: 3.5,
    });

    const startWorld = clientToWorld(getTouchMidpoint(startTouches), startViewport);
    const currentWorld = clientToWorld(getTouchMidpoint(currentTouches), next);

    expect(currentWorld.x).toBeCloseTo(startWorld.x);
    expect(currentWorld.y).toBeCloseTo(startWorld.y);
    expect(next.zoom).toBeGreaterThan(startViewport.zoom);
  });

  it("translates the viewport when both touches move together", () => {
    const next = buildViewportFromTwoTouchGesture({
      startViewport: { panX: 10, panY: 20, zoom: 2 },
      startTouches: [{ x: 100, y: 100 }, { x: 180, y: 100 }],
      currentTouches: [{ x: 130, y: 140 }, { x: 210, y: 140 }],
      minZoom: 0.15,
      maxZoom: 3.5,
    });

    expect(next).toEqual({
      panX: 40,
      panY: 60,
      zoom: 2,
    });
  });

  it("clamps zoom to the configured range", () => {
    const zoomedIn = buildViewportFromTwoTouchGesture({
      startViewport: { panX: 0, panY: 0, zoom: 1 },
      startTouches: [{ x: 100, y: 100 }, { x: 110, y: 100 }],
      currentTouches: [{ x: 0, y: 100 }, { x: 300, y: 100 }],
      minZoom: 0.5,
      maxZoom: 2.25,
    });
    const zoomedOut = buildViewportFromTwoTouchGesture({
      startViewport: { panX: 0, panY: 0, zoom: 1 },
      startTouches: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
      currentTouches: [{ x: 195, y: 100 }, { x: 205, y: 100 }],
      minZoom: 0.5,
      maxZoom: 2.25,
    });

    expect(zoomedIn.zoom).toBe(2.25);
    expect(zoomedOut.zoom).toBe(0.5);
  });
});
