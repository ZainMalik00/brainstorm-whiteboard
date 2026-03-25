import OrderedMap from "orderedmap";
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import { marks as basicMarks, nodes as basicNodes } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EMPTY_DOC_JSON } from "../model/defaultDocContent";
import { getAssetUrl } from "../persistence/assetStore";

type TextAlign = "left" | "center" | "right";

function readTextAlign(dom: HTMLElement | string): TextAlign | null {
  if (typeof dom === "string") return null;
  const { textAlign } = dom.style;
  return textAlign === "left" || textAlign === "center" || textAlign === "right"
    ? textAlign
    : null;
}

function textAlignStyle(textAlign: unknown): string | null {
  return textAlign === "left" || textAlign === "center" || textAlign === "right"
    ? `text-align: ${textAlign}`
    : null;
}

function readNumberAttr(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const textStyle: MarkSpec = {
  attrs: {
    color: { default: null },
    fontFamily: { default: null },
    fontSize: { default: null },
  },
  inclusive: true,
  parseDOM: [
    {
      tag: "span[style]",
      getAttrs(dom: HTMLElement | string) {
        if (typeof dom === "string") return false;
        const { color, fontFamily, fontSize } = dom.style;
        const out: Record<string, string | null> = {
          color: color || null,
          fontFamily: fontFamily || null,
          fontSize: fontSize || null,
        };
        if (!out.color && !out.fontFamily && !out.fontSize) return false;
        return out;
      },
    },
  ],
  toDOM(mark) {
    const { color, fontFamily, fontSize } = mark.attrs;
    const style: string[] = [];
    if (color) style.push(`color: ${color}`);
    if (fontFamily) style.push(`font-family: ${fontFamily}`);
    if (fontSize) style.push(`font-size: ${fontSize}`);
    return ["span", style.length ? { style: style.join("; ") } : {}, 0];
  },
};

const paragraph: NodeSpec = {
  ...basicNodes.paragraph,
  attrs: {
    ...(basicNodes.paragraph.attrs ?? {}),
    textAlign: { default: null },
  },
  parseDOM: [
    {
      tag: "p",
      getAttrs(dom: HTMLElement | string) {
        return { textAlign: readTextAlign(dom) };
      },
    },
  ],
  toDOM(node) {
    const style = textAlignStyle(node.attrs.textAlign);
    return ["p", style ? { style } : {}, 0];
  },
};

const heading: NodeSpec = {
  ...basicNodes.heading,
  attrs: {
    ...(basicNodes.heading.attrs ?? {}),
    textAlign: { default: null },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom: HTMLElement | string) {
      return {
        level,
        textAlign: readTextAlign(dom),
      };
    },
  })),
  toDOM(node) {
    const style = textAlignStyle(node.attrs.textAlign);
    return [`h${node.attrs.level}`, style ? { style } : {}, 0];
  },
};

const image: NodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  atom: true,
  selectable: true,
  attrs: {
    assetId: {},
    width: { default: null },
    height: { default: null },
    alt: { default: null },
  },
  parseDOM: [
    {
      tag: "img[data-asset-id]",
      getAttrs(dom: HTMLElement | string) {
        if (typeof dom === "string") return false;
        const assetId = dom.getAttribute("data-asset-id");
        if (!assetId) return false;
        return {
          assetId,
          width: readNumberAttr(dom.getAttribute("data-width")) ?? readNumberAttr(dom.getAttribute("width")),
          height: readNumberAttr(dom.getAttribute("data-height")) ?? readNumberAttr(dom.getAttribute("height")),
          alt: dom.getAttribute("alt"),
        };
      },
    },
  ],
  toDOM(node) {
    const width = typeof node.attrs.width === "number" ? node.attrs.width : null;
    const height = typeof node.attrs.height === "number" ? node.attrs.height : null;
    const style: string[] = [];
    if (width) style.push(`width: ${width}px`);
    if (height) style.push(`height: ${height}px`);
    return [
      "img",
      {
        src: getAssetUrl(node.attrs.assetId) ?? "",
        alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
        "data-asset-id": node.attrs.assetId,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(width ? { "data-width": width } : {}),
        ...(height ? { "data-height": height } : {}),
        class: "wb-inline-image",
        ...(style.length ? { style: style.join("; ") } : {}),
      },
    ];
  },
};

const marks = {
  ...basicMarks,
  textStyle,
};

const nodes = addListNodes(
  OrderedMap.from({
    ...basicNodes,
    image,
    paragraph,
    heading,
  }),
  "paragraph block*",
  "block",
);

export const boardSchema = new Schema({ nodes, marks });

export function createEmptyDoc() {
  return boardSchema.nodeFromJSON(EMPTY_DOC_JSON);
}
