import { memo, useMemo } from "react";
import { anchorPoint } from "../model/anchor";
import { closestEdgeAnchors } from "../model/closestAnchors";
import { linkMidpointWorld } from "../model/linkMidpoint";
import { linkPathD } from "../model/linkPath";
import type { Box, Link } from "../model/types";

const LINK_HIT_STROKE_PX = 16;

type Props = {
  links: Link[];
  boxesById: Record<string, Box>;
  selectedLinkId: string | null;
  onSelectLink: (id: string | null) => void;
};

export const LinkLayer = memo(function LinkLayer({
  links,
  boxesById,
  selectedLinkId,
  onSelectLink,
}: Props) {
  const markerDefs = useMemo(() => {
    const markerIdByFill = new Map<string, string>();
    const defs: Array<{ id: string; fill: string }> = [];

    for (const link of links) {
      const fill = resolveMarkerFill(link.style.stroke);
      if (markerIdByFill.has(fill)) continue;
      const id = `wb-arr-${defs.length}`;
      markerIdByFill.set(fill, id);
      defs.push({ id, fill });
    }

    return { markerIdByFill, defs };
  }, [links]);

  return (
    <svg
      className="link-layer pointer-events-none absolute top-0 left-0 z-[10000] h-full w-full overflow-visible"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {markerDefs.defs.map(({ id, fill }) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill={fill} />
          </marker>
        ))}
      </defs>
      {links.map((link) => {
        const a = boxesById[link.fromBoxId];
        const b = boxesById[link.toBoxId];
        if (!a || !b) return null;
        return (
          <LinkPathItem
            key={link.id}
            link={link}
            boxA={a}
            boxB={b}
            selectedLinkId={selectedLinkId}
            onSelectLink={onSelectLink}
            markerId={markerDefs.markerIdByFill.get(resolveMarkerFill(link.style.stroke)) ?? "wb-arr-0"}
          />
        );
      })}
    </svg>
  );
});

type ItemProps = {
  link: Link;
  boxA: Box;
  boxB: Box;
  selectedLinkId: string | null;
  onSelectLink: (id: string | null) => void;
  markerId: string;
};

/** One link’s path; memoized so only this row recomputes when an endpoint box reference changes. */
const LinkPathItem = memo(function LinkPathItem({
  link,
  boxA,
  boxB,
  selectedLinkId,
  onSelectLink,
  markerId,
}: ItemProps) {
  const sel = link.id === selectedLinkId;

  const { d, midX, midY, stroke, strokeWidth } = useMemo(() => {
    const { fromAnchor, toAnchor } = closestEdgeAnchors(boxA, boxB);
    const p0 = anchorPoint(boxA, fromAnchor);
    const p1 = anchorPoint(boxB, toAnchor);
    const dPath = linkPathD(p0.x, p0.y, p1.x, p1.y);
    const mid = linkMidpointWorld(link, boxA, boxB);
    return {
      d: dPath,
      midX: mid.x,
      midY: mid.y,
      stroke: link.style.stroke,
      strokeWidth: link.style.strokeWidth,
    };
  }, [boxA, boxB, link]);

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={LINK_HIT_STROKE_PX}
        className="link-path-hit"
        style={{ pointerEvents: "stroke" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelectLink(link.id);
        }}
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        className={sel ? "link-path link-path--selected" : "link-path"}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />
      {link.label ? (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={link.labelStyle?.color ?? "#37474f"}
          fontSize={link.labelStyle?.fontSize ?? 12}
          style={{ pointerEvents: "none" }}
        >
          {link.label}
        </text>
      ) : null}
    </g>
  );
});

function resolveMarkerFill(stroke: string): string {
  if (stroke.startsWith("#")) return stroke;
  if (stroke.startsWith("rgb")) return stroke;
  return "#546e7a";
}
