import type { Box, ProseMirrorDocJSON } from "./types";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function collectAssetIdsFromDoc(doc: ProseMirrorDocJSON): string[] {
  const assetIds = new Set<string>();

  const visit = (node: unknown) => {
    if (!isJsonRecord(node)) return;

    if (node.type === "image" && isJsonRecord(node.attrs)) {
      const assetId = node.attrs.assetId;
      if (typeof assetId === "string" && assetId !== "") {
        assetIds.add(assetId);
      }
    }

    if (!Array.isArray(node.content)) return;
    for (const child of node.content) visit(child);
  };

  visit(doc);
  return [...assetIds];
}

export function collectAssetIdsFromBoxes(boxes: Box[]): string[] {
  const assetIds = new Set<string>();

  for (const box of boxes) {
    if (box.kind === "image") {
      assetIds.add(box.assetId);
      continue;
    }

    for (const assetId of collectAssetIdsFromDoc(box.content)) {
      assetIds.add(assetId);
    }
  }

  return [...assetIds];
}
