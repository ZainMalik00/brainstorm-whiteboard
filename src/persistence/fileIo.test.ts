import { afterEach, describe, expect, it } from "vitest";
import type { WhiteboardFile } from "../model/types";
import { clearAssetStore, importImageAsset } from "./assetStore";
import { createBoardBundleBlob, readBoardFile } from "./fileIo";

afterEach(() => {
  clearAssetStore();
});

describe("fileIo", () => {
  it("round-trips bundled boards with externalized image assets", async () => {
    const asset = {
      id: "asset-1",
      mimeType: "image/png",
      width: 64,
      height: 64,
    } as const;
    const file: WhiteboardFile = {
      schemaVersion: 2,
      viewport: { panX: 0, panY: 0, zoom: 1 },
      palette: { named: {}, custom: [] },
      assets: [asset],
      boxes: [
        {
          id: "text-1",
          kind: "text",
          x: 0,
          y: 0,
          width: 260,
          height: 160,
          zIndex: 1,
          style: { fill: "#fff", stroke: "#000", borderRadius: 8 },
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "image",
                    attrs: { assetId: asset.id, width: 48, height: 48, alt: "inline" },
                  },
                ],
              },
            ],
          },
        },
        {
          id: "image-1",
          kind: "image",
          x: 320,
          y: 240,
          width: 180,
          height: 180,
          zIndex: 2,
          style: { fill: "#fff", stroke: "#000", borderRadius: 8 },
          assetId: asset.id,
        },
      ],
      links: [],
    };
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: asset.mimeType });
    importImageAsset(asset, blob);

    const bundle = await createBoardBundleBlob(file);
    const loaded = await readBoardFile(
      new File([bundle], "whiteboard.wbz", { type: "application/zip" }),
    );

    expect(loaded.file.assets).toEqual([asset]);
    expect(loaded.file.boxes[0]).toMatchObject({ kind: "text" });
    expect(loaded.file.boxes[1]).toMatchObject({ kind: "image", assetId: asset.id });
    expect(loaded.assets).toHaveLength(1);
    expect(loaded.assets[0]?.asset.id).toBe(asset.id);
    expect(Array.from(new Uint8Array(await loaded.assets[0]!.blob.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
