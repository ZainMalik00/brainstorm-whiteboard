import { memo, useMemo } from "react";
import { linkMidpointWorld } from "../model/linkMidpoint";
import { linkPathD } from "../model/linkPath";
import { computeLinkRouting, type RoutedLink } from "../model/linkRouting";
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
  const routing = useMemo(
    () => computeLinkRouting(links, boxesById),
    [links, boxesById],
  );

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
        const routed = routing.get(link.id);
        if (!routed) return null;
        return (
          <LinkPathItem
            key={link.id}
            link={link}
            routed={routed}
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
  routed: RoutedLink;
  selectedLinkId: string | null;
  onSelectLink: (id: string | null) => void;
  markerId: string;
};

/** One link’s path; memoized so only this row recomputes when its routing changes. */
const LinkPathItem = memo(function LinkPathItem({
  link,
  routed,
  selectedLinkId,
  onSelectLink,
  markerId,
}: ItemProps) {
  const sel = link.id === selectedLinkId;

  const { d, midX, midY, stroke, strokeWidth } = useMemo(() => {
    const dPath = linkPathD(routed.p0, routed.side0, routed.p1, routed.side1);
    const mid = linkMidpointWorld(link, routed);
    return {
      d: dPath,
      midX: mid.x,
      midY: mid.y,
      stroke: link.style.stroke,
      strokeWidth: link.style.strokeWidth,
    };
  }, [routed, link]);

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
