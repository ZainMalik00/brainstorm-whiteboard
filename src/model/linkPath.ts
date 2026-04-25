import type { AnchorSide } from "./types";

export interface Point {
  x: number;
  y: number;
}

const NORMAL: Record<AnchorSide, readonly [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  center: [0, 0],
};

/** Cubic-Bezier control points placed along each endpoint's outward normal. */
export function linkControlPoints(
  p0: Point,
  side0: AnchorSide,
  p1: Point,
  side1: AnchorSide,
): { c0: Point; c1: Point } {
  const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d = Math.max(40, Math.min(200, dist * 0.5));
  const [nx0, ny0] = NORMAL[side0];
  const [nx1, ny1] = NORMAL[side1];
  return {
    c0: { x: p0.x + nx0 * d, y: p0.y + ny0 * d },
    c1: { x: p1.x + nx1 * d, y: p1.y + ny1 * d },
  };
}

/** Smooth side-aware path between two anchored points (cubic Bezier). */
export function linkPathD(
  p0: Point,
  side0: AnchorSide,
  p1: Point,
  side1: AnchorSide,
): string {
  const { c0, c1 } = linkControlPoints(p0, side0, p1, side1);
  return `M ${p0.x} ${p0.y} C ${c0.x} ${c0.y} ${c1.x} ${c1.y} ${p1.x} ${p1.y}`;
}
