import { linkControlPoints } from "./linkPath";
import type { RoutedLink } from "./linkRouting";
import type { Link } from "./types";

/**
 * World-space midpoint of the rendered link curve (cubic Bezier at t=0.5),
 * offset by the link's stored labelOffset. Used for label placement and UI anchors.
 */
export function linkMidpointWorld(
  link: Link,
  routed: RoutedLink,
): { x: number; y: number } {
  const { p0, side0, p1, side1 } = routed;
  const { c0, c1 } = linkControlPoints(p0, side0, p1, side1);
  const lo = link.labelOffset ?? { x: 0, y: 0 };
  return {
    x: 0.125 * p0.x + 0.375 * c0.x + 0.375 * c1.x + 0.125 * p1.x + lo.x,
    y: 0.125 * p0.y + 0.375 * c0.y + 0.375 * c1.y + 0.125 * p1.y + lo.y,
  };
}
