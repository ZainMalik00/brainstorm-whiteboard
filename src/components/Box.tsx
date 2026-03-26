import { memo, useCallback, useRef, useState } from "react";
import { getAssetUrl } from "../persistence/assetStore";
import { useWhiteboardStore } from "../store/whiteboardStore";
import { useBoardTransform } from "../context/BoardTransformContext";
import { BoxPreview } from "./BoxPreview";
import { ProseMirrorBoxEditor } from "./ProseMirrorBoxEditor";
import type { Box as BoxType, ProseMirrorDocJSON } from "../model/types";

type Props = { boxId: string };

const MIN_W = 120;
const MIN_H = 80;

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
};

export const Box = memo(function Box({ boxId }: Props) {
  const box = useWhiteboardStore((s) => s.boxesById[boxId]) as BoxType | undefined;
  const tool = useWhiteboardStore((s) => s.tool);
  const selectedBoxId = useWhiteboardStore((s) => s.selectedBoxId);
  const linkSourceId = useWhiteboardStore((s) => s.linkSourceId);

  const selectBox = useWhiteboardStore((s) => s.selectBox);
  const setLinkSource = useWhiteboardStore((s) => s.setLinkSource);
  const tryCompleteLink = useWhiteboardStore((s) => s.tryCompleteLink);
  const updateBoxContent = useWhiteboardStore((s) => s.updateBoxContent);
  const commitBoxPosition = useWhiteboardStore((s) => s.commitBoxPosition);
  const commitBoxSize = useWhiteboardStore((s) => s.commitBoxSize);

  const { clientToWorld, isViewportTouchGestureActive } = useBoardTransform();

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
      if (d.curX !== d.startBoxX || d.curY !== d.startBoxY) {
        commitBoxPosition(boxId, d.curX, d.curY);
      }
    } else {
      const b = useWhiteboardStore.getState().boxesById[boxId];
      if (b && (d.curW !== d.startW || d.curH !== d.startH)) {
        commitBoxSize(boxId, b.x, b.y, d.curW, d.curH);
      }
    }
    setLiveLayout(null);
  }, [boxId, commitBoxPosition, commitBoxSize]);

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
    setLiveLayout(null);
  }, []);

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
    [cancelDrag, clientToWorld, isViewportTouchGestureActive, scheduleLayoutFlush],
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
      if (e.button !== 0 || tool !== "select") return;
      if (e.pointerType === "touch" && isViewportTouchGestureActive()) return;
      const b = useWhiteboardStore.getState().boxesById[boxId];
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      const captureTarget = e.currentTarget as HTMLElement;
      captureTarget.setPointerCapture(e.pointerId);
      const abortController = new AbortController();
      const w = clientToWorld(e.clientX, e.clientY);
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
      isViewportTouchGestureActive,
      onPointerMove,
      onPointerUp,
      tool,
    ],
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || tool !== "select" || selectedBoxId !== boxId) return;
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
      isViewportTouchGestureActive,
      onPointerMove,
      onPointerUp,
      selectedBoxId,
      tool,
    ],
  );

  if (!box) return null;

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
    selectBox(boxId);
    return true;
  };

  const onTextBoxPointerDown = (e: React.PointerEvent) => {
    beginBoxInteraction(e);
  };

  const onImageBoxPointerDown = (e: React.PointerEvent) => {
    if (!beginBoxInteraction(e)) return;
    startMove(e);
  };

  const isSelected = selectedBoxId === boxId;
  const useEditor = box.kind === "text" && isSelected && tool === "select";
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
        box.kind === "image" && tool === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      } ${
        isSelected ? "shadow-lg ring-2 ring-violet-500" : ""
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
          onPointerDown={startMove}
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
      {isSelected && tool === "select" ? (
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
