import { DOMSerializer } from "prosemirror-model";
import { memo, useCallback, useLayoutEffect, useRef } from "react";
import { boardSchema } from "../editor/schema";
import type { ProseMirrorDocJSON } from "../model/types";

type Props = {
  content: ProseMirrorDocJSON;
  textColor?: string;
};

export const BoxPreview = memo(function BoxPreview({ content, textColor }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const onClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    event.stopPropagation();
    window.open(anchor.href, "_blank", "noopener,noreferrer");
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    const doc = boardSchema.nodeFromJSON(content);
    const frag = DOMSerializer.fromSchema(boardSchema).serializeFragment(doc.content);
    el.appendChild(frag);
  }, [content]);

  return (
    <div
      className="ProseMirror box-preview pm-readonly max-h-full min-h-0 text-[0.9rem] leading-[1.45]"
      ref={ref}
      onClick={onClick}
      style={textColor ? { color: textColor } : undefined}
    />
  );
});
