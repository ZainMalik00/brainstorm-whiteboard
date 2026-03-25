import { describe, expect, it } from "vitest";
import { closestEdgeAnchors } from "./closestAnchors";
import type { Box } from "./types";

function box(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Box {
  return {
    id,
    kind: "text",
    x,
    y,
    width,
    height,
    zIndex: 1,
    style: { fill: "#fff", stroke: "#000", borderRadius: 0 },
    content: { type: "doc", content: [] },
  };
}

describe("closestEdgeAnchors", () => {
  it("chooses east and west when target is to the right", () => {
    const a = box("a", 0, 0, 100, 100);
    const b = box("b", 220, 10, 100, 80);
    const { fromAnchor, toAnchor } = closestEdgeAnchors(a, b);
    expect(fromAnchor).toBe("e");
    expect(toAnchor).toBe("w");
  });

  it("chooses north and south when target is directly below", () => {
    const a = box("a", 100, 0, 80, 60);
    const b = box("b", 100, 200, 80, 60);
    const { fromAnchor, toAnchor } = closestEdgeAnchors(a, b);
    expect(fromAnchor).toBe("s");
    expect(toAnchor).toBe("n");
  });
});
