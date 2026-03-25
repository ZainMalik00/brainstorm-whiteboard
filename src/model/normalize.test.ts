import { describe, expect, it } from "vitest";
import { fileFromRuntime, runtimeFromFile } from "./normalize";
import type { WhiteboardFile } from "./types";

describe("normalize", () => {
  it("resolves legacy palette variables into literal stored colors", () => {
    const file: WhiteboardFile = {
      schemaVersion: 2,
      viewport: { panX: 0, panY: 0, zoom: 1 },
      palette: {
        named: {
          box1: "#112233",
          stroke: "#223344",
          text: "#334455",
          link: "#445566",
        },
        custom: ["#556677"],
      },
      assets: [],
      boxes: [
        {
          id: "box-1",
          kind: "text",
          x: 10,
          y: 20,
          width: 220,
          height: 160,
          zIndex: 1,
          style: {
            fill: "var(--wb-box-fill, #ffffff)",
            stroke: "var(--wb-box-stroke, #000000)",
            borderRadius: 8,
          },
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
        {
          id: "box-2",
          kind: "text",
          x: 280,
          y: 20,
          width: 220,
          height: 160,
          zIndex: 2,
          style: {
            fill: "var(--wb-palette-custom-0, #eeeeee)",
            stroke: "#778899",
            borderRadius: 8,
          },
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
      ],
      links: [
        {
          id: "link-1",
          fromBoxId: "box-1",
          toBoxId: "box-2",
          label: "Legacy label",
          style: {
            stroke: "var(--wb-link-stroke, #000000)",
            strokeWidth: 2,
          },
        },
      ],
    };

    const runtime = runtimeFromFile(file);
    const firstBox = runtime.boxesById["box-1"];
    const secondBox = runtime.boxesById["box-2"];
    const firstLink = runtime.links[0];

    if (firstBox.kind !== "text" || secondBox.kind !== "text") {
      throw new Error("Expected normalized text boxes");
    }

    expect(firstBox.style.fill).toBe("#112233");
    expect(firstBox.style.stroke).toBe("#223344");
    expect(firstBox.style.textColor).toBe("#334455");

    expect(secondBox.style.fill).toBe("#556677");
    expect(secondBox.style.textColor).toBe("#334455");

    expect(firstLink.style.stroke).toBe("#445566");
    expect(firstLink.labelStyle?.color).toBe("#334455");

    const roundTrip = fileFromRuntime(runtime);
    expect(roundTrip.boxes[0].style.fill).toBe("#112233");
    expect(roundTrip.boxes[0].style.textColor).toBe("#334455");
    expect(roundTrip.links[0].style.stroke).toBe("#445566");
    expect(roundTrip.links[0].labelStyle?.color).toBe("#334455");
  });
});
