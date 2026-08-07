import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { getAssetUrl } from "../persistence/assetStore";
import { getPrimarySelectedBoxId, useWhiteboardStore } from "../store/whiteboardStore";
import { useBoardTransform } from "../context/BoardTransformContext";
import { useMultiDrag } from "../context/MultiDragContext";
import { BoxPreview } from "./BoxPreview";
import { ProseMirrorBoxEditor } from "./ProseMirrorBoxEditor";
import type { Box as BoxType, ProseMirrorDocJSON } from "../model/types";

type Props = { boxId: string };

const MIN_W = 120;
const MIN_H = 80;

/** Tools where box drag/select/edit interactions are active (everything but the link tool). */
function isBoxInteractionTool(tool: "select" | "marquee" | "link"): boolean {
  return tool !== "link";
}

type DragState = {
  kind: "move" | "resize";
  pointerId: number;
  pointerType: string;
  captureTarget: HTMLElement | null;
  abortController: AbortController;
  originWorldX: number;
  originWorldY: number;
  startBoxX: number;
  startBoxY: number;
  startW: number;
  startH: number;
  aspectRatio: number | null;
  curX: number;
  curY: number;
  curW: number;
  curH: number;
  /** When non-empty, this is a multi-box move that drives sibling boxes via MultiDragContext. */
  participants: Array<{ id: string; startX: number; startY: number }>;
};

export const Box = memo(function Box({ boxId }: Props) {
  const box = useWhiteboardStore((s) => s.boxesById[boxId]) as BoxType | undefined;
  const tool = useWhiteboardStore((s) => s.tool);
  const linkSourceId = useWhiteboardStore((s) => s.linkSourceId);

  const { isSelected, isPrimary, selectionSize } = useWhiteboardStore(
    useShallow((s) => {
      const ids = s.selectedBoxIds;
      return {
        isSelected: ids.includes(boxId),
        isPrimary: getPrimarySelectedBoxId(s) === boxId,
        selectionSize: ids.length,
      };
    }),
  );

  const selectBoxes = useWhiteboardStore((s) => s.selectBoxes);
  const toggleBoxInSelection = useWhiteboardStore((s) => s.toggleBoxInSelection);
  const setLinkSource = useWhiteboardStore((s) => s.setLinkSource);
  const tryCompleteLink = useWhiteboardStore((s) => s.tryCompleteLink);
  const updateBoxContent = useWhiteboardStore((s) => s.updateBoxContent);
  const commitBoxPosition = useWhiteboardStore((s) => s.commitBoxPosition);
  const commitMultiBoxPositions = useWhiteboardStore((s) => s.commitMultiBoxPositions);
  const commitBoxSize = useWhiteboardStore((s) => s.commitBoxSize);

  const { clientToWorld, isViewportTouchGestureActive } = useBoardTransform();
  const multiDrag = useMultiDrag();

  /** Live x,y,w,h during drag/resize — drives React style so PM/store updates cannot snap the box back. */
  const [liveLayout, setLiveLayout] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);

  const onContentChange = useCallback(
    (json: ProseMirrorDocJSON) => {
      updateBoxContent(boxId, json);
    },
    [boxId, updateBoxContent],
  );

  const flushLiveLayoutFromDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setLiveLayout({
      x: d.curX,
      y: d.curY,
      w: d.curW,
      h: d.curH,
    });
  }, []);

  const scheduleLayoutFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushLiveLayoutFromDrag();
    });
  }, [flushLiveLayoutFromDrag]);

  // When this box is a non-primary participant in a multi-box drag, react to shared offset updates.
  useEffect(() => {
    return multiDrag.subscribe(boxId, (offset) => {
      if (offset === null) {
        // Only clear if this Box wasn't the drag leader (leader manages its own liveLayout).
        if (!dragRef.current) setLiveLayout(null);
        return;
      }
      // Don't override leader's local state.
      if (dragRef.current) return;
      const b = useWhiteboardStore.getState().boxesById[boxId];
      if (!b) return;
      setLiveLayout({
        x: b.x + offset.dx,
        y: b.y + offset.dy,
        w: b.width,
        h: b.height,
      });
    });
  }, [boxId, multiDrag]);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!d) {
      setLiveLayout(null);
      return;
    }
    d.abortController.abort();
    try {
      d.captureTarget?.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    if (d.kind === "move") {
      const moved = d.curX !== d.startBoxX || d.curY !== d.startBoxY;
      if (d.participants.length > 0) {
        if (moved) {
          const dx = d.curX - d.startBoxX;
          const dy = d.curY - d.startBoxY;
          commitMultiBoxPositions(
            d.participants.map((p) => ({
              id: p.id,
              x: p.startX + dx,
              y: p.startY + dy,
            })),
          );
        }
        multiDrag.end();
      } else if (moved) {
        commitBoxPosition(boxId, d.curX, d.curY);
      }
    } else {
      const b = useWhiteboardStore.getState().boxesById[boxId];
      if (b && (d.curW !== d.startW || d.curH !== d.startH)) {
        commitBoxSize(boxId, b.x, b.y, d.curW, d.curH);
      }
    }
    setLiveLayout(null);
  }, [boxId, commitBoxPosition, commitBoxSize, commitMultiBoxPositions, multiDrag]);

  const cancelDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    d?.abortController.abort();
    try {
      d?.captureTarget?.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    if (d?.participants.length) multiDrag.end();
    setLiveLayout(null);
  }, [multiDrag]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.pointerType === "touch" && isViewportTouchGestureActive()) {
        cancelDrag();
        return;
      }
      const w = clientToWorld(e.clientX, e.clientY);
      const dx = w.x - d.originWorldX;
      const dy = w.y - d.originWorldY;
      if (d.kind === "move") {
        d.curX = d.startBoxX + dx;
        d.curY = d.startBoxY + dy;
        if (d.participants.length > 0) {
          multiDrag.update({ dx, dy });
        }
      } else {
        if (d.aspectRatio) {
          const minScale = Math.max(MIN_W / d.startW, MIN_H / d.startH);
          const widthScale = (d.startW + dx) / d.startW;
          const heightScale = (d.startH + dy) / d.startH;
          const scale = Math.max(minScale, widthScale, heightScale);
          d.curW = Math.round(d.startW * scale);
          d.curH = Math.round(d.startH * scale);
        } else {
          d.curW = Math.max(MIN_W, d.startW + dx);
          d.curH = Math.max(MIN_H, d.startH + dy);
        }
      }
      scheduleLayoutFlush();
    },
    [cancelDrag, clientToWorld, isViewportTouchGestureActive, multiDrag, scheduleLayoutFlush],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (dragRef.current?.pointerId !== e.pointerId) return;
      if (dragRef.current.pointerType === "touch" && isViewportTouchGestureActive()) {
        cancelDrag();
        return;
      }
      endDrag();
    },
    [cancelDrag, endDrag, isViewportTouchGestureActive],
  );

  const startMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !isBoxInteractionTool(tool)) return;
      if (e.pointerType === "touch" && isViewportTouchGestureActive()) return;
      const state = useWhiteboardStore.getState();
      const b = state.boxesById[boxId];
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      const captureTarget = e.currentTarget as HTMLElement;
      captureTarget.setPointerCapture(e.pointerId);
      const abortController = new AbortController();
      const w = clientToWorld(e.clientX, e.clientY);

      // If this box is part of a multi-selection, drag all of them together.
      const selectedIds = state.selectedBoxIds;
      const isInSelection = selectedIds.includes(boxId);
      const participantIds =
        isInSelection && selectedIds.length > 1
          ? selectedIds.filter((id) => !!state.boxesById[id])
          : [];
      const participants = participantIds.map((id) => {
        const pb = state.boxesById[id];
        return { id, startX: pb.x, startY: pb.y };
      });

      dragRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        captureTarget,
        abortController,
        originWorldX: w.x,
        originWorldY: w.y,
        startBoxX: b.x,
        startBoxY: b.y,
        startW: b.width,
        startH: b.height,
        aspectRatio: null,
        curX: b.x,
        curY: b.y,
        curW: b.width,
        curH: b.height,
        participants,
      };

      if (participants.length > 0) {
        multiDrag.begin(participants.map((p) => p.id));
      }

      flushLiveLayoutFromDrag();
      window.addEventListener("pointermove", onPointerMove, { signal: abortController.signal });
      window.addEventListener("pointerup", onPointerUp, { signal: abortController.signal });
      window.addEventListener("pointercancel", onPointerUp, { signal: abortController.signal });
    },
    [
      boxId,
      clientToWorld,
      flushLiveLayoutFromDrag,
      isViewportTouchGestureActive,
      multiDrag,
      onPointerMove,
      onPointerUp,
      tool,
    ],
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !isBoxInteractionTool(tool) || !isPrimary) return;
      if (e.pointerType === "touch" && isViewportTouchGestureActive()) return;
      const b = useWhiteboardStore.getState().boxesById[boxId];
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      const captureTarget = e.target as HTMLElement;
      captureTarget.setPointerCapture(e.pointerId);
      const abortController = new AbortController();
      const w = clientToWorld(e.clientX, e.clientY);
      dragRef.current = {
        kind: "resize",
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        captureTarget,
        abortController,
        originWorldX: w.x,
        originWorldY: w.y,
        startBoxX: b.x,
        startBoxY: b.y,
        startW: b.width,
        startH: b.height,
        aspectRatio: b.kind === "image" ? Math.max(b.width / Math.max(b.height, 1), 0.01) : null,
        curX: b.x,
        curY: b.y,
        curW: b.width,
        curH: b.height,
        participants: [],
      };
      flushLiveLayoutFromDrag();
      window.addEventListener("pointermove", onPointerMove, { signal: abortController.signal });
      window.addEventListener("pointerup", onPointerUp, { signal: abortController.signal });
      window.addEventListener("pointercancel", onPointerUp, { signal: abortController.signal });
    },
    [
      boxId,
      clientToWorld,
      flushLiveLayoutFromDrag,
      isPrimary,
      isViewportTouchGestureActive,
      onPointerMove,
      onPointerUp,
      tool,
    ],
  );

  if (!box) return null;

  /** Returns true when the caller should proceed with an in-box interaction (e.g. dragging the image body). */
  const beginBoxInteraction = (e: React.PointerEvent): boolean => {
    const target = e.target;
    if (target instanceof Element && target.closest("a[href]")) return false;
    if (e.pointerType === "touch" && isViewportTouchGestureActive()) return false;

    e.stopPropagation();
    if (tool === "link") {
      if (linkSourceId && linkSourceId !== boxId) {
        tryCompleteLink(boxId);
      } else {
        setLinkSource(boxId);
      }
      return false;
    }

    // Shift+click toggles this box in/out of the multi-selection without entering edit mode.
    if (e.shiftKey) {
      toggleBoxInSelection(boxId);
      return false;
    }

    // Clicking an already-selected box keeps the existing multi-selection (so a drag moves all).
    // Clicking an unselected box replaces the selection with this one.
    const state = useWhiteboardStore.getState();
    if (!state.selectedBoxIds.includes(boxId)) {
      selectBoxes([boxId]);
    }
    return true;
  };

  const onTextBoxPointerDown = (e: React.PointerEvent) => {
    beginBoxInteraction(e);
  };

  const onImageBoxPointerDown = (e: React.PointerEvent) => {
    if (!beginBoxInteraction(e)) return;
    startMove(e);
  };

  const onTextHeaderPointerDown = (e: React.PointerEvent) => {
    if (!beginBoxInteraction(e)) return;
    startMove(e);
  };

  // Editor only mounts when this is the only selected text box (multi-selection should not trap caret).
  const useEditor =
    box.kind === "text" && isPrimary && selectionSize === 1 && isBoxInteractionTool(tool);
  const imageUrl = box.kind === "image" ? getAssetUrl(box.assetId) : null;
  const imageLabel = box.kind === "image" && box.label?.trim() ? box.label.trim() : null;
  const isImageLinkSource = box.kind === "image" && tool === "link" && linkSourceId === boxId;

  const layout = liveLayout ?? {
    x: box.x,
    y: box.y,
    w: box.width,
    h: box.height,
  };

  return (
    <div
      className={`wb-box absolute flex shrink-0 flex-col overflow-hidden shadow-sm ${
        box.kind === "image" && isBoxInteractionTool(tool) ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      } ${
        isSelected ? `shadow-lg ring-2 ${isPrimary ? "ring-violet-500" : "ring-violet-400/70"}` : ""
      }`}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
        zIndex: box.zIndex,
        borderRadius: box.style.borderRadius,
        background: box.style.fill,
        border: `2px solid ${box.style.stroke}`,
      }}
      onPointerDown={box.kind === "image" ? onImageBoxPointerDown : onTextBoxPointerDown}
    >
      {box.kind === "text" ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-black/10 bg-white/45 px-2 py-1 select-none active:cursor-grabbing"
          onPointerDown={onTextHeaderPointerDown}
          title="Drag to move"
          style={{ cursor: "grab" }}
        >
          <span className="truncate text-[0.7rem] font-semibold tracking-[0.04em] text-slate-700/65">
            {box.label?.trim() ? box.label.trim() : "\u00A0"}
          </span>
          {tool === "link" && linkSourceId === boxId ? (
            <span className="text-xs font-medium text-violet-700">Link from...</span>
          ) : null}
        </div>
      ) : null}
      <div
        className={`min-h-0 min-w-0 flex-1 ${box.kind === "image" ? "overflow-hidden" : "overflow-auto px-2 py-1.5"}`}
      >
        {box.kind === "image" ? (
          <div className="relative h-full w-full">
            {imageUrl ? (
              <img
                className="h-full w-full select-none object-contain"
                src={imageUrl}
                alt={box.alt ?? box.label ?? ""}
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-600">
                Image asset unavailable
              </div>
            )}
            {imageLabel || isImageLinkSource ? (
              <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap gap-1">
                {imageLabel ? (
                  <span className="max-w-full truncate rounded bg-white/85 px-2 py-0.5 text-[0.7rem] font-semibold tracking-[0.04em] text-slate-700 shadow-sm backdrop-blur-sm">
                    {imageLabel}
                  </span>
                ) : null}
                {isImageLinkSource ? (
                  <span className="rounded bg-violet-600/90 px-2 py-0.5 text-[0.7rem] font-medium text-white shadow-sm">
                    Link from...
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {useEditor ? (
              <ProseMirrorBoxEditor
                boxId={boxId}
                content={box.content}
                editable
                textColor={box.style.textColor}
                onChange={onContentChange}
              />
            ) : (
              <BoxPreview content={box.content} textColor={box.style.textColor} />
            )}
          </>
        )}
      </div>
      {isPrimary && isBoxInteractionTool(tool) ? (
        <button
          type="button"
          className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-0 bg-transparent p-0"
          aria-label="Resize"
          style={{
            backgroundImage:
              "linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.25) 50%)",
          }}
          onPointerDown={startResize}
        />
      ) : null}
    </div>
  );
});
