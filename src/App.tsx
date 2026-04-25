import { useEffect } from "react";
import { EditorRegistryProvider } from "./context/EditorRegistryContext";
import { MultiDragProvider } from "./context/MultiDragContext";
import { BoardView } from "./components/BoardView";
import { DevPerfOverlay } from "./components/DevPerfOverlay";
import { Toolbar } from "./components/toolbar/Toolbar";
import { parseBoxClipboardPayload } from "./model/boxClipboard";
import { getBoardDocumentTitle } from "./model/boardFileName";
import { registerImageBlob } from "./persistence/assetStore";
import { getViewportCenterTopLeft } from "./model/viewportCenter";
import { useWhiteboardStore } from "./store/whiteboardStore";
import "./App.css";

function isTypingInRichTextOrForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".ProseMirror")) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

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

export default function App() {
  const boardFileName = useWhiteboardStore((s) => s.boardFileName);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const state = useWhiteboardStore.getState();

      // Ctrl/Cmd+D duplicates the selected boxes regardless of focus (pre-empts in-editor handling).
      if (mod && e.key.toLowerCase() === "d" && state.selectedBoxIds.length > 0) {
        e.preventDefault();
        state.duplicateSelectedBoxes();
        return;
      }

      if (isTypingInRichTextOrForm(e.target)) return;

      if (e.key === "Escape" && state.tool === "link") {
        state.cancelLink();
        return;
      }

      if (e.key === "Escape" && state.selectedBoxIds.length > 0) {
        e.preventDefault();
        state.clearBoxSelection();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedLinkId) {
        e.preventDefault();
        state.deleteSelectedLink();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedBoxIds.length > 0) {
        e.preventDefault();
        state.deleteSelectedBoxes();
        return;
      }

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        state.selectAllBoxes();
        return;
      }

      if (mod && e.key.toLowerCase() === "c" && state.selectedBoxIds.length > 0) {
        e.preventDefault();
        void state.copySelectedBoxes();
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingInRichTextOrForm(e.target)) return;
      const imageFile = getClipboardImageFile(e.clipboardData);
      if (imageFile) {
        e.preventDefault();
        void (async () => {
          try {
            const asset = await registerImageBlob(imageFile);
            const s = useWhiteboardStore.getState();
            const { x, y } = getViewportCenterTopLeft(s.viewport, s.viewportSize, {
              width: Math.min(360, asset.width),
              height: Math.min(240, asset.height),
            });
            useWhiteboardStore.getState().addImageBox(asset, x, y);
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Unable to paste image.");
          }
        })();
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      const parsed = parseBoxClipboardPayload(text);
      if (!parsed) return;
      e.preventDefault();
      useWhiteboardStore.getState().ingestPastedBoxes(parsed);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste, true);
    };
  }, []);

  useEffect(() => {
    document.title = getBoardDocumentTitle(boardFileName);
  }, [boardFileName]);

  return (
    <EditorRegistryProvider>
      <MultiDragProvider>
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <Toolbar />
            <main className="relative min-h-0 flex-1">
              <BoardView />
              <DevPerfOverlay />
            </main>
          </div>
        </div>
      </MultiDragProvider>
    </EditorRegistryProvider>
  );
}
