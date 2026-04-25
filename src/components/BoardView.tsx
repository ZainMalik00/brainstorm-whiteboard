import { Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWhiteboardStore } from "../store/whiteboardStore";
import { BoardTransformProvider } from "../context/BoardTransformContext";
import { Box } from "./Box";
import { LinkLayer } from "./LinkLayer";
import { linkMidpointWorld } from "../model/linkMidpoint";
import { computeLinkRouting } from "../model/linkRouting";
import type { Box as BoxType, Viewport } from "../model/types";
import {
  buildViewportFromTwoTouchGesture,
  type LocalTouchPoint,
} from "../model/viewportGesture";

const WHEEL_COMMIT_MS = 140;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 3.5;
const CULL_MARGIN = 120;
/** Below this distance (screen px), pointerup on canvas counts as a click (deselect), not a pan/marquee. */
const PAN_CLICK_THRESHOLD = 5;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function isCanvasPanTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".wb-box")) return false;
  if (target.closest(".link-path-hit")) return false;
  if (target.closest(".link-delete-floater")) return false;
  return true;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x + a.width >= b.x &&
    a.x <= b.x + b.width &&
    a.y + a.height >= b.y &&
    a.y <= b.y + b.height
  );
}

type ScreenTouchPoint = {
  clientX: number;
  clientY: number;
};

type TouchGestureState = {
  pointerIds: [number, number];
  startTouches: [LocalTouchPoint, LocalTouchPoint];
  startViewport: Viewport;
};

type CanvasGestureKind = "pan" | "marquee";

type CanvasGestureState = {
  kind: CanvasGestureKind;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  /** Only meaningful for `pan`. */
  startPanX: number;
  startPanY: number;
  startZoom: number;
  /** Only meaningful for `marquee` — captured at gesture start. */
  startWorldX: number;
  startWorldY: number;
  /** Only meaningful for `marquee` — capture mode (replace vs. additive). */
  additive: boolean;
  /** Snapshot of selection at gesture start, used as the base for additive selection. */
  baseSelection: string[];
  maxDist: number;
};

type MarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getTrackedTouchPoints(
  pointsByPointerId: Map<number, ScreenTouchPoint>,
  [pointerIdA, pointerIdB]: readonly [number, number],
): [ScreenTouchPoint, ScreenTouchPoint] | null {
  const touchA = pointsByPointerId.get(pointerIdA);
  const touchB = pointsByPointerId.get(pointerIdB);
  if (!touchA || !touchB) return null;
  return [touchA, touchB];
}

function getTrackedTouchPair(
  pointsByPointerId: Map<number, ScreenTouchPoint>,
): [number, number] | null {
  if (pointsByPointerId.size !== 2) return null;
  const pointerIds = Array.from(pointsByPointerId.keys());
  return [pointerIds[0]!, pointerIds[1]!];
}

function toLocalTouchPoint(point: ScreenTouchPoint, rect: DOMRect): LocalTouchPoint {
  return {
    x: point.clientX - rect.left,
    y: point.clientY - rect.top,
  };
}

export const BoardView = memo(function BoardView() {
  const viewport = useWhiteboardStore((s) => s.viewport);
  const setViewport = useWhiteboardStore((s) => s.setViewport);
  const setViewportSize = useWhiteboardStore((s) => s.setViewportSize);
  const boxesById = useWhiteboardStore((s) => s.boxesById);
  const links = useWhiteboardStore((s) => s.links);
  const tool = useWhiteboardStore((s) => s.tool);
  const selectedLinkId = useWhiteboardStore((s) => s.selectedLinkId);
  const selectBoxes = useWhiteboardStore((s) => s.selectBoxes);
  const addBoxesToSelection = useWhiteboardStore((s) => s.addBoxesToSelection);
  const clearBoxSelection = useWhiteboardStore((s) => s.clearBoxSelection);
  const selectLink = useWhiteboardStore((s) => s.selectLink);
  const deleteSelectedLink = useWhiteboardStore((s) => s.deleteSelectedLink);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [liveViewport, setLiveViewport] = useState<Viewport | null>(null);
  const [canvasGestureKind, setCanvasGestureKind] = useState<CanvasGestureKind | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewportRefStore = useRef(viewport);
  viewportRefStore.current = viewport;

  const toolRef = useRef(tool);
  toolRef.current = tool;

  const isSpaceHeldRef = useRef(isSpaceHeld);
  isSpaceHeldRef.current = isSpaceHeld;

  const boxesByIdRef = useRef(boxesById);
  boxesByIdRef.current = boxesById;

  const viewportTouchGestureActiveRef = useRef(false);

  const v = liveViewport ?? viewport;
  const liveViewportRef = useRef(v);
  liveViewportRef.current = v;

  const touchPointsRef = useRef(new Map<number, ScreenTouchPoint>());
  const touchGestureRef = useRef<TouchGestureState | null>(null);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return { x: 0, y: 0 };
      const currentViewport = liveViewportRef.current;
      const r = el.getBoundingClientRect();
      const lx = clientX - r.left;
      const ly = clientY - r.top;
      return {
        x: (lx - currentViewport.panX) / currentViewport.zoom,
        y: (ly - currentViewport.panY) / currentViewport.zoom,
      };
    },
    [],
  );

  const transformCtx = useMemo(
    () => ({
      clientToWorld,
      isViewportTouchGestureActive: () => viewportTouchGestureActiveRef.current,
    }),
    [clientToWorld],
  );

  const gestureRef = useRef<CanvasGestureState | null>(null);

  const commitViewport = useCallback(
    (next: Viewport) => {
      setViewport(next);
      setLiveViewport(null);
    },
    [setViewport],
  );

  const clearWheelCommit = useCallback(() => {
    if (!wheelTimerRef.current) return;
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
  }, []);

  const startTouchGesture = useCallback(
    (): boolean => {
      const el = viewportRef.current;
      if (!el) return false;

      const pointerIds = getTrackedTouchPair(touchPointsRef.current);
      if (!pointerIds) return false;

      const trackedTouches = getTrackedTouchPoints(touchPointsRef.current, pointerIds);
      if (!trackedTouches) return false;

      clearWheelCommit();

      const rect = el.getBoundingClientRect();
      touchGestureRef.current = {
        pointerIds,
        startTouches: [
          toLocalTouchPoint(trackedTouches[0], rect),
          toLocalTouchPoint(trackedTouches[1], rect),
        ],
        startViewport: liveViewportRef.current,
      };
      viewportTouchGestureActiveRef.current = true;
      return true;
    },
    [clearWheelCommit],
  );

  const endTouchGesture = useCallback(
    (commit = true) => {
      if (!touchGestureRef.current) return;
      touchGestureRef.current = null;
      viewportTouchGestureActiveRef.current = false;
      if (commit) {
        commitViewport(liveViewportRef.current);
      }
    },
    [commitViewport],
  );

  const updateTouchGestureViewport = useCallback(() => {
    const el = viewportRef.current;
    const gesture = touchGestureRef.current;
    if (!el || !gesture) return;

    const trackedTouches = getTrackedTouchPoints(touchPointsRef.current, gesture.pointerIds);
    if (!trackedTouches) return;

    const rect = el.getBoundingClientRect();
    const next = buildViewportFromTwoTouchGesture({
      startViewport: gesture.startViewport,
      startTouches: gesture.startTouches,
      currentTouches: [
        toLocalTouchPoint(trackedTouches[0], rect),
        toLocalTouchPoint(trackedTouches[1], rect),
      ],
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
    });
    setLiveViewport(next);
  }, []);

  const cancelCanvasGesture = useCallback(() => {
    const d = gestureRef.current;
    if (!d) return;
    const el = viewportRef.current;
    gestureRef.current = null;
    setCanvasGestureKind(null);
    setMarqueeRect(null);
    if (el) {
      try {
        el.releasePointerCapture(d.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const scheduleWheelCommit = useCallback(
    (next: Viewport) => {
      setLiveViewport(next);
      clearWheelCommit();
      wheelTimerRef.current = setTimeout(() => {
        wheelTimerRef.current = null;
        commitViewport(next);
      }, WHEEL_COMMIT_MS);
    },
    [clearWheelCommit, commitViewport],
  );

  useEffect(
    () => () => {
      clearWheelCommit();
      gestureRef.current = null;
      touchPointsRef.current.clear();
      touchGestureRef.current = null;
      viewportTouchGestureActiveRef.current = false;
    },
    [clearWheelCommit],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.closest(".ProseMirror")) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (e.repeat) return;
      e.preventDefault();
      setIsSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setIsSpaceHeld(false);
    };
    const onBlur = () => setIsSpaceHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewportSize]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const cur = liveViewport ?? viewportRefStore.current;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nz = clamp(cur.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const worldX = (lx - cur.panX) / cur.zoom;
      const worldY = (ly - cur.panY) / cur.zoom;
      const next: Viewport = {
        panX: lx - worldX * nz,
        panY: ly - worldY * nz,
        zoom: nz,
      };
      scheduleWheelCommit(next);
    },
    [liveViewport, scheduleWheelCommit],
  );

  const onViewportPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") return;
      touchPointsRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (!touchGestureRef.current && startTouchGesture()) {
        cancelCanvasGesture();
        updateTouchGestureViewport();
      }
    },
    [cancelCanvasGesture, startTouchGesture, updateTouchGestureViewport],
  );

  const onViewportPointerMoveCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") return;
      if (!touchPointsRef.current.has(e.pointerId)) return;
      touchPointsRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      const gesture = touchGestureRef.current;
      if (!gesture) return;
      if (e.pointerId !== gesture.pointerIds[0] && e.pointerId !== gesture.pointerIds[1]) return;
      updateTouchGestureViewport();
    },
    [updateTouchGestureViewport],
  );

  const onViewportPointerUpCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") return;
      if (!touchPointsRef.current.has(e.pointerId) && !touchGestureRef.current) return;
      touchPointsRef.current.delete(e.pointerId);
      const gesture = touchGestureRef.current;
      if (!gesture) return;
      if (e.pointerId !== gesture.pointerIds[0] && e.pointerId !== gesture.pointerIds[1]) return;
      endTouchGesture();
    },
    [endTouchGesture],
  );

  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (!isCanvasPanTarget(e.target)) return;
    if (touchGestureRef.current) return;

    const isTouch = e.pointerType === "touch";
    const isLeft = e.button === 0;
    const isMiddle = e.button === 1;
    if (!isLeft && !isMiddle && !isTouch) return;

    // Selection of mode:
    // - touch / middle-button / Space-held: pan
    // - marquee tool + left-button: marquee (additive when shift)
    // - select & link tools + left-button: pan (existing behavior)
    let kind: CanvasGestureKind;
    if (isTouch || isMiddle || isSpaceHeldRef.current) {
      kind = "pan";
    } else if (toolRef.current === "marquee") {
      kind = "marquee";
    } else {
      kind = "pan";
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setCanvasGestureKind(kind);
    const base = liveViewport ?? viewportRefStore.current;

    if (kind === "marquee") {
      e.preventDefault();
      const w = clientToWorld(e.clientX, e.clientY);
      const baseSelection = e.shiftKey
        ? [...useWhiteboardStore.getState().selectedBoxIds]
        : [];
      gestureRef.current = {
        kind,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: base.panX,
        startPanY: base.panY,
        startZoom: base.zoom,
        startWorldX: w.x,
        startWorldY: w.y,
        additive: e.shiftKey,
        baseSelection,
        maxDist: 0,
      };
      setMarqueeRect({ x: w.x, y: w.y, width: 0, height: 0 });
      return;
    }

    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: base.panX,
      startPanY: base.panY,
      startZoom: base.zoom,
      startWorldX: 0,
      startWorldY: 0,
      additive: false,
      baseSelection: [],
      maxDist: 0,
    };
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    const d = gestureRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    d.maxDist = Math.max(d.maxDist, Math.hypot(dx, dy));

    if (d.kind === "pan") {
      setLiveViewport({
        panX: d.startPanX + dx,
        panY: d.startPanY + dy,
        zoom: d.startZoom,
      });
      return;
    }

    // marquee: compute world rect from start to current
    const w = clientToWorld(e.clientX, e.clientY);
    const x = Math.min(d.startWorldX, w.x);
    const y = Math.min(d.startWorldY, w.y);
    const width = Math.abs(w.x - d.startWorldX);
    const height = Math.abs(w.y - d.startWorldY);
    setMarqueeRect({ x, y, width, height });
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    const d = gestureRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    gestureRef.current = null;
    setCanvasGestureKind(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (d.kind === "pan") {
      const next: Viewport = {
        panX: d.startPanX + (e.clientX - d.startClientX),
        panY: d.startPanY + (e.clientY - d.startClientY),
        zoom: d.startZoom,
      };
      commitViewport(next);
      if (toolRef.current === "select" && d.maxDist < PAN_CLICK_THRESHOLD) {
        clearBoxSelection();
        selectLink(null);
      }
      return;
    }

    // marquee end
    setMarqueeRect(null);
    if (d.maxDist < PAN_CLICK_THRESHOLD) {
      // Treat as a click on empty canvas: clear (or keep additive base unchanged).
      if (!d.additive) {
        clearBoxSelection();
        selectLink(null);
      }
      return;
    }

    const wEnd = clientToWorld(e.clientX, e.clientY);
    const rect = {
      x: Math.min(d.startWorldX, wEnd.x),
      y: Math.min(d.startWorldY, wEnd.y),
      width: Math.abs(wEnd.x - d.startWorldX),
      height: Math.abs(wEnd.y - d.startWorldY),
    };
    const hits: string[] = [];
    for (const box of Object.values(boxesByIdRef.current) as BoxType[]) {
      if (rectsOverlap(rect, box)) hits.push(box.id);
    }
    if (d.additive) {
      const merged = uniqueIds([...d.baseSelection, ...hits]);
      selectBoxes(merged);
      // selectBoxes filters by existence — additive needs to keep prior ones too.
      // Use addBoxesToSelection for safety against ordering quirks: but selectBoxes already replaces.
      // Use merged via selectBoxes (already includes base + hits in order).
      void addBoxesToSelection; // reference kept available; not needed when using merged.
    } else {
      selectBoxes(hits);
    }
    selectLink(null);
  };

  const sortedIds = useMemo(
    () =>
      Object.values(boxesById)
        .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
        .map((b) => b.id),
    [boxesById],
  );

  const linkRouting = useMemo(
    () => computeLinkRouting(links, boxesById),
    [links, boxesById],
  );

  const linkFloaterWorld = useMemo(() => {
    if (!selectedLinkId) return null;
    const link = links.find((l) => l.id === selectedLinkId);
    if (!link) return null;
    const routed = linkRouting.get(selectedLinkId);
    if (!routed) return null;
    return linkMidpointWorld(link, routed);
  }, [selectedLinkId, links, linkRouting]);

  const visibleIds = useMemo(() => {
    const el = viewportRef.current;
    if (!el || sortedIds.length === 0) return sortedIds;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const wx0 = (-v.panX) / v.zoom - CULL_MARGIN;
    const wy0 = (-v.panY) / v.zoom - CULL_MARGIN;
    const wx1 = (w - v.panX) / v.zoom + CULL_MARGIN;
    const wy1 = (h - v.panY) / v.zoom + CULL_MARGIN;
    return sortedIds.filter((id) => {
      const b = boxesById[id];
      if (!b) return false;
      return (
        b.x + b.width >= wx0 &&
        b.x <= wx1 &&
        b.y + b.height >= wy0 &&
        b.y <= wy1
      );
    });
  }, [sortedIds, boxesById, v.panX, v.panY, v.zoom]);

  const cursorClass =
    canvasGestureKind === "pan"
      ? "cursor-grabbing"
      : canvasGestureKind === "marquee"
        ? "cursor-crosshair"
        : isSpaceHeld
          ? "cursor-grab"
          : tool === "marquee"
            ? "cursor-crosshair"
            : tool === "select"
              ? "cursor-default"
              : "cursor-grab";

  return (
    <div
      ref={viewportRef}
      className={`absolute inset-0 overflow-hidden bg-[#ececf2] ${cursorClass}`}
      style={{
        backgroundImage:
          "linear-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.04) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        overscrollBehavior: "none",
        touchAction: "none",
      }}
      onPointerDownCapture={onViewportPointerDownCapture}
      onPointerMoveCapture={onViewportPointerMoveCapture}
      onPointerUpCapture={onViewportPointerUpCapture}
      onPointerCancelCapture={onViewportPointerUpCapture}
      onWheel={onWheel}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
      onPointerCancel={onViewportPointerUp}
      onContextMenu={(e) => {
        // Prevent middle-click paste/context surprises during pan.
        if (canvasGestureKind === "pan") e.preventDefault();
      }}
    >
      <BoardTransformProvider value={transformCtx}>
        <div
          className="absolute left-0 top-0 min-h-[3000px] min-w-[4000px] will-change-transform"
          style={{
            transformOrigin: "0 0",
            transform: `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`,
          }}
        >
          {visibleIds.map((id) => (
            <Box key={id} boxId={id} />
          ))}
          <LinkLayer
            links={links}
            boxesById={boxesById}
            selectedLinkId={selectedLinkId}
            onSelectLink={selectLink}
          />
          {marqueeRect && marqueeRect.width > 0 && marqueeRect.height > 0 ? (
            <div
              className="pointer-events-none absolute border-2 border-violet-500/70 bg-violet-500/10"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          ) : null}
        </div>
      </BoardTransformProvider>
      {linkFloaterWorld ? (
        <div
          className="link-delete-floater absolute z-[10001] pointer-events-none"
          style={{
            transform: "translate(-50%, calc(-100% - 10px))",
            left: v.panX + linkFloaterWorld.x * v.zoom,
            top: v.panY + linkFloaterWorld.y * v.zoom,
          }}
        >
          <button
            type="button"
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-700 shadow-lg transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
            aria-label="Delete link"
            title="Delete link"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              deleteSelectedLink();
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
});

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
