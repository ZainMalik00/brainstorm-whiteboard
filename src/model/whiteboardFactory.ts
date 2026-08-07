import { EMPTY_DOC_JSON } from "./defaultDocContent";
import {
  DEFAULT_PALETTE,
  SCHEMA_VERSION,
  type ImageAsset,
  type Box,
  type BoxStyle,
  type Palette,
  type Viewport,
  type WhiteboardFile,
} from "./types";
import { fileFromRuntime, runtimeFromFile, type WhiteboardRuntime } from "./normalize";
import { getDefaultBoxStyle } from "./palette";

const defaultViewport: Viewport = { panX: 0, panY: 0, zoom: 1 };

export type BoxStyleOverrides = {
  fill?: string;
  stroke?: string;
  textColor?: string;
};

export function createEmptyWhiteboardFile(): WhiteboardFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    viewport: { ...defaultViewport },
    palette: {
      named: { ...DEFAULT_PALETTE.named },
      custom: [...DEFAULT_PALETTE.custom],
    },
    assets: [],
    boxes: [],
    links: [],
  };
}

export function createEmptyRuntime(): WhiteboardRuntime {
  return runtimeFromFile(createEmptyWhiteboardFile());
}

function mergeBoxStyle(palette: Palette, overrides?: BoxStyleOverrides): BoxStyle {
  const base = getDefaultBoxStyle(palette);
  if (!overrides) return base;
  return {
    fill: overrides.fill ?? base.fill,
    stroke: overrides.stroke ?? base.stroke,
    borderRadius: base.borderRadius,
    textColor: overrides.textColor ?? base.textColor,
  };
}

export function createBoxAt(
  x: number,
  y: number,
  zIndex: number,
  palette: Palette = DEFAULT_PALETTE,
  styleOverrides?: BoxStyleOverrides,
): Box {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    x,
    y,
    width: 280,
    height: 160,
    zIndex,
    style: mergeBoxStyle(palette, styleOverrides),
    content: structuredClone(EMPTY_DOC_JSON),
  };
}

function clampImageBoxSize(asset: ImageAsset): { width: number; height: number } {
  const maxWidth = 360;
  const maxHeight = 240;
  const minScale = Math.max(120 / asset.width, 80 / asset.height);
  const maxScale = Math.min(maxWidth / asset.width, maxHeight / asset.height, 1);
  const scale = Math.max(minScale, maxScale);
  return {
    width: Math.round(asset.width * scale),
    height: Math.round(asset.height * scale),
  };
}

export function createImageBoxAt(
  x: number,
  y: number,
  zIndex: number,
  asset: ImageAsset,
  palette: Palette = DEFAULT_PALETTE,
  styleOverrides?: BoxStyleOverrides,
): Box {
  const size = clampImageBoxSize(asset);
  return {
    id: crypto.randomUUID(),
    kind: "image",
    x,
    y,
    width: size.width,
    height: size.height,
    zIndex,
    style: mergeBoxStyle(palette, styleOverrides),
    assetId: asset.id,
  };
}

export { fileFromRuntime, runtimeFromFile };
export type { WhiteboardRuntime };
