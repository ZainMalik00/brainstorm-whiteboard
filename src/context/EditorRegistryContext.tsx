/* eslint-disable react-refresh/only-export-components -- hook + provider module */
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { EditorView } from "prosemirror-view";
import type { ProseMirrorDocJSON } from "../model/types";
import { useWhiteboardStore } from "../store/whiteboardStore";

type Registry = Map<string, EditorView>;
type Listener = () => void;

type Ctx = {
  register: (id: string, view: EditorView) => void;
  unregister: (id: string) => void;
  getView: (id: string | null) => EditorView | null;
  subscribe: (listener: Listener) => () => void;
  notifyViewsChanged: () => void;
  flushAllEditorsToStore: () => void;
};

const EditorRegistryContext = createContext<Ctx | null>(null);

export function EditorRegistryProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<Registry>(new Map());
  const listenersRef = useRef<Set<Listener>>(new Set());

  const notifyViewsChanged = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const register = useCallback((id: string, view: EditorView) => {
    mapRef.current.set(id, view);
    notifyViewsChanged();
  }, [notifyViewsChanged]);

  const unregister = useCallback((id: string) => {
    mapRef.current.delete(id);
    notifyViewsChanged();
  }, [notifyViewsChanged]);

  const getView = useCallback((id: string | null) => {
    if (!id) return null;
    return mapRef.current.get(id) ?? null;
  }, []);

  const flushAllEditorsToStore = useCallback(() => {
    const { updateBoxContent, boxesById } = useWhiteboardStore.getState();
    for (const [id, view] of mapRef.current) {
      const box = boxesById[id];
      if (box?.kind === "text") {
        updateBoxContent(id, view.state.doc.toJSON() as ProseMirrorDocJSON);
      }
    }
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const value = useMemo(
    () => ({ register, unregister, getView, subscribe, notifyViewsChanged, flushAllEditorsToStore }),
    [register, unregister, getView, subscribe, notifyViewsChanged, flushAllEditorsToStore],
  );

  return (
    <EditorRegistryContext.Provider value={value}>{children}</EditorRegistryContext.Provider>
  );
}

export function useEditorRegistry(): Ctx {
  const c = useContext(EditorRegistryContext);
  if (!c) throw new Error("useEditorRegistry outside provider");
  return c;
}
