import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { boardSchema } from "./schema";

export type LinkAttrs = {
  href: string;
  title: string | null;
};

export type TextAlign = "left" | "center" | "right";

const URL_WITH_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const URL_WITH_DOMAIN_RE = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#][^\s]*)?$/i;

export function setTextStyle(partial: {
  color?: string | null;
  fontFamily?: string | null;
  fontSize?: string | null;
}): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection;
    const markType = boardSchema.marks.textStyle;
    if (!markType) return false;
    if (empty) return false;
    const cur = markType.isInSet(state.storedMarks ?? $from.marks());
    const attrs = {
      color:
        partial.color !== undefined ? partial.color : (cur?.attrs.color ?? null),
      fontFamily:
        partial.fontFamily !== undefined
          ? partial.fontFamily
          : (cur?.attrs.fontFamily ?? null),
      fontSize:
        partial.fontSize !== undefined
          ? partial.fontSize
          : (cur?.attrs.fontSize ?? null),
    };
    if (dispatch) {
      let tr = state.tr;
      tr = tr.removeMark(from, to, markType);
      tr = tr.addMark(from, to, markType.create(attrs));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function setTextAlign(textAlign: TextAlign): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection;
    const paragraph = boardSchema.nodes.paragraph;
    const heading = boardSchema.nodes.heading;
    let tr = state.tr;
    let changed = false;

    const updateNode = (pos: number, node: ProseMirrorNode) => {
      if (node.type !== paragraph && node.type !== heading) return;
      if ((node.attrs.textAlign ?? null) === textAlign) return;
      tr = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        textAlign,
      });
      changed = true;
    };

    if (empty) {
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (node.type !== paragraph && node.type !== heading) continue;
        updateNode($from.before(depth), node);
        break;
      }
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        updateNode(pos, node);
        return true;
      });
    }

    if (!changed) return false;
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

export function normalizeLinkAttrs(
  hrefInput: string,
  titleInput?: string | null,
): LinkAttrs | null {
  const trimmedHref = hrefInput.trim();
  if (!trimmedHref || !isLikelyUrl(trimmedHref)) return null;

  const normalizedHref = URL_WITH_SCHEME_RE.test(trimmedHref)
    ? trimmedHref
    : `https://${trimmedHref}`;
  const trimmedTitle = titleInput?.trim();

  return {
    href: normalizedHref,
    title: trimmedTitle ? trimmedTitle : null,
  };
}

export function isLikelyUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return URL_WITH_SCHEME_RE.test(trimmed) || URL_WITH_DOMAIN_RE.test(trimmed);
}

export function setLink(attrs: LinkAttrs): Command {
  return (state, dispatch) => {
    const markType = boardSchema.marks.link;
    const { from, to, empty } = state.selection;
    if (empty) return false;
    if (!markType) return false;
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, markType).addMark(from, to, markType.create(attrs));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function setLinkRange(from: number, to: number, attrs: LinkAttrs): Command {
  return (state, dispatch) => {
    const markType = boardSchema.marks.link;
    if (!markType || from >= to) return false;
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, markType).addMark(from, to, markType.create(attrs));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function insertLinkedText(text: string, attrs: LinkAttrs): Command {
  return (state, dispatch) => {
    const markType = boardSchema.marks.link;
    if (!markType || !text) return false;
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(boardSchema.text(text, [markType.create(attrs)]), false);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
