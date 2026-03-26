import { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { buildBoardEditorPlugins, buildBoardNodeViews } from "../editor/plugins";
import { boardSchema } from "../editor/schema";
import { insertLinkedText, isLikelyUrl, normalizeLinkAttrs } from "../editor/textStyle";
import { useBoardTransform } from "../context/BoardTransformContext";
import { useEditorRegistry } from "../context/EditorRegistryContext";
import type { ProseMirrorDocJSON } from "../model/types";
import { registerImageBlob } from "../persistence/assetStore";
import { useWhiteboardStore } from "../store/whiteboardStore";
import "prosemirror-view/style/prosemirror.css";

type Props = {
  boxId: string;
  content: ProseMirrorDocJSON;
  editable: boolean;
  textColor?: string;
  onChange: (json: ProseMirrorDocJSON) => void;
};

const DEBOUNCE_MS = 280;

function getClipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const items = Array.from(data.items ?? []);
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  const files = Array.from(data.files ?? []);
  return files.find((file) => file.type.startsWith("image/")) ?? null;
}

function getInitialInlineImageSize(width: number, height: number): { width: number; height: number } {
  const maxWidth = 220;
  const maxHeight = 180;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(48, Math.round(width * scale)),
    height: Math.max(48, Math.round(height * scale)),
  };
}

export function ProseMirrorBoxEditor({ boxId, content, editable, textColor, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { register, unregister, notifyViewsChanged } = useEditorRegistry();
  const upsertAsset = useWhiteboardStore((s) => s.upsertAsset);
  const { isViewportTouchGestureActive } = useBoardTransform();

  const flush = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    onChangeRef.current(v.state.doc.toJSON() as ProseMirrorDocJSON);
  }, []);

  const handlePaste = useCallback(
    (view: EditorView, event: ClipboardEvent) => {
      const imageFile = getClipboardImageFile(event.clipboardData);
      if (imageFile) {
        event.preventDefault();
        void (async () => {
          try {
            const asset = await registerImageBlob(imageFile);
            upsertAsset(asset);
            const size = getInitialInlineImageSize(asset.width, asset.height);
            const node = boardSchema.nodes.image.create({
              assetId: asset.id,
              width: size.width,
              height: size.height,
              alt: imageFile.name || null,
            });
            const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
            view.dispatch(tr);
            view.focus();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Unable to paste image.");
          }
        })();
        return true;
      }

      const pastedText = event.clipboardData?.getData("text/plain")?.trim();
      if (!pastedText || !isLikelyUrl(pastedText)) return false;

      const attrs = normalizeLinkAttrs(pastedText);
      if (!attrs) return false;

      event.preventDefault();
      insertLinkedText(pastedText, attrs)(view.state, view.dispatch);
      return true;
    },
    [upsertAsset],
  );

  const handleEditorClick = useCallback((_view: EditorView, _pos: number, event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return false;

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return false;

    event.preventDefault();
    window.open(anchor.href, "_blank", "noopener,noreferrer");
    return true;
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const state = EditorState.create({
      doc: Node.fromJSON(boardSchema, contentRef.current),
      plugins: buildBoardEditorPlugins(),
    });

    const view = new EditorView(el, {
      state,
      editable: () => editable,
      nodeViews: buildBoardNodeViews({ isViewportTouchGestureActive }),
      handlePaste,
      handleClick: handleEditorClick,
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        notifyViewsChanged();
        if (tr.docChanged) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(flush, DEBOUNCE_MS);
        }
      },
    });

    viewRef.current = view;
    register(boxId, view);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      flush();
      unregister(boxId);
      view.destroy();
      viewRef.current = null;
    };
    // Recreate editor only when `boxId` changes; `content` syncs via effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount doc from props once per box
  }, [
    boxId,
    flush,
    handleEditorClick,
    handlePaste,
    isViewportTouchGestureActive,
    notifyViewsChanged,
    register,
    unregister,
  ]);

  useEffect(() => {
    viewRef.current?.setProps({ editable: () => editable });
  }, [editable]);

  return (
    <div
      className="pm-box-root max-h-full min-h-0 text-[0.9rem] leading-[1.45]"
      ref={rootRef}
      style={textColor ? { color: textColor } : undefined}
    />
  );
}
