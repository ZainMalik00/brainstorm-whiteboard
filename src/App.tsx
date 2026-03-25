import { useEffect } from "react";
import { EditorRegistryProvider } from "./context/EditorRegistryContext";
import { BoardView } from "./components/BoardView";
import { DevPerfOverlay } from "./components/DevPerfOverlay";
import { Toolbar } from "./components/Toolbar";
import { parseBoxClipboard } from "./model/boxClipboard";
import { getBoardDocumentTitle } from "./model/boardFileName";
import { registerImageBlob } from "./persistence/assetStore";
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
      if (isTypingInRichTextOrForm(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const state = useWhiteboardStore.getState();

      if (e.key === "Escape" && state.tool === "link") {
        state.cancelLink();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedLinkId) {
        e.preventDefault();
        state.deleteSelectedLink();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedBoxId) {
        e.preventDefault();
        state.deleteSelectedBox();
        return;
      }

      if (mod && e.key.toLowerCase() === "c" && state.selectedBoxId) {
        e.preventDefault();
        void state.copySelectedBox();
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
            useWhiteboardStore.getState().addImageBox(asset, 320, 240);
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Unable to paste image.");
          }
        })();
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      const payload = parseBoxClipboard(text);
      if (!payload) return;
      e.preventDefault();
      useWhiteboardStore.getState().ingestPastedBox(payload);
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
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <Toolbar />
          <main className="relative min-h-0 flex-1">
            <BoardView />
            <DevPerfOverlay />
          </main>
        </div>
      </div>
    </EditorRegistryProvider>
  );
}
