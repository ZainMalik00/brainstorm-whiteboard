import type { Viewport } from "./types";

const DEFAULT_BOX_WIDTH = 280;
const DEFAULT_BOX_HEIGHT = 160;
const FALLBACK_CENTER_X = 320;
const FALLBACK_CENTER_Y = 240;

/** World-space top-left for a box of `width`x`height` centered on the visible viewport. */
export function getViewportCenterTopLeft(
  viewport: Viewport,
  size: { width: number; height: number },
  box: { width: number; height: number } = { width: DEFAULT_BOX_WIDTH, height: DEFAULT_BOX_HEIGHT },
): { x: number; y: number } {
  if (size.width <= 0 || size.height <= 0) {
    return { x: FALLBACK_CENTER_X, y: FALLBACK_CENTER_Y };
  }
  const worldCenterX = (size.width / 2 - viewport.panX) / viewport.zoom;
  const worldCenterY = (size.height / 2 - viewport.panY) / viewport.zoom;
  return {
    x: Math.round(worldCenterX - box.width / 2),
    y: Math.round(worldCenterY - box.height / 2),
  };
}
