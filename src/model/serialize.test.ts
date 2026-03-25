import { describe, expect, it } from "vitest";
import { createEmptyWhiteboardFile } from "./whiteboardFactory";
import { parseWhiteboardFileJson, stringifyWhiteboardFile } from "./serialize";
import { runtimeFromFile, fileFromRuntime } from "./normalize";

describe("serialize", () => {
  it("round-trips empty whiteboard", () => {
    const file = createEmptyWhiteboardFile();
    const text = stringifyWhiteboardFile(file);
    const back = parseWhiteboardFileJson(text);
    expect(back.schemaVersion).toBe(file.schemaVersion);
    expect(back.assets).toEqual([]);
    expect(back.boxes).toEqual([]);
    expect(back.links).toEqual([]);
  });

  it("runtime file round-trip", () => {
    const rt = runtimeFromFile(createEmptyWhiteboardFile());
    const f = fileFromRuntime(rt);
    const rt2 = runtimeFromFile(f);
    expect(rt2.boxesById).toEqual(rt.boxesById);
    expect(rt2.links).toEqual(rt.links);
  });

  it("migrates v1 text-only files to the v2 shape", () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      viewport: { panX: 0, panY: 0, zoom: 1 },
      palette: { named: {}, custom: [] },
      boxes: [
        {
          id: "box-1",
          x: 10,
          y: 20,
          width: 200,
          height: 120,
          zIndex: 1,
          style: { fill: "#fff", stroke: "#000", borderRadius: 8 },
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
      ],
      links: [],
    });

    const parsed = parseWhiteboardFileJson(legacy);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.assets).toEqual([]);
    expect(parsed.boxes[0]).toMatchObject({ kind: "text", id: "box-1" });
  });
});
