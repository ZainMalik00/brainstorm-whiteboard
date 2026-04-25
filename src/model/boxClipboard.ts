import type { Box, BoxStyle, ImageAsset, Link, LinkStyle, ProseMirrorDocJSON } from "./types";

const CLIPBOARD_V1 = 1 as const;
const CLIPBOARD_V2 = 2 as const;
const CLIPBOARD_V3 = 3 as const;
export const CLIPBOARD_V = CLIPBOARD_V3;

type SingleEntryBase = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  style: BoxStyle;
};

export type TextBoxClipboardEntry = SingleEntryBase & {
  kind: "text";
  content: ProseMirrorDocJSON;
};

export type ImageBoxClipboardEntry = SingleEntryBase & {
  kind: "image";
  asset: ImageAsset;
  alt?: string;
};

export type SingleBoxClipboardEntry = TextBoxClipboardEntry | ImageBoxClipboardEntry;

export type LinkClipboardEntry = {
  /** Index into `payload.boxes` for the source endpoint. */
  fromIdx: number;
  /** Index into `payload.boxes` for the destination endpoint. */
  toIdx: number;
  label?: string;
  labelStyle?: { color?: string; fontSize?: number };
  labelOffset?: { x: number; y: number };
  style: LinkStyle;
};

export type BoxClipboardPayload = {
  v: typeof CLIPBOARD_V3;
  boxes: SingleBoxClipboardEntry[];
  links: LinkClipboardEntry[];
};

export type ParsedBoxClipboard = {
  boxes: SingleBoxClipboardEntry[];
  links: LinkClipboardEntry[];
};

function styleToJson(style: BoxStyle): BoxStyle {
  return {
    fill: style.fill,
    stroke: style.stroke,
    borderRadius: style.borderRadius,
    ...(typeof style.textColor === "string" ? { textColor: style.textColor } : {}),
  };
}

function entryFromBox(box: Box, asset?: ImageAsset): SingleBoxClipboardEntry {
  const base = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(box.label !== undefined && box.label !== "" ? { label: box.label } : {}),
    style: styleToJson(box.style),
  };
  if (box.kind === "image") {
    return {
      ...base,
      kind: "image",
      asset:
        asset && asset.id === box.assetId
          ? asset
          : {
              id: box.assetId,
              mimeType: "image/png",
              width: box.width,
              height: box.height,
            },
      ...(box.alt ? { alt: box.alt } : {}),
    };
  }
  return {
    ...base,
    kind: "text",
    content: structuredClone(box.content),
  };
}

function linkEntryFromLink(link: Link, fromIdx: number, toIdx: number): LinkClipboardEntry {
  return {
    fromIdx,
    toIdx,
    style: { stroke: link.style.stroke, strokeWidth: link.style.strokeWidth },
    ...(link.label !== undefined && link.label !== "" ? { label: link.label } : {}),
    ...(link.labelStyle ? { labelStyle: { ...link.labelStyle } } : {}),
    ...(link.labelOffset ? { labelOffset: { ...link.labelOffset } } : {}),
  };
}

export function serializeBoxesForClipboard(
  boxes: readonly Box[],
  assets: readonly ImageAsset[] = [],
  links: readonly Link[] = [],
): string {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const idxByBoxId = new Map<string, number>();
  boxes.forEach((box, i) => {
    idxByBoxId.set(box.id, i);
  });
  const boxEntries = boxes.map((box) =>
    entryFromBox(box, box.kind === "image" ? assetById.get(box.assetId) : undefined),
  );
  const linkEntries: LinkClipboardEntry[] = [];
  for (const link of links) {
    const fromIdx = idxByBoxId.get(link.fromBoxId);
    const toIdx = idxByBoxId.get(link.toBoxId);
    if (fromIdx === undefined || toIdx === undefined) continue;
    linkEntries.push(linkEntryFromLink(link, fromIdx, toIdx));
  }
  const payload: BoxClipboardPayload = { v: CLIPBOARD_V3, boxes: boxEntries, links: linkEntries };
  return JSON.stringify(payload);
}

/** Backwards-compatible single-box serializer; emits v3 with one entry and no links. */
export function serializeBoxForClipboard(box: Box, asset?: ImageAsset): string {
  return serializeBoxesForClipboard([box], asset ? [asset] : []);
}

function parseStyle(value: unknown): BoxStyle | null {
  if (!value || typeof value !== "object") return null;
  const st = value as Record<string, unknown>;
  if (typeof st.fill !== "string" || typeof st.stroke !== "string") return null;
  if (typeof st.borderRadius !== "number") return null;
  return {
    fill: st.fill,
    stroke: st.stroke,
    borderRadius: st.borderRadius,
    ...(typeof st.textColor === "string" ? { textColor: st.textColor } : {}),
  };
}

function parseLinkStyle(value: unknown): LinkStyle | null {
  if (!value || typeof value !== "object") return null;
  const st = value as Record<string, unknown>;
  if (typeof st.stroke !== "string") return null;
  if (typeof st.strokeWidth !== "number") return null;
  return { stroke: st.stroke, strokeWidth: st.strokeWidth };
}

function parseEntry(raw: unknown): SingleBoxClipboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== "number" || typeof r.y !== "number") return null;
  if (typeof r.width !== "number" || typeof r.height !== "number") return null;
  if (r.kind !== "text" && r.kind !== "image") return null;
  const style = parseStyle(r.style);
  if (!style) return null;
  const base = {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    style,
  };
  let entry: SingleBoxClipboardEntry | null = null;
  if (r.kind === "image") {
    if (!r.asset || typeof r.asset !== "object") return null;
    const asset = r.asset as Record<string, unknown>;
    if (
      typeof asset.id !== "string" ||
      typeof asset.mimeType !== "string" ||
      typeof asset.width !== "number" ||
      typeof asset.height !== "number"
    ) {
      return null;
    }
    entry = {
      ...base,
      kind: "image",
      asset: {
        id: asset.id,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      },
      ...(typeof r.alt === "string" && r.alt !== "" ? { alt: r.alt } : {}),
    };
  } else {
    if (!r.content || typeof r.content !== "object") return null;
    entry = {
      ...base,
      kind: "text",
      content: r.content as ProseMirrorDocJSON,
    };
  }
  if (typeof r.label === "string" && r.label !== "") {
    entry.label = r.label;
  }
  return entry;
}

function parseLinkEntry(raw: unknown, boxCount: number): LinkClipboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.fromIdx !== "number" || typeof r.toIdx !== "number") return null;
  if (!Number.isInteger(r.fromIdx) || !Number.isInteger(r.toIdx)) return null;
  if (r.fromIdx < 0 || r.toIdx < 0 || r.fromIdx >= boxCount || r.toIdx >= boxCount) return null;
  if (r.fromIdx === r.toIdx) return null;
  const style = parseLinkStyle(r.style);
  if (!style) return null;
  const entry: LinkClipboardEntry = {
    fromIdx: r.fromIdx,
    toIdx: r.toIdx,
    style,
  };
  if (typeof r.label === "string" && r.label !== "") {
    entry.label = r.label;
  }
  if (r.labelStyle && typeof r.labelStyle === "object") {
    const ls = r.labelStyle as Record<string, unknown>;
    const labelStyle: { color?: string; fontSize?: number } = {};
    if (typeof ls.color === "string") labelStyle.color = ls.color;
    if (typeof ls.fontSize === "number") labelStyle.fontSize = ls.fontSize;
    if (Object.keys(labelStyle).length > 0) entry.labelStyle = labelStyle;
  }
  if (r.labelOffset && typeof r.labelOffset === "object") {
    const lo = r.labelOffset as Record<string, unknown>;
    if (typeof lo.x === "number" && typeof lo.y === "number") {
      entry.labelOffset = { x: lo.x, y: lo.y };
    }
  }
  return entry;
}

/** Returns the parsed clipboard payload on success; supports v1/v2 (boxes only) and v3 (boxes + links). */
export function parseBoxClipboardPayload(text: string): ParsedBoxClipboard | null {
  try {
    const o = JSON.parse(text) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (r.v === CLIPBOARD_V3) {
      if (!Array.isArray(r.boxes)) return null;
      const boxes: SingleBoxClipboardEntry[] = [];
      for (const item of r.boxes) {
        const entry = parseEntry(item);
        if (!entry) return null;
        boxes.push(entry);
      }
      if (boxes.length === 0) return null;
      const links: LinkClipboardEntry[] = [];
      if (Array.isArray(r.links)) {
        for (const item of r.links) {
          const link = parseLinkEntry(item, boxes.length);
          if (link) links.push(link);
        }
      }
      return { boxes, links };
    }
    if (r.v === CLIPBOARD_V2) {
      if (!Array.isArray(r.boxes)) return null;
      const boxes: SingleBoxClipboardEntry[] = [];
      for (const item of r.boxes) {
        const entry = parseEntry(item);
        if (!entry) return null;
        boxes.push(entry);
      }
      if (boxes.length === 0) return null;
      return { boxes, links: [] };
    }
    if (r.v === CLIPBOARD_V1) {
      const entry = parseEntry(r);
      return entry ? { boxes: [entry], links: [] } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use `parseBoxClipboardPayload` for new code (returns boxes + links).
 * Kept for backwards-compat: returns just the entries array.
 */
export function parseBoxClipboardEntries(text: string): SingleBoxClipboardEntry[] | null {
  const parsed = parseBoxClipboardPayload(text);
  return parsed ? parsed.boxes : null;
}

/**
 * @deprecated Use `parseBoxClipboardPayload` for new code.
 * Kept for backwards-compat: returns the first entry of a multi payload.
 */
export function parseBoxClipboard(text: string): SingleBoxClipboardEntry | null {
  const parsed = parseBoxClipboardPayload(text);
  return parsed && parsed.boxes.length > 0 ? parsed.boxes[0] : null;
}
