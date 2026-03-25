import { anchorPoint } from "./anchor";
import { closestEdgeAnchors } from "./closestAnchors";
import type { Box, Link } from "./types";

/** World-space point used for link label placement and UI anchors (respects labelOffset). */
export function linkMidpointWorld(link: Link, boxA: Box, boxB: Box): {
  x: number;
  y: number;
} {
  const { fromAnchor, toAnchor } = closestEdgeAnchors(boxA, boxB);
  const p0 = anchorPoint(boxA, fromAnchor);
  const p1 = anchorPoint(boxB, toAnchor);
  const lo = link.labelOffset ?? { x: 0, y: 0 };
  return {
    x: (p0.x + p1.x) / 2 + lo.x,
    y: (p0.y + p1.y) / 2 + lo.y,
  };
}
