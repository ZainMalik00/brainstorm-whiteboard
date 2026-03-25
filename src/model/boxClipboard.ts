import type { Box, BoxStyle, ImageAsset, ProseMirrorDocJSON } from "./types";

const CLIPBOARD_V = 1 as const;

type BoxClipboardBase = {
  v: typeof CLIPBOARD_V;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  style: BoxStyle;
};

export type TextBoxClipboardPayload = BoxClipboardBase & {
  kind: "text";
  content: ProseMirrorDocJSON;
};

export type ImageBoxClipboardPayload = BoxClipboardBase & {
  kind: "image";
  asset: ImageAsset;
  alt?: string;
};

export type BoxClipboardPayload = TextBoxClipboardPayload | ImageBoxClipboardPayload;

export function serializeBoxForClipboard(box: Box, asset?: ImageAsset): string {
  const base = {
    v: CLIPBOARD_V,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(box.label !== undefined && box.label !== "" ? { label: box.label } : {}),
    style: { ...box.style },
  };
  const payload: BoxClipboardPayload =
    box.kind === "image"
      ? {
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
        }
      : {
          ...base,
          kind: "text",
          content: structuredClone(box.content),
        };
  return JSON.stringify(payload);
}

export function parseBoxClipboard(text: string): BoxClipboardPayload | null {
  try {
    const o = JSON.parse(text) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (r.v !== CLIPBOARD_V) return null;
    if (typeof r.x !== "number" || typeof r.y !== "number") return null;
    if (typeof r.width !== "number" || typeof r.height !== "number") return null;
    if (r.kind !== "text" && r.kind !== "image") return null;
    if (!r.style || typeof r.style !== "object") return null;
    const st = r.style as Record<string, unknown>;
    if (typeof st.fill !== "string" || typeof st.stroke !== "string") return null;
    if (typeof st.borderRadius !== "number") return null;
    const style: BoxStyle = {
      fill: st.fill,
      stroke: st.stroke,
      borderRadius: st.borderRadius,
      ...(typeof st.textColor === "string" ? { textColor: st.textColor } : {}),
    };
    const base = {
      v: CLIPBOARD_V,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      style,
    };
    const payload: BoxClipboardPayload | null =
      r.kind === "image"
        ? (() => {
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
            return {
              ...base,
              kind: "image" as const,
              asset: {
                id: asset.id,
                mimeType: asset.mimeType,
                width: asset.width,
                height: asset.height,
              },
              ...(typeof r.alt === "string" && r.alt !== "" ? { alt: r.alt } : {}),
            };
          })()
        : (() => {
            if (!r.content || typeof r.content !== "object") return null;
            return {
              ...base,
              kind: "text" as const,
              content: r.content as ProseMirrorDocJSON,
            };
          })();
    if (!payload) return null;
    if (typeof r.label === "string" && r.label !== "") {
      payload.label = r.label;
    }
    return payload;
  } catch {
    return null;
  }
}
