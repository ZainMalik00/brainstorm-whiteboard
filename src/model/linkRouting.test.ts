import { describe, expect, it } from "vitest";
import { computeLinkRouting } from "./linkRouting";
import type { Box, Link } from "./types";

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

function link(id: string, fromBoxId: string, toBoxId: string): Link {
  return {
    id,
    fromBoxId,
    toBoxId,
    style: { stroke: "#000", strokeWidth: 2 },
  };
}

describe("computeLinkRouting", () => {
  it("places a single link at the midpoint of the chosen sides", () => {
    const a = box("a", 0, 0, 100, 60);
    const b = box("b", 0, 200, 100, 60);
    const l1 = link("l1", "a", "b");
    const routing = computeLinkRouting([l1], { a, b });
    const r = routing.get("l1")!;
    expect(r.side0).toBe("s");
    expect(r.side1).toBe("n");
    expect(r.p0.x).toBeCloseTo(50);
    expect(r.p1.x).toBeCloseTo(50);
  });

  it("distributes multiple links arriving at the same side along that edge", () => {
    const target = box("target", 0, 200, 300, 80);
    const left = box("left", -200, 0, 100, 60);
    const center = box("center", 100, 0, 100, 60);
    const right = box("right", 400, 0, 100, 60);
    const l1 = link("l1", "left", "target");
    const l2 = link("l2", "center", "target");
    const l3 = link("l3", "right", "target");
    const boxesById = { target, left, center, right };
    const routing = computeLinkRouting([l1, l2, l3], boxesById);

    const r1 = routing.get("l1")!;
    const r2 = routing.get("l2")!;
    const r3 = routing.get("l3")!;

    expect(r1.side1).toBe("n");
    expect(r2.side1).toBe("n");
    expect(r3.side1).toBe("n");

    expect(r1.p1.x).toBeCloseTo(target.x + target.width * 0.25);
    expect(r2.p1.x).toBeCloseTo(target.x + target.width * 0.5);
    expect(r3.p1.x).toBeCloseTo(target.x + target.width * 0.75);

    expect(r1.p1.x).toBeLessThan(r2.p1.x);
    expect(r2.p1.x).toBeLessThan(r3.p1.x);
  });

  it("distributes multiple links leaving the same side, ordered by destination", () => {
    const source = box("source", 0, 0, 300, 80);
    const above1 = box("above1", -200, -200, 100, 60);
    const above2 = box("above2", 100, -200, 100, 60);
    const above3 = box("above3", 400, -200, 100, 60);
    const l1 = link("l1", "source", "above1");
    const l2 = link("l2", "source", "above2");
    const l3 = link("l3", "source", "above3");
    const boxesById = { source, above1, above2, above3 };
    const routing = computeLinkRouting([l1, l2, l3], boxesById);

    const r1 = routing.get("l1")!;
    const r2 = routing.get("l2")!;
    const r3 = routing.get("l3")!;

    expect(r1.side0).toBe("n");
    expect(r2.side0).toBe("n");
    expect(r3.side0).toBe("n");

    expect(r1.p0.x).toBeLessThan(r2.p0.x);
    expect(r2.p0.x).toBeLessThan(r3.p0.x);
  });

  it("distributes links along a vertical edge by other-endpoint y", () => {
    const target = box("target", 200, 0, 80, 400);
    const top = box("top", -100, 0, 80, 60);
    const bot = box("bot", -100, 320, 80, 60);
    const l1 = link("l1", "top", "target");
    const l2 = link("l2", "bot", "target");
    const boxesById = { target, top, bot };
    const routing = computeLinkRouting([l1, l2], boxesById);

    const r1 = routing.get("l1")!;
    const r2 = routing.get("l2")!;

    expect(r1.side1).toBe("w");
    expect(r2.side1).toBe("w");
    expect(r1.p1.y).toBeLessThan(r2.p1.y);
  });
});
