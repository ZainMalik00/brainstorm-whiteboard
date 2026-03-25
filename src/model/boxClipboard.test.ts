import { describe, expect, it } from "vitest";
import type { Box } from "./types";
import { parseBoxClipboard, serializeBoxForClipboard } from "./boxClipboard";

const sampleBox: Box = {
  id: "old-id",
  kind: "text",
  x: 10,
  y: 20,
  width: 200,
  height: 120,
  zIndex: 3,
  label: "Hello",
  style: { fill: "#fff", stroke: "#000", borderRadius: 8 },
  content: { type: "doc", content: [{ type: "paragraph" }] },
};

describe("boxClipboard", () => {
  it("round-trips through JSON", () => {
    const text = serializeBoxForClipboard(sampleBox);
    const parsed = parseBoxClipboard(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.x).toBe(10);
    expect(parsed!.y).toBe(20);
    expect(parsed!.width).toBe(200);
    expect(parsed!.height).toBe(120);
    expect(parsed!.label).toBe("Hello");
    expect(parsed!.style.borderRadius).toBe(8);
    expect(parsed?.kind).toBe("text");
    if (parsed?.kind !== "text" || sampleBox.kind !== "text") {
      throw new Error("Expected text box payload");
    }
    expect(parsed.content).toEqual(sampleBox.content);
  });

  it("rejects non-whiteboard JSON", () => {
    expect(parseBoxClipboard("{}")).toBeNull();
    expect(parseBoxClipboard("not json")).toBeNull();
  });

  it("round-trips image box metadata without embedding bytes", () => {
    const imagePayload = parseBoxClipboard(
      serializeBoxForClipboard(
        {
          id: "img-1",
          kind: "image",
          x: 30,
          y: 40,
          width: 180,
          height: 90,
          zIndex: 4,
          label: "Diagram",
          style: { fill: "#fff", stroke: "#000", borderRadius: 8 },
          assetId: "asset-1",
          alt: "Architecture diagram",
        },
        {
          id: "asset-1",
          mimeType: "image/png",
          width: 640,
          height: 320,
        },
      ),
    );

    expect(imagePayload).not.toBeNull();
    expect(imagePayload?.kind).toBe("image");
    if (imagePayload?.kind !== "image") {
      throw new Error("Expected image payload");
    }
    expect(imagePayload.asset).toEqual({
      id: "asset-1",
      mimeType: "image/png",
      width: 640,
      height: 320,
    });
    expect(imagePayload.alt).toBe("Architecture diagram");
  });
});
