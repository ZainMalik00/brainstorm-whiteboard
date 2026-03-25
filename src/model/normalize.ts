import { buildLinkIdsByBoxId } from "./linkIndex";
import { collectAssetIdsFromBoxes } from "./assetRefs";
import { clonePalette, getDefaultBoxStyle, getDefaultLinkStyle, getNamedPaletteColor, resolveStoredColor } from "./palette";
import { SCHEMA_VERSION, type Box, type ImageAsset, type Link, type WhiteboardFile } from "./types";

export interface WhiteboardRuntime {
  viewport: WhiteboardFile["viewport"];
  palette: WhiteboardFile["palette"];
  assetsById: Record<string, ImageAsset>;
  boxesById: Record<string, Box>;
  links: Link[];
  linkIdsByBoxId: Record<string, string[]>;
}

function normalizeBox(box: Box, palette: WhiteboardFile["palette"]): Box {
  const defaultStyle = getDefaultBoxStyle(palette);
  const baseStyle = {
    fill: resolveStoredColor(box.style?.fill, palette, defaultStyle.fill),
    stroke: resolveStoredColor(box.style?.stroke, palette, defaultStyle.stroke),
    borderRadius: typeof box.style?.borderRadius === "number" ? box.style.borderRadius : defaultStyle.borderRadius,
  };

  if (box.kind === "text") {
    return {
      ...box,
      style: {
        ...baseStyle,
        textColor: resolveStoredColor(
          box.style?.textColor,
          palette,
          defaultStyle.textColor ?? getNamedPaletteColor(palette, "text"),
        ),
      },
    };
  }

  return {
    ...box,
    style: baseStyle,
  };
}

function normalizeLink(link: Link, palette: WhiteboardFile["palette"]): Link {
  const defaultStyle = getDefaultLinkStyle(palette);
  const textColor = getNamedPaletteColor(palette, "text");
  const labelStyle = link.labelStyle || link.label
    ? {
        ...link.labelStyle,
        color: resolveStoredColor(link.labelStyle?.color, palette, textColor),
      }
    : undefined;

  return {
    ...link,
    style: {
      stroke: resolveStoredColor(link.style?.stroke, palette, defaultStyle.stroke),
      strokeWidth: typeof link.style?.strokeWidth === "number" ? link.style.strokeWidth : defaultStyle.strokeWidth,
    },
    ...(labelStyle ? { labelStyle } : {}),
  };
}

export function runtimeFromFile(file: WhiteboardFile): WhiteboardRuntime {
  const palette = clonePalette(file.palette);
  const assetsById: Record<string, ImageAsset> = {};
  for (const asset of file.assets) {
    assetsById[asset.id] = asset;
  }
  const boxesById: Record<string, Box> = {};
  for (const b of file.boxes) {
    const normalizedBox = normalizeBox(b, palette);
    boxesById[normalizedBox.id] = normalizedBox;
  }
  const links = file.links.map((link) => normalizeLink(link, palette));
  return {
    viewport: { ...file.viewport },
    palette,
    assetsById,
    boxesById,
    links,
    linkIdsByBoxId: buildLinkIdsByBoxId(links),
  };
}

export function fileFromRuntime(r: WhiteboardRuntime): WhiteboardFile {
  const boxes = Object.values(r.boxesById).map((box) =>
    box.kind === "text"
      ? {
          ...box,
          style: { ...box.style },
          content: structuredClone(box.content),
        }
      : {
          ...box,
          style: { ...box.style },
        },
  );
  boxes.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const assets = collectAssetIdsFromBoxes(boxes)
    .map((assetId) => r.assetsById[assetId])
    .filter((asset): asset is ImageAsset => !!asset)
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: SCHEMA_VERSION,
    viewport: { ...r.viewport },
    palette: clonePalette(r.palette),
    assets,
    boxes,
    links: r.links.map((link) => ({
      ...link,
      style: { ...link.style },
      ...(link.labelStyle ? { labelStyle: { ...link.labelStyle } } : {}),
    })),
  };
}
