import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { buildLinkIdsByBoxId } from "../model/linkIndex";
import { fileFromRuntime, runtimeFromFile, type WhiteboardRuntime } from "../model/normalize";
import { parseWhiteboardFileJson, stringifyWhiteboardFile } from "../model/serialize";
import { clearAssetStore } from "../persistence/assetStore";
import type {
  Box,
  ImageAsset,
  LinkStyle,
  ProseMirrorDocJSON,
  Viewport,
  WhiteboardFile,
} from "../model/types";
import {
  serializeBoxForClipboard,
  type BoxClipboardPayload,
} from "../model/boxClipboard";
import {
  createBoxAt,
  createImageBoxAt,
  createEmptyRuntime,
  createEmptyWhiteboardFile,
} from "../model/whiteboardFactory";
import { getDefaultLinkStyle, getNamedPaletteColor, normalizePaletteHex, paletteHasHex } from "../model/palette";

const MAX_UNDO = 50;

export type BoardTool = "select" | "link";

type CoreSnapshot = Pick<
  WhiteboardRuntime,
  "viewport" | "palette" | "assetsById" | "boxesById" | "links"
>;

function snapshotCore(s: CoreSnapshot): string {
  return JSON.stringify({
    viewport: s.viewport,
    palette: s.palette,
    assetsById: s.assetsById,
    boxesById: s.boxesById,
    links: s.links,
  });
}

function parseCore(json: string): CoreSnapshot {
  return JSON.parse(json) as CoreSnapshot;
}

function maxZIndex(boxesById: Record<string, Box>): number {
  let m = 0;
  for (const b of Object.values(boxesById)) {
    if (b.zIndex > m) m = b.zIndex;
  }
  return m;
}

export interface WhiteboardState extends WhiteboardRuntime {
  selectedBoxId: string | null;
  selectedLinkId: string | null;
  tool: BoardTool;
  /** When tool === "link", first clicked box id */
  linkSourceId: string | null;
  boardFileName: string | null;
  past: string[];
  future: string[];
}

type WhiteboardActions = {
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  loadFromFileJson: (text: string, fileName?: string | null) => void;
  loadFromFileData: (file: WhiteboardFile, fileName?: string | null) => void;
  newBoard: () => void;
  exportFile: () => WhiteboardFile;
  exportFileJson: () => string;
  setBoardFileName: (fileName: string | null) => void;
  addBox: (x: number, y: number) => void;
  addImageBox: (asset: ImageAsset, x: number, y: number) => void;
  upsertAsset: (asset: ImageAsset) => void;
  deleteSelectedBox: () => void;
  deleteSelectedLink: () => void;
  selectBox: (id: string | null) => void;
  selectLink: (id: string | null) => void;
  setTool: (tool: BoardTool) => void;
  setLinkSource: (id: string | null) => void;
  tryCompleteLink: (toBoxId: string) => void;
  cancelLink: () => void;
  updateBoxContent: (id: string, content: ProseMirrorDocJSON) => void;
  commitBoxPosition: (id: string, x: number, y: number) => void;
  commitBoxSize: (id: string, x: number, y: number, width: number, height: number) => void;
  setViewport: (v: Viewport) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  updateBoxStyle: (id: string, style: Partial<Box["style"]>) => void;
  updateBoxLabel: (id: string, label: string | undefined) => void;
  addCustomColor: (hex: string) => void;
  setNamedColor: (key: string, hex: string) => void;
  removeNamedColor: (key: string) => void;
  updateCustomColor: (index: number, hex: string) => void;
  removeCustomColor: (index: number) => void;
  addLink: (fromBoxId: string, toBoxId: string) => void;
  updateLinkLabel: (id: string, label: string | undefined) => void;
  updateLinkStyle: (id: string, style: Partial<LinkStyle>) => void;
  copySelectedBox: () => Promise<boolean>;
  ingestPastedBox: (payload: BoxClipboardPayload) => void;
};

const initialRuntime = createEmptyRuntime();

const initialState: WhiteboardState = {
  ...initialRuntime,
  selectedBoxId: null,
  selectedLinkId: null,
  tool: "select",
  linkSourceId: null,
  boardFileName: null,
  past: [],
  future: [],
};

function applyCore(s: WhiteboardState, core: CoreSnapshot): void {
  s.viewport = core.viewport;
  s.palette = core.palette;
  s.assetsById = core.assetsById;
  s.boxesById = core.boxesById;
  s.links = core.links;
  s.linkIdsByBoxId = buildLinkIdsByBoxId(core.links);
}

export const useWhiteboardStore = create<WhiteboardState & WhiteboardActions>()(
  immer((set, get) => ({
    ...initialState,

    pushSnapshot: () =>
      set((s) => {
        const snap = snapshotCore(s);
        s.past.push(snap);
        if (s.past.length > MAX_UNDO) s.past.shift();
        s.future = [];
      }),

    undo: () =>
      set((s) => {
        if (s.past.length === 0) return;
        const current = snapshotCore(s);
        const prev = s.past.pop()!;
        s.future.unshift(current);
        applyCore(s, parseCore(prev));
        s.selectedBoxId = null;
        s.selectedLinkId = null;
        s.linkSourceId = null;
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return;
        const current = snapshotCore(s);
        const next = s.future.shift()!;
        s.past.push(current);
        applyCore(s, parseCore(next));
        s.selectedBoxId = null;
        s.selectedLinkId = null;
        s.linkSourceId = null;
      }),

    loadFromFileJson: (text: string, fileName = null) => {
      const file = parseWhiteboardFileJson(text);
      const rt = runtimeFromFile(file);
      clearAssetStore();
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxId = null;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = fileName?.trim() ? fileName.trim() : null;
        s.past = [];
        s.future = [];
      });
    },

    loadFromFileData: (file, fileName = null) => {
      const rt = runtimeFromFile(file);
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxId = null;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = fileName?.trim() ? fileName.trim() : null;
        s.past = [];
        s.future = [];
      });
    },

    newBoard: () => {
      const rt = createEmptyRuntime();
      clearAssetStore();
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxId = null;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = null;
        s.past = [];
        s.future = [];
      });
    },

    exportFile: () => {
      const s = get();
      return fileFromRuntime({
        viewport: s.viewport,
        palette: s.palette,
        assetsById: s.assetsById,
        boxesById: s.boxesById,
        links: s.links,
        linkIdsByBoxId: s.linkIdsByBoxId,
      });
    },

    exportFileJson: () => {
      return stringifyWhiteboardFile(get().exportFile());
    },

    setBoardFileName: (fileName) =>
      set((s) => {
        s.boardFileName = fileName?.trim() ? fileName.trim() : null;
      }),

    addBox: (x, y) => {
      get().pushSnapshot();
      set((s) => {
        const z = maxZIndex(s.boxesById) + 1;
        const box = createBoxAt(x, y, z, s.palette);
        s.boxesById[box.id] = box;
        s.selectedBoxId = box.id;
        s.selectedLinkId = null;
      });
    },

    addImageBox: (asset, x, y) => {
      get().pushSnapshot();
      set((s) => {
        s.assetsById[asset.id] = asset;
        const z = maxZIndex(s.boxesById) + 1;
        const box = createImageBoxAt(x, y, z, asset, s.palette);
        s.boxesById[box.id] = box;
        s.selectedBoxId = box.id;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
      });
    },

    upsertAsset: (asset) =>
      set((s) => {
        s.assetsById[asset.id] = asset;
      }),

    deleteSelectedBox: () => {
      get().pushSnapshot();
      set((s) => {
        const id = s.selectedBoxId;
        if (!id || !s.boxesById[id]) return;
        delete s.boxesById[id];
        s.links = s.links.filter((l) => l.fromBoxId !== id && l.toBoxId !== id);
        s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
        s.selectedBoxId = null;
      });
    },

    deleteSelectedLink: () => {
      get().pushSnapshot();
      set((s) => {
        const id = s.selectedLinkId;
        if (!id) return;
        s.links = s.links.filter((l) => l.id !== id);
        s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
        s.selectedLinkId = null;
      });
    },

    selectBox: (id) =>
      set((s) => {
        s.selectedBoxId = id;
        if (id) s.selectedLinkId = null;
      }),

    selectLink: (id) =>
      set((s) => {
        s.selectedLinkId = id;
        if (id) {
          s.selectedBoxId = null;
          s.linkSourceId = null;
        }
      }),

    setTool: (tool) =>
      set((s) => {
        s.tool = tool;
        if (tool === "link") {
          s.linkSourceId = s.selectedBoxId;
        } else {
          s.linkSourceId = null;
        }
      }),

    setLinkSource: (id) =>
      set((s) => {
        s.linkSourceId = id;
      }),

    tryCompleteLink: (toBoxId) => {
      const s0 = get();
      const from = s0.linkSourceId;
      if (!from || from === toBoxId) return;
      const exists = s0.links.some(
        (l) =>
          (l.fromBoxId === from && l.toBoxId === toBoxId) ||
          (l.fromBoxId === toBoxId && l.toBoxId === from),
      );
      if (exists) {
        set((s) => {
          s.linkSourceId = null;
        });
        return;
      }
      get().pushSnapshot();
      set((s) => {
        const id = crypto.randomUUID();
        s.links.push({
          id,
          fromBoxId: from,
          toBoxId,
          style: getDefaultLinkStyle(s.palette),
        });
        s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
        s.linkSourceId = null;
      });
    },

    cancelLink: () =>
      set((s) => {
        s.linkSourceId = null;
      }),

    updateBoxContent: (id, content) =>
      set((s) => {
        const b = s.boxesById[id];
        if (b?.kind === "text") b.content = content;
      }),

    commitBoxPosition: (id, x, y) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (b) {
          b.x = x;
          b.y = y;
        }
      });
    },

    commitBoxSize: (id, x, y, width, height) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (b) {
          b.x = x;
          b.y = y;
          b.width = Math.max(120, width);
          b.height = Math.max(80, height);
        }
      });
    },

    setViewport: (v) => {
      set((s) => {
        s.viewport = { ...v };
      });
    },

    bringToFront: (id) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (!b) return;
        b.zIndex = maxZIndex(s.boxesById) + 1;
      });
    },

    sendToBack: (id) => {
      get().pushSnapshot();
      set((s) => {
        const boxes = Object.values(s.boxesById);
        const minZ = Math.min(...boxes.map((x) => x.zIndex), 0);
        const b = s.boxesById[id];
        if (!b) return;
        b.zIndex = minZ - 1;
      });
    },

    bringForward: (id) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (!b) return;
        const above = Object.values(s.boxesById)
          .filter((x) => x.id !== id && x.zIndex >= b.zIndex)
          .sort((a, c) => a.zIndex - c.zIndex)[0];
        if (!above) return;
        const tmp = b.zIndex;
        b.zIndex = above.zIndex;
        above.zIndex = tmp;
      });
    },

    sendBackward: (id) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (!b) return;
        const below = Object.values(s.boxesById)
          .filter((x) => x.id !== id && x.zIndex <= b.zIndex)
          .sort((a, c) => c.zIndex - a.zIndex)[0];
        if (!below) return;
        const tmp = b.zIndex;
        b.zIndex = below.zIndex;
        below.zIndex = tmp;
      });
    },

    updateBoxStyle: (id, style) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (b) Object.assign(b.style, style);
      });
    },

    updateBoxLabel: (id, label) => {
      get().pushSnapshot();
      set((s) => {
        const b = s.boxesById[id];
        if (!b) return;
        if (label === undefined || label === "") {
          delete b.label;
        } else {
          b.label = label;
        }
      });
    },

    addCustomColor: (hex) => {
      const normalized = normalizePaletteHex(hex);
      if (!normalized) return;
      if (paletteHasHex(get().palette, normalized)) return;
      get().pushSnapshot();
      set((s) => {
        s.palette.custom.push(normalized);
      });
    },

    setNamedColor: (key, hex) => {
      const normalized = normalizePaletteHex(hex);
      if (!normalized) return;
      const state = get();
      if (!(key in state.palette.named)) return;
      if (normalizePaletteHex(state.palette.named[key]) === normalized) return;
      if (paletteHasHex(state.palette, normalized, { kind: "named", key })) return;
      state.pushSnapshot();
      set((s) => {
        if (!(key in s.palette.named)) return;
        s.palette.named[key] = normalized;
      });
    },

    removeNamedColor: (key) => {
      if (!(key in get().palette.named)) return;
      get().pushSnapshot();
      set((s) => {
        delete s.palette.named[key];
      });
    },

    updateCustomColor: (index, hex) => {
      const normalized = normalizePaletteHex(hex);
      if (!normalized) return;
      const state = get();
      if (!state.palette.custom[index]) return;
      if (normalizePaletteHex(state.palette.custom[index]) === normalized) return;
      if (paletteHasHex(state.palette, normalized, { kind: "custom", index })) return;
      state.pushSnapshot();
      set((s) => {
        if (!s.palette.custom[index]) return;
        s.palette.custom[index] = normalized;
      });
    },

    removeCustomColor: (index) => {
      if (!get().palette.custom[index]) return;
      get().pushSnapshot();
      set((s) => {
        if (!s.palette.custom[index]) return;
        s.palette.custom.splice(index, 1);
      });
    },

    addLink: (fromBoxId, toBoxId) => {
      get().pushSnapshot();
      set((s) => {
        if (fromBoxId === toBoxId) return;
        const exists = s.links.some(
          (l) =>
            (l.fromBoxId === fromBoxId && l.toBoxId === toBoxId) ||
            (l.fromBoxId === toBoxId && l.toBoxId === fromBoxId),
        );
        if (exists) return;
        s.links.push({
          id: crypto.randomUUID(),
          fromBoxId,
          toBoxId,
          style: getDefaultLinkStyle(s.palette),
        });
        s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
      });
    },

    updateLinkLabel: (id, label) => {
      get().pushSnapshot();
      set((s) => {
        const l = s.links.find((x) => x.id === id);
        if (!l) return;
        l.label = label;
        if (label && !l.labelStyle?.color) {
          l.labelStyle = {
            ...l.labelStyle,
            color: getNamedPaletteColor(s.palette, "text"),
          };
        }
      });
    },

    updateLinkStyle: (id, style) => {
      get().pushSnapshot();
      set((s) => {
        const l = s.links.find((x) => x.id === id);
        if (l) Object.assign(l.style, style);
      });
    },

    copySelectedBox: async () => {
      const s = get();
      const id = s.selectedBoxId;
      if (!id) return false;
      const b = s.boxesById[id];
      if (!b) return false;
      try {
        const asset = b.kind === "image" ? s.assetsById[b.assetId] : undefined;
        await navigator.clipboard.writeText(serializeBoxForClipboard(b, asset));
        return true;
      } catch {
        return false;
      }
    },

    ingestPastedBox: (payload) => {
      const OFFSET = 24;
      get().pushSnapshot();
      set((s) => {
        const newId = crypto.randomUUID();
        const z = maxZIndex(s.boxesById) + 1;
        const common = {
          id: newId,
          x: payload.x + OFFSET,
          y: payload.y + OFFSET,
          width: payload.width,
          height: payload.height,
          zIndex: z,
          style: {
            ...payload.style,
            ...(payload.kind === "text" && !payload.style.textColor
              ? { textColor: getNamedPaletteColor(s.palette, "text") }
              : {}),
          },
        };
        const box: Box =
          payload.kind === "image"
            ? {
                ...common,
                kind: "image",
                assetId: payload.asset.id,
                ...(payload.alt ? { alt: payload.alt } : {}),
              }
            : {
                ...common,
                kind: "text",
                content: structuredClone(payload.content),
              };
        if (payload.kind === "image") {
          s.assetsById[payload.asset.id] = payload.asset;
        }
        if (payload.label !== undefined && payload.label !== "") {
          box.label = payload.label;
        }
        s.boxesById[newId] = box;
        s.selectedBoxId = newId;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
      });
    },
  })),
);

export function getEmptyFileJson(): string {
  return stringifyWhiteboardFile(createEmptyWhiteboardFile());
}
