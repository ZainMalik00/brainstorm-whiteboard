import { describe, expect, it } from "vitest";
import type { Box, Link } from "./types";
import {
  parseBoxClipboard,
  parseBoxClipboardEntries,
  parseBoxClipboardPayload,
  serializeBoxesForClipboard,
  serializeBoxForClipboard,
} from "./boxClipboard";

const sampleTextBox: Box = {
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

const sampleImageBox: Box = {
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
};

describe("boxClipboard", () => {
  it("round-trips a single box through serialize/parse", () => {
    const text = serializeBoxForClipboard(sampleTextBox);
    const parsed = parseBoxClipboard(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.x).toBe(10);
    expect(parsed!.y).toBe(20);
    expect(parsed!.width).toBe(200);
    expect(parsed!.height).toBe(120);
    expect(parsed!.label).toBe("Hello");
    expect(parsed!.style.borderRadius).toBe(8);
    expect(parsed?.kind).toBe("text");
    if (parsed?.kind !== "text" || sampleTextBox.kind !== "text") {
      throw new Error("Expected text box payload");
    }
    expect(parsed.content).toEqual(sampleTextBox.content);
  });

  it("rejects non-whiteboard JSON", () => {
    expect(parseBoxClipboard("{}")).toBeNull();
    expect(parseBoxClipboard("not json")).toBeNull();
    expect(parseBoxClipboardEntries("{}")).toBeNull();
    expect(parseBoxClipboardPayload("{}")).toBeNull();
  });

  it("round-trips image box metadata without embedding bytes", () => {
    const imagePayload = parseBoxClipboard(
      serializeBoxForClipboard(sampleImageBox, {
        id: "asset-1",
        mimeType: "image/png",
        width: 640,
        height: 320,
      }),
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

  it("round-trips multiple boxes via the v3 array payload", () => {
    const text = serializeBoxesForClipboard([sampleTextBox, sampleImageBox], [
      { id: "asset-1", mimeType: "image/png", width: 640, height: 320 },
    ]);
    const parsed = parseBoxClipboardPayload(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.boxes.length).toBe(2);
    expect(parsed!.links).toEqual([]);
    expect(parsed!.boxes[0].kind).toBe("text");
    expect(parsed!.boxes[1].kind).toBe("image");
    const second = parsed!.boxes[1];
    if (second.kind !== "image") throw new Error("Expected image entry");
    expect(second.asset.id).toBe("asset-1");
  });

  it("round-trips incident links between selected boxes", () => {
    const otherTextBox: Box = {
      ...sampleTextBox,
      id: "other-id",
      x: 300,
      y: 400,
    };
    const incidentLink: Link = {
      id: "link-1",
      fromBoxId: "old-id",
      toBoxId: "other-id",
      label: "edge-A",
      labelStyle: { color: "#7e57c2", fontSize: 14 },
      labelOffset: { x: 4, y: -6 },
      style: { stroke: "#78909c", strokeWidth: 2 },
    };
    const danglingLink: Link = {
      id: "link-2",
      fromBoxId: "old-id",
      toBoxId: "not-in-selection",
      style: { stroke: "#000", strokeWidth: 1 },
    };

    const text = serializeBoxesForClipboard(
      [sampleTextBox, otherTextBox],
      [],
      [incidentLink, danglingLink],
    );
    const parsed = parseBoxClipboardPayload(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.boxes.length).toBe(2);
    // Dangling links (endpoint outside selection) are dropped.
    expect(parsed!.links.length).toBe(1);
    const link = parsed!.links[0];
    expect(link.fromIdx).toBe(0);
    expect(link.toIdx).toBe(1);
    expect(link.label).toBe("edge-A");
    expect(link.labelStyle).toEqual({ color: "#7e57c2", fontSize: 14 });
    expect(link.labelOffset).toEqual({ x: 4, y: -6 });
    expect(link.style.stroke).toBe("#78909c");
  });

  it("accepts legacy v1 single-box payloads", () => {
    const v1Payload = JSON.stringify({
      v: 1,
      kind: "text",
      x: 5,
      y: 6,
      width: 100,
      height: 50,
      style: { fill: "#abc", stroke: "#def", borderRadius: 4 },
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    const parsed = parseBoxClipboardPayload(v1Payload);
    expect(parsed).not.toBeNull();
    expect(parsed!.boxes.length).toBe(1);
    expect(parsed!.links).toEqual([]);
    expect(parsed!.boxes[0].kind).toBe("text");
    expect(parsed!.boxes[0].x).toBe(5);
  });

  it("accepts legacy v2 multi-box payloads with empty links", () => {
    const v2Payload = JSON.stringify({
      v: 2,
      boxes: [
        {
          kind: "text",
          x: 1,
          y: 2,
          width: 100,
          height: 50,
          style: { fill: "#abc", stroke: "#def", borderRadius: 4 },
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
      ],
    });
    const parsed = parseBoxClipboardPayload(v2Payload);
    expect(parsed).not.toBeNull();
    expect(parsed!.boxes.length).toBe(1);
    expect(parsed!.links).toEqual([]);
  });

  it("ignores malformed link entries while preserving valid ones", () => {
    const text = serializeBoxesForClipboard([sampleTextBox, { ...sampleTextBox, id: "b" }]);
    const data = JSON.parse(text) as Record<string, unknown>;
    data.links = [
      { fromIdx: 0, toIdx: 1, style: { stroke: "#000", strokeWidth: 2 } },
      { fromIdx: 0, toIdx: 99, style: { stroke: "#000", strokeWidth: 2 } }, // out-of-range
      { fromIdx: 0, toIdx: 0, style: { stroke: "#000", strokeWidth: 2 } }, // self-loop
      { fromIdx: 0, toIdx: 1 }, // missing style
    ];
    const parsed = parseBoxClipboardPayload(JSON.stringify(data));
    expect(parsed).not.toBeNull();
    expect(parsed!.links.length).toBe(1);
  });
});
