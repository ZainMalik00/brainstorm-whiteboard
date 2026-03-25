import type { Link } from "./types";

/** Map box id → link ids that touch that box (for incident-edge updates). */
export function buildLinkIdsByBoxId(links: Link[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const link of links) {
    if (!m[link.fromBoxId]) m[link.fromBoxId] = [];
    if (!m[link.toBoxId]) m[link.toBoxId] = [];
    m[link.fromBoxId].push(link.id);
    if (link.toBoxId !== link.fromBoxId) {
      m[link.toBoxId].push(link.id);
    }
  }
  return m;
}
