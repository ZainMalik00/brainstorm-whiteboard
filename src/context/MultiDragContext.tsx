/* eslint-disable react-refresh/only-export-components -- hook + provider module */
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

export type DragOffset = { dx: number; dy: number };

type Listener = (offset: DragOffset | null) => void;

type Ctx = {
  /** Begin a multi-drag involving these box ids. Single-id drags can skip this and use local state. */
  begin: (ids: readonly string[]) => void;
  /** Update the live offset (in world units) shared across all participating boxes. */
  update: (offset: DragOffset) => void;
  /** End the multi-drag; subscribers receive `null` to clear their override. */
  end: () => void;
  /**
   * Subscribe to live offset updates while `boxId` is part of the active drag.
   * Returns an unsubscribe function. Listener is called with `null` when the drag ends.
   */
  subscribe: (boxId: string, listener: Listener) => () => void;
  /** Read the current participants (used by Box's pointer-down to decide single vs. multi). */
  getParticipants: () => Set<string>;
};

const MultiDragContext = createContext<Ctx | null>(null);

export function MultiDragProvider({ children }: { children: ReactNode }) {
  const participantsRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const lastOffsetRef = useRef<DragOffset>({ dx: 0, dy: 0 });

  const begin = useCallback((ids: readonly string[]) => {
    participantsRef.current = new Set(ids);
    lastOffsetRef.current = { dx: 0, dy: 0 };
  }, []);

  const update = useCallback((offset: DragOffset) => {
    lastOffsetRef.current = offset;
    for (const id of participantsRef.current) {
      const set = listenersRef.current.get(id);
      if (!set) continue;
      for (const l of set) l(offset);
    }
  }, []);

  const end = useCallback(() => {
    const ids = Array.from(participantsRef.current);
    participantsRef.current = new Set();
    lastOffsetRef.current = { dx: 0, dy: 0 };
    for (const id of ids) {
      const set = listenersRef.current.get(id);
      if (!set) continue;
      for (const l of set) l(null);
    }
  }, []);

  const subscribe = useCallback((boxId: string, listener: Listener) => {
    let set = listenersRef.current.get(boxId);
    if (!set) {
      set = new Set();
      listenersRef.current.set(boxId, set);
    }
    set.add(listener);
    return () => {
      const s = listenersRef.current.get(boxId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) listenersRef.current.delete(boxId);
    };
  }, []);

  const getParticipants = useCallback(() => participantsRef.current, []);

  const value = useMemo(
    () => ({ begin, update, end, subscribe, getParticipants }),
    [begin, update, end, subscribe, getParticipants],
  );

  return <MultiDragContext.Provider value={value}>{children}</MultiDragContext.Provider>;
}

export function useMultiDrag(): Ctx {
  const c = useContext(MultiDragContext);
  if (!c) throw new Error("useMultiDrag outside provider");
  return c;
}
