import { SCHEMA_VERSION, type ImageAsset, type WhiteboardFile } from "./types";

type LegacyTextBoxV1 = Omit<WhiteboardFile["boxes"][number], "kind"> & {
  content: Record<string, unknown>;
};

function parseImageAssets(value: unknown): ImageAsset[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid whiteboard file: assets");
  }

  return value.map((asset) => {
    if (!asset || typeof asset !== "object") {
      throw new Error("Invalid whiteboard file: asset");
    }
    const record = asset as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.mimeType !== "string" ||
      typeof record.width !== "number" ||
      typeof record.height !== "number"
    ) {
      throw new Error("Invalid whiteboard file: asset");
    }

    return {
      id: record.id,
      mimeType: record.mimeType,
      width: record.width,
      height: record.height,
    };
  });
}

function migrateLegacyV1File(data: Record<string, unknown>): WhiteboardFile {
  if (!Array.isArray(data.boxes)) {
    throw new Error("Invalid whiteboard file: boxes");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    viewport: data.viewport as WhiteboardFile["viewport"],
    palette: data.palette as WhiteboardFile["palette"],
    assets: [],
    boxes: data.boxes.map((box) => {
      if (!box || typeof box !== "object") {
        throw new Error("Invalid whiteboard file: box");
      }
      const legacy = box as LegacyTextBoxV1;
      return {
        ...legacy,
        kind: "text" as const,
      };
    }),
    links: data.links as WhiteboardFile["links"],
  };
}

export function parseWhiteboardFileJson(text: string): WhiteboardFile {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid whiteboard file: expected object");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.schemaVersion !== "number") {
    throw new Error("Invalid whiteboard file: missing schemaVersion");
  }
  if (!o.viewport || typeof o.viewport !== "object") {
    throw new Error("Invalid whiteboard file: viewport");
  }
  if (!o.palette || typeof o.palette !== "object") {
    throw new Error("Invalid whiteboard file: palette");
  }
  if (!Array.isArray(o.boxes)) {
    throw new Error("Invalid whiteboard file: boxes");
  }
  if (!Array.isArray(o.links)) {
    throw new Error("Invalid whiteboard file: links");
  }

  if (o.schemaVersion === 1) {
    return migrateLegacyV1File(o);
  }

  if (o.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${String(o.schemaVersion)}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    viewport: o.viewport as WhiteboardFile["viewport"],
    palette: o.palette as WhiteboardFile["palette"],
    assets: parseImageAssets(o.assets),
    boxes: o.boxes as WhiteboardFile["boxes"],
    links: o.links as WhiteboardFile["links"],
  };
}

export function stringifyWhiteboardFile(file: WhiteboardFile): string {
  return JSON.stringify(file);
}
