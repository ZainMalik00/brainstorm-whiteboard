import type { AnchorSide } from "./types";
import type { Box } from "./types";

/** Half of typical box border (px) so anchors sit on the visible stroke. */
const EDGE_INSET = 1;

export function anchorPoint(
  box: Box,
  side: AnchorSide | undefined,
): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const s = side ?? "center";
  switch (s) {
    case "n":
      return { x: cx, y: box.y + EDGE_INSET };
    case "s":
      return { x: cx, y: box.y + box.height - EDGE_INSET };
    case "e":
      return { x: box.x + box.width - EDGE_INSET, y: cy };
    case "w":
      return { x: box.x + EDGE_INSET, y: cy };
    default:
      return { x: cx, y: cy };
  }
}
