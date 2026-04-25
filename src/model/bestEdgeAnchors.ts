import { anchorPoint } from "./anchor";
import type { AnchorSide, Box } from "./types";

export interface EdgeAnchorPair {
  from: AnchorSide;
  to: AnchorSide;
}

/**
 * Picks the side on each box that most naturally faces the other box.
 *
 * Uses the center-to-center vector and a shape-aware bias: wider boxes prefer
 * top/bottom sides (n/s); taller boxes prefer left/right (e/w). This yields
 * predictable, perpendicular exits that pair well with side-aware curves.
 */
export function bestEdgeAnchors(a: Box, b: Box): EdgeAnchorPair {
  const aCenter = anchorPoint(a, "center");
  const bCenter = anchorPoint(b, "center");
  const dx = bCenter.x - aCenter.x;
  const dy = bCenter.y - aCenter.y;

  const aspectA = a.width / Math.max(1, a.height);
  const aspectB = b.width / Math.max(1, b.height);
  const bias = Math.sqrt(aspectA * aspectB);

  const horizontalScore = Math.abs(dx);
  const verticalScore = Math.abs(dy) * bias;
  const horizontal = horizontalScore >= verticalScore;

  if (horizontal) {
    return dx >= 0 ? { from: "e", to: "w" } : { from: "w", to: "e" };
  }
  return dy >= 0 ? { from: "s", to: "n" } : { from: "n", to: "s" };
}
