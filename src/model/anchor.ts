import type { AnchorSide, Box } from "./types";

const EDGE_INSET = 1;

/**
 * Point on `side` of `box` at fractional position `t` along the edge.
 * `t = 0` is the leftmost (n/s) or topmost (e/w) point; `t = 1` is the opposite end;
 * `t = 0.5` is the midpoint. `t` is clamped to [0, 1].
 */
export function anchorPointAt(
  box: Box,
  side: AnchorSide,
  t: number,
): { x: number; y: number } {
  const tt = Math.max(0, Math.min(1, t));
  switch (side) {
    case "n":
      return { x: box.x + box.width * tt, y: box.y + EDGE_INSET };
    case "s":
      return { x: box.x + box.width * tt, y: box.y + box.height - EDGE_INSET };
    case "e":
      return { x: box.x + box.width - EDGE_INSET, y: box.y + box.height * tt };
    case "w":
      return { x: box.x + EDGE_INSET, y: box.y + box.height * tt };
    case "center":
    default:
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
}

/** Midpoint of the given side (or box center if side is undefined). */
export function anchorPoint(
  box: Box,
  side: AnchorSide | undefined,
): { x: number; y: number } {
  return anchorPointAt(box, side ?? "center", 0.5);
}
