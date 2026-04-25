import { anchorPointAt } from "./anchor";
import { bestEdgeAnchors } from "./bestEdgeAnchors";
import type { AnchorSide, Box, Link } from "./types";

export interface RoutedLink {
  p0: { x: number; y: number };
  side0: AnchorSide;
  p1: { x: number; y: number };
  side1: AnchorSide;
}

interface SideMember {
  linkId: string;
  role: "from" | "to";
  /** Position of the *other* endpoint along the edge axis; used to order arrows. */
  sortKey: number;
}

interface LinkSides {
  from: AnchorSide;
  to: AnchorSide;
  fromKey: number;
  toKey: number;
}

function edgeAxisKey(side: AnchorSide, otherCx: number, otherCy: number): number {
  return side === "n" || side === "s" ? otherCx : otherCy;
}

/**
 * Computes anchor points for every link, distributing siblings that hit the
 * same (box, side) along that edge instead of stacking them on the midpoint.
 *
 * For each side, links are sorted by where their *other* endpoint sits along
 * the edge axis (so an arrow coming from the left exits/enters on the left
 * portion of the edge), then placed at `t = (i + 1) / (N + 1)` for `i in 0..N-1`.
 */
export function computeLinkRouting(
  links: readonly Link[],
  boxesById: Record<string, Box>,
): Map<string, RoutedLink> {
  const sides = new Map<string, LinkSides>();
  const groups = new Map<string, SideMember[]>();

  const groupKey = (boxId: string, side: AnchorSide) => `${boxId}:${side}`;
  const ensureGroup = (key: string): SideMember[] => {
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    return g;
  };

  for (const link of links) {
    const a = boxesById[link.fromBoxId];
    const b = boxesById[link.toBoxId];
    if (!a || !b) continue;

    const { from, to } = bestEdgeAnchors(a, b);
    const aCx = a.x + a.width / 2;
    const aCy = a.y + a.height / 2;
    const bCx = b.x + b.width / 2;
    const bCy = b.y + b.height / 2;

    const fromKey = edgeAxisKey(from, bCx, bCy);
    const toKey = edgeAxisKey(to, aCx, aCy);

    sides.set(link.id, { from, to, fromKey, toKey });
    ensureGroup(groupKey(a.id, from)).push({
      linkId: link.id,
      role: "from",
      sortKey: fromKey,
    });
    ensureGroup(groupKey(b.id, to)).push({
      linkId: link.id,
      role: "to",
      sortKey: toKey,
    });
  }

  const tFrom = new Map<string, number>();
  const tTo = new Map<string, number>();

  for (const entries of groups.values()) {
    entries.sort(
      (x, y) => x.sortKey - y.sortKey || x.linkId.localeCompare(y.linkId),
    );
    const n = entries.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const e = entries[i];
      if (e.role === "from") tFrom.set(e.linkId, t);
      else tTo.set(e.linkId, t);
    }
  }

  const result = new Map<string, RoutedLink>();
  for (const link of links) {
    const a = boxesById[link.fromBoxId];
    const b = boxesById[link.toBoxId];
    if (!a || !b) continue;
    const meta = sides.get(link.id);
    if (!meta) continue;
    const t0 = tFrom.get(link.id) ?? 0.5;
    const t1 = tTo.get(link.id) ?? 0.5;
    result.set(link.id, {
      p0: anchorPointAt(a, meta.from, t0),
      side0: meta.from,
      p1: anchorPointAt(b, meta.to, t1),
      side1: meta.to,
    });
  }

  return result;
}
