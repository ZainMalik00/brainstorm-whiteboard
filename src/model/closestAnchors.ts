import { anchorPoint } from "./anchor";
import type { AnchorSide, Box } from "./types";

/** Edge sides used for box-to-box links (midpoints of each side). */
const EDGE_SIDES: readonly AnchorSide[] = ["n", "s", "e", "w"];

/**
 * Picks the pair of box edges whose midpoints are closest in world space.
 * O(16) per call — used from LinkLayer `useMemo` when endpoint geometries change; no store writes.
 */
export function closestEdgeAnchors(
  fromBox: Box,
  toBox: Box,
): { fromAnchor: AnchorSide; toAnchor: AnchorSide } {
  let bestD2 = Infinity;
  let fromAnchor: AnchorSide = "e";
  let toAnchor: AnchorSide = "w";

  for (const sa of EDGE_SIDES) {
    const pa = anchorPoint(fromBox, sa);
    for (const sb of EDGE_SIDES) {
      const pb = anchorPoint(toBox, sb);
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        fromAnchor = sa;
        toAnchor = sb;
      }
    }
  }

  return { fromAnchor, toAnchor };
}
