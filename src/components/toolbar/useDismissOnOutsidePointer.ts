import { useEffect, useRef, type RefObject } from "react";

type Params = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  excludeRefs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  onClose: () => void;
};

/** Closes when a pointer down happens outside `containerRef` (and outside any `excludeRefs`). */
export function useDismissOnOutsidePointer({ open, containerRef, excludeRefs, onClose }: Params) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const excludeRefsRef = useRef(excludeRefs);
  excludeRefsRef.current = excludeRefs;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t)) return;
      for (const r of excludeRefsRef.current ?? []) {
        if (r.current?.contains(t)) return;
      }
      onCloseRef.current();
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, containerRef]);
}

/** Calls `onClose` when Escape is pressed while `open`. */
export function useDismissOnEscape(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
