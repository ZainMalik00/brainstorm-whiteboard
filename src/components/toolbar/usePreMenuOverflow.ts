import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { BoardTool } from "../../store/whiteboardStore";

const PRIMARY_ROW_OVERFLOW_EPS = 1;

/**
 * Progressive overflow: while the primary row overflows, bump count so items evacuate from the right.
 * Matches previous Toolbar behavior (ResizeObserver + layout loop).
 */
export function usePreMenuOverflow({
  isLgViewport,
  preMenuSlotCount,
  primaryRowRef,
  tool,
}: {
  isLgViewport: boolean;
  preMenuSlotCount: number;
  primaryRowRef: RefObject<HTMLDivElement | null>;
  /** Toolbar switches layout width (select vs link active states). */
  tool: BoardTool;
}) {
  const [preMenuOverflowCount, setPreMenuOverflowCount] = useState(0);
  const [primaryRowResizeSignal, setPrimaryRowResizeSignal] = useState(0);
  const primaryRowWidthRef = useRef(0);
  const lastResizeWidthRef = useRef<number | null>(null);

  useEffect(() => {
    setPreMenuOverflowCount(0);
  }, [preMenuSlotCount]);

  useEffect(() => {
    if (isLgViewport) setPreMenuOverflowCount(0);
  }, [isLgViewport]);

  useEffect(() => {
    if (isLgViewport) return;
    primaryRowWidthRef.current = 0;
    lastResizeWidthRef.current = null;
    const el = primaryRowRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const prev = primaryRowWidthRef.current;
      if (prev > 0 && w > prev + 0.5) {
        setPreMenuOverflowCount(0);
      }
      primaryRowWidthRef.current = w;

      const quantized = Math.round(w * 1000) / 1000;
      if (lastResizeWidthRef.current !== quantized) {
        lastResizeWidthRef.current = quantized;
        setPrimaryRowResizeSignal((n) => n + 1);
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isLgViewport, primaryRowRef]);

  useLayoutEffect(() => {
    if (isLgViewport) return;
    const el = primaryRowRef.current;
    if (!el) return;
    const overflowed = el.scrollWidth > el.clientWidth + PRIMARY_ROW_OVERFLOW_EPS;
    if (overflowed && preMenuOverflowCount < preMenuSlotCount) {
      setPreMenuOverflowCount((c) => c + 1);
    }
  }, [isLgViewport, preMenuOverflowCount, preMenuSlotCount, primaryRowRef, primaryRowResizeSignal, tool]);

  return { preMenuOverflowCount };
}
