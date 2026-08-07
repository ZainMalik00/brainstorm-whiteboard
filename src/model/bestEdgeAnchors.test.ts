import { describe, expect, it } from "vitest";
import { bestEdgeAnchors } from "./bestEdgeAnchors";
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

describe("bestEdgeAnchors", () => {
  it("chooses east and west when target is to the right", () => {
    const a = box("a", 0, 0, 100, 100);
    const b = box("b", 220, 10, 100, 80);
    const { from, to } = bestEdgeAnchors(a, b);
    expect(from).toBe("e");
    expect(to).toBe("w");
  });

  it("chooses south and north when target is directly below", () => {
    const a = box("a", 100, 0, 80, 60);
    const b = box("b", 100, 200, 80, 60);
    const { from, to } = bestEdgeAnchors(a, b);
    expect(from).toBe("s");
    expect(to).toBe("n");
  });

  it("picks vertical sides when target is below-left and boxes are wider than tall", () => {
    const a = box("a", 0, 0, 200, 80);
    const b = box("b", -50, 200, 200, 80);
    const { from, to } = bestEdgeAnchors(a, b);
    expect(from).toBe("s");
    expect(to).toBe("n");
  });
});
