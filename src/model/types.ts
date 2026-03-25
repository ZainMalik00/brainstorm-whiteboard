export const SCHEMA_VERSION = 2;

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Palette {
  named: Record<string, string>;
  custom: string[];
}

/** ProseMirror JSON for a full `doc` node */
export type ProseMirrorDocJSON = Record<string, unknown>;

export interface BoxStyle {
  fill: string;
  stroke: string;
  borderRadius: number;
  textColor?: string;
}

export interface ImageAsset {
  id: string;
  mimeType: string;
  width: number;
  height: number;
}

interface BoxBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Optional chrome title; omit or empty string in JSON means no label. */
  label?: string;
  style: BoxStyle;
}

export interface TextBox extends BoxBase {
  kind: "text";
  content: ProseMirrorDocJSON;
}

export interface ImageBox extends BoxBase {
  kind: "image";
  assetId: string;
  alt?: string;
}

export type Box = TextBox | ImageBox;

export interface LinkStyle {
  stroke: string;
  strokeWidth: number;
}

export type AnchorSide = "n" | "s" | "e" | "w" | "center";

export interface Link {
  id: string;
  fromBoxId: string;
  toBoxId: string;
  /** Ignored by the renderer: edge midpoints are chosen from geometry (closest pair). */
  fromAnchor?: AnchorSide;
  /** Ignored by the renderer. */
  toAnchor?: AnchorSide;
  label?: string;
  labelStyle?: { color?: string; fontSize?: number };
  labelOffset?: { x: number; y: number };
  style: LinkStyle;
}

/** On-disk / file shape */
export interface WhiteboardFile {
  schemaVersion: number;
  viewport: Viewport;
  palette: Palette;
  assets: ImageAsset[];
  boxes: Box[];
  links: Link[];
}

export function isTextBox(box: Box): box is TextBox {
  return box.kind === "text";
}

export function isImageBox(box: Box): box is ImageBox {
  return box.kind === "image";
}

export const DEFAULT_PALETTE: Palette = {
  named: {
    box1: "#e8dff5",
    box2: "#fce4ec",
    box3: "#e3f2fd",
    box4: "#e8f5e9",
    text: "#37474f",
    accent: "#7e57c2",
    stroke: "#b0bec5",
    link: "#78909c",
  },
  custom: [],
};

export const DEFAULT_LINK_STYLE: LinkStyle = {
  stroke: DEFAULT_PALETTE.named.link,
  strokeWidth: 2,
};

export const DEFAULT_BOX_STYLE: BoxStyle = {
  fill: DEFAULT_PALETTE.named.box1,
  stroke: DEFAULT_PALETTE.named.stroke,
  borderRadius: 8,
  textColor: DEFAULT_PALETTE.named.text,
};
