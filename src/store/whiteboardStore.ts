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
  serializeBoxesForClipboard,
  type LinkClipboardEntry,
  type ParsedBoxClipboard,
  type SingleBoxClipboardEntry,
} from "../model/boxClipboard";
import {
  createBoxAt,
  createImageBoxAt,
  createEmptyRuntime,
  createEmptyWhiteboardFile,
} from "../model/whiteboardFactory";
import { getDefaultLinkStyle, getNamedPaletteColor, normalizePaletteHex, paletteHasHex } from "../model/palette";

const MAX_UNDO = 50;
const DUPLICATE_OFFSET = 24;

export type BoardTool = "select" | "marquee" | "link";

export type LastBoxDefaults = {
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: string;
  fontFamily?: string;
};

export type ViewportSize = {
  width: number;
  height: number;
};

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

export interface WhiteboardState extends WhiteboardRuntime {
  selectedBoxIds: string[];
  selectedLinkId: string | null;
  tool: BoardTool;
  /** When tool === "link", first clicked box id */
  linkSourceId: string | null;
  boardFileName: string | null;
  /** Core snapshot JSON at last load / new board / successful save — for dirty detection */
  lastSavedCoreJson: string;
  past: string[];
  future: string[];
  /** Last-applied per-style values, used as defaults for newly added boxes (session-scoped). */
  lastBoxDefaults: LastBoxDefaults;
  /** Live viewport DOM size, kept up to date by BoardView; used for "add box at viewport center". */
  viewportSize: ViewportSize;
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
  markBoardSaved: () => void;
  hasUnsavedChanges: () => boolean;
  addBox: (x: number, y: number) => void;
  addImageBox: (asset: ImageAsset, x: number, y: number) => void;
  upsertAsset: (asset: ImageAsset) => void;
  deleteSelectedBoxes: () => void;
  deleteSelectedLink: () => void;
  selectBoxes: (ids: readonly string[]) => void;
  toggleBoxInSelection: (id: string) => void;
  addBoxesToSelection: (ids: readonly string[]) => void;
  clearBoxSelection: () => void;
  selectAllBoxes: () => void;
  selectLink: (id: string | null) => void;
  setTool: (tool: BoardTool) => void;
  setLinkSource: (id: string | null) => void;
  tryCompleteLink: (toBoxId: string) => void;
  cancelLink: () => void;
  updateBoxContent: (id: string, content: ProseMirrorDocJSON) => void;
  commitBoxPosition: (id: string, x: number, y: number) => void;
  commitMultiBoxPositions: (deltas: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  commitBoxSize: (id: string, x: number, y: number, width: number, height: number) => void;
  setViewport: (v: Viewport) => void;
  setViewportSize: (size: ViewportSize) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  updateBoxStyle: (id: string, style: Partial<Box["style"]>) => void;
  updateBoxStyles: (ids: readonly string[], style: Partial<Box["style"]>) => void;
  updateBoxLabel: (id: string, label: string | undefined) => void;
  recordLastTextStyle: (style: { fontSize?: string; fontFamily?: string }) => void;
  addCustomColor: (hex: string) => void;
  setNamedColor: (key: string, hex: string) => void;
  removeNamedColor: (key: string) => void;
  updateCustomColor: (index: number, hex: string) => void;
  removeCustomColor: (index: number) => void;
  reorderCustomColor: (fromIndex: number, toIndex: number) => void;
  renameCustomColor: (index: number, label: string) => void;
  addLink: (fromBoxId: string, toBoxId: string) => void;
  updateLinkLabel: (id: string, label: string | undefined) => void;
  updateLinkStyle: (id: string, style: Partial<LinkStyle>) => void;
  copySelectedBoxes: () => Promise<boolean>;
  ingestPastedBoxes: (payload: ParsedBoxClipboard) => void;
  duplicateSelectedBoxes: () => void;
};

const initialRuntime = createEmptyRuntime();

const initialState: WhiteboardState = {
  ...initialRuntime,
  selectedBoxIds: [],
  selectedLinkId: null,
  tool: "select",
  linkSourceId: null,
  boardFileName: null,
  lastSavedCoreJson: snapshotCore(initialRuntime),
  past: [],
  future: [],
  lastBoxDefaults: {},
  viewportSize: { width: 0, height: 0 },
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
        s.selectedBoxIds = [];
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
        s.selectedBoxIds = [];
        s.selectedLinkId = null;
        s.linkSourceId = null;
      }),

    loadFromFileJson: (text: string, fileName = null) => {
      const file = parseWhiteboardFileJson(text);
      const rt = runtimeFromFile(file);
      clearAssetStore();
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxIds = [];
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = fileName?.trim() ? fileName.trim() : null;
        s.past = [];
        s.future = [];
        s.lastSavedCoreJson = snapshotCore(s);
        s.lastBoxDefaults = {};
      });
    },

    loadFromFileData: (file, fileName = null) => {
      const rt = runtimeFromFile(file);
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxIds = [];
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = fileName?.trim() ? fileName.trim() : null;
        s.past = [];
        s.future = [];
        s.lastSavedCoreJson = snapshotCore(s);
        s.lastBoxDefaults = {};
      });
    },

    newBoard: () => {
      const rt = createEmptyRuntime();
      clearAssetStore();
      set((s) => {
        applyCore(s, rt);
        s.selectedBoxIds = [];
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
        s.boardFileName = null;
        s.past = [];
        s.future = [];
        s.lastSavedCoreJson = snapshotCore(s);
        s.lastBoxDefaults = {};
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

    markBoardSaved: () =>
      set((s) => {
        s.lastSavedCoreJson = snapshotCore(s);
      }),

    hasUnsavedChanges: () => snapshotCore(get()) !== get().lastSavedCoreJson,

    addBox: (x, y) => {
      get().pushSnapshot();
      set((s) => {
        const z = maxZIndex(s.boxesById) + 1;
        const box = createBoxAt(x, y, z, s.palette, s.lastBoxDefaults);
        s.boxesById[box.id] = box;
        s.selectedBoxIds = [box.id];
        s.selectedLinkId = null;
      });
    },

    addImageBox: (asset, x, y) => {
      get().pushSnapshot();
      set((s) => {
        s.assetsById[asset.id] = asset;
        const z = maxZIndex(s.boxesById) + 1;
        const box = createImageBoxAt(x, y, z, asset, s.palette, s.lastBoxDefaults);
        s.boxesById[box.id] = box;
        s.selectedBoxIds = [box.id];
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
      });
    },

    upsertAsset: (asset) =>
      set((s) => {
        s.assetsById[asset.id] = asset;
      }),

    deleteSelectedBoxes: () => {
      const ids = get().selectedBoxIds;
      if (ids.length === 0) return;
      get().pushSnapshot();
      set((s) => {
        const idSet = new Set(s.selectedBoxIds);
        for (const id of idSet) {
          delete s.boxesById[id];
        }
        s.links = s.links.filter((l) => !idSet.has(l.fromBoxId) && !idSet.has(l.toBoxId));
        s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
        s.selectedBoxIds = [];
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

    selectBoxes: (ids) =>
      set((s) => {
        const next = uniqueIds(ids).filter((id) => !!s.boxesById[id]);
        s.selectedBoxIds = next;
        if (next.length > 0) s.selectedLinkId = null;
        // When a single box is selected, adopt its style as the "last applied" defaults so a
        // subsequent "Add box" inherits the look the user just chose. Multi-select is ambiguous;
        // skip recording in that case.
        if (next.length === 1) {
          const b = s.boxesById[next[0]];
          if (b) {
            s.lastBoxDefaults.fill = b.style.fill;
            s.lastBoxDefaults.stroke = b.style.stroke;
            if (b.kind === "text" && b.style.textColor) {
              s.lastBoxDefaults.textColor = b.style.textColor;
            }
          }
        }
      }),

    toggleBoxInSelection: (id) =>
      set((s) => {
        if (!s.boxesById[id]) return;
        const idx = s.selectedBoxIds.indexOf(id);
        if (idx === -1) {
          s.selectedBoxIds.push(id);
          s.selectedLinkId = null;
        } else {
          s.selectedBoxIds.splice(idx, 1);
        }
      }),

    addBoxesToSelection: (ids) =>
      set((s) => {
        const seen = new Set(s.selectedBoxIds);
        let added = false;
        for (const id of ids) {
          if (!s.boxesById[id]) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          s.selectedBoxIds.push(id);
          added = true;
        }
        if (added) s.selectedLinkId = null;
      }),

    clearBoxSelection: () =>
      set((s) => {
        s.selectedBoxIds = [];
      }),

    selectAllBoxes: () =>
      set((s) => {
        s.selectedBoxIds = Object.keys(s.boxesById);
        if (s.selectedBoxIds.length > 0) s.selectedLinkId = null;
      }),

    selectLink: (id) =>
      set((s) => {
        s.selectedLinkId = id;
        if (id) {
          s.selectedBoxIds = [];
          s.linkSourceId = null;
        }
      }),

    setTool: (tool) =>
      set((s) => {
        s.tool = tool;
        if (tool === "link") {
          s.linkSourceId = s.selectedBoxIds[0] ?? null;
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

    commitMultiBoxPositions: (deltas) => {
      if (deltas.length === 0) return;
      get().pushSnapshot();
      set((s) => {
        for (const { id, x, y } of deltas) {
          const b = s.boxesById[id];
          if (!b) continue;
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

    setViewportSize: (size) =>
      set((s) => {
        if (s.viewportSize.width === size.width && s.viewportSize.height === size.height) return;
        s.viewportSize = { ...size };
      }),

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
        if (style.fill !== undefined) s.lastBoxDefaults.fill = style.fill;
        if (style.stroke !== undefined) s.lastBoxDefaults.stroke = style.stroke;
        if (style.textColor !== undefined) s.lastBoxDefaults.textColor = style.textColor;
      });
    },

    updateBoxStyles: (ids, style) => {
      if (ids.length === 0) return;
      get().pushSnapshot();
      set((s) => {
        for (const id of ids) {
          const b = s.boxesById[id];
          if (b) Object.assign(b.style, style);
        }
        if (style.fill !== undefined) s.lastBoxDefaults.fill = style.fill;
        if (style.stroke !== undefined) s.lastBoxDefaults.stroke = style.stroke;
        if (style.textColor !== undefined) s.lastBoxDefaults.textColor = style.textColor;
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

    recordLastTextStyle: (style) =>
      set((s) => {
        if (style.fontSize !== undefined) s.lastBoxDefaults.fontSize = style.fontSize;
        if (style.fontFamily !== undefined) s.lastBoxDefaults.fontFamily = style.fontFamily;
      }),

    addCustomColor: (hex) => {
      const normalized = normalizePaletteHex(hex);
      if (!normalized) return;
      if (paletteHasHex(get().palette, normalized)) return;
      get().pushSnapshot();
      set((s) => {
        s.palette.custom.push(normalized);
        if (s.palette.customLabels) s.palette.customLabels.push("");
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
        if (s.palette.customLabels) {
          s.palette.customLabels.splice(index, 1);
          if (s.palette.customLabels.every((label) => !label)) {
            delete s.palette.customLabels;
          }
        }
      });
    },

    reorderCustomColor: (fromIndex, toIndex) => {
      const state = get();
      const list = state.palette.custom;
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
      if (fromIndex < 0 || fromIndex >= list.length) return;
      if (toIndex < 0 || toIndex >= list.length) return;
      if (fromIndex === toIndex) return;
      state.pushSnapshot();
      set((s) => {
        const arr = s.palette.custom;
        if (fromIndex >= arr.length || toIndex >= arr.length) return;
        const [moved] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, moved);
        const labels = s.palette.customLabels;
        if (labels && fromIndex < labels.length && toIndex < labels.length) {
          const [movedLabel] = labels.splice(fromIndex, 1);
          labels.splice(toIndex, 0, movedLabel);
        }
      });
    },

    renameCustomColor: (index, label) => {
      const state = get();
      if (!Number.isInteger(index) || index < 0) return;
      if (!state.palette.custom[index]) return;
      const trimmed = typeof label === "string" ? label.trim().slice(0, 64) : "";
      const existing = state.palette.customLabels?.[index] ?? "";
      if (existing === trimmed) return;
      state.pushSnapshot();
      set((s) => {
        if (!s.palette.custom[index]) return;
        if (!s.palette.customLabels) {
          s.palette.customLabels = s.palette.custom.map(() => "");
        }
        // Ensure parallel length even if labels array drifted.
        while (s.palette.customLabels.length < s.palette.custom.length) {
          s.palette.customLabels.push("");
        }
        s.palette.customLabels[index] = trimmed;
        if (s.palette.customLabels.every((value) => !value)) {
          delete s.palette.customLabels;
        }
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

    copySelectedBoxes: async () => {
      const s = get();
      const ids = s.selectedBoxIds;
      if (ids.length === 0) return false;
      const idSet = new Set(ids);
      const boxes: Box[] = [];
      const assets: ImageAsset[] = [];
      for (const id of ids) {
        const b = s.boxesById[id];
        if (!b) continue;
        boxes.push(b);
        if (b.kind === "image") {
          const asset = s.assetsById[b.assetId];
          if (asset) assets.push(asset);
        }
      }
      if (boxes.length === 0) return false;
      // Only links whose BOTH endpoints are in the selection are copied; dangling links are dropped.
      const incidentLinks = s.links.filter(
        (l) => idSet.has(l.fromBoxId) && idSet.has(l.toBoxId),
      );
      try {
        await navigator.clipboard.writeText(
          serializeBoxesForClipboard(boxes, assets, incidentLinks),
        );
        return true;
      } catch {
        return false;
      }
    },

    ingestPastedBoxes: (payload) => {
      const { boxes: entries, links: linkEntries } = payload;
      if (entries.length === 0) return;
      get().pushSnapshot();
      set((s) => {
        const z0 = maxZIndex(s.boxesById);
        const newIds: string[] = [];
        entries.forEach((entry, i) => {
          const newId = crypto.randomUUID();
          const z = z0 + 1 + i;
          const common = {
            id: newId,
            x: entry.x + DUPLICATE_OFFSET,
            y: entry.y + DUPLICATE_OFFSET,
            width: entry.width,
            height: entry.height,
            zIndex: z,
            style: {
              ...entry.style,
              ...(entry.kind === "text" && !entry.style.textColor
                ? { textColor: getNamedPaletteColor(s.palette, "text") }
                : {}),
            },
          };
          const box: Box =
            entry.kind === "image"
              ? {
                  ...common,
                  kind: "image",
                  assetId: entry.asset.id,
                  ...(entry.alt ? { alt: entry.alt } : {}),
                }
              : {
                  ...common,
                  kind: "text",
                  content: structuredClone(entry.content),
                };
          if (entry.kind === "image") {
            s.assetsById[entry.asset.id] = entry.asset;
          }
          if (entry.label !== undefined && entry.label !== "") {
            box.label = entry.label;
          }
          s.boxesById[newId] = box;
          newIds.push(newId);
        });
        // Recreate links between the freshly inserted boxes (mapped via array index).
        let linksAdded = false;
        for (const link of linkEntries) {
          const fromBoxId = newIds[link.fromIdx];
          const toBoxId = newIds[link.toIdx];
          if (!fromBoxId || !toBoxId || fromBoxId === toBoxId) continue;
          s.links.push({
            id: crypto.randomUUID(),
            fromBoxId,
            toBoxId,
            style: { ...link.style },
            ...(link.label !== undefined && link.label !== "" ? { label: link.label } : {}),
            ...(link.labelStyle ? { labelStyle: { ...link.labelStyle } } : {}),
            ...(link.labelOffset ? { labelOffset: { ...link.labelOffset } } : {}),
          });
          linksAdded = true;
        }
        if (linksAdded) {
          s.linkIdsByBoxId = buildLinkIdsByBoxId(s.links);
        }
        s.selectedBoxIds = newIds;
        s.selectedLinkId = null;
        s.tool = "select";
        s.linkSourceId = null;
      });
    },

    duplicateSelectedBoxes: () => {
      const s = get();
      const ids = s.selectedBoxIds;
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const entries: SingleBoxClipboardEntry[] = [];
      const idxByOldId = new Map<string, number>();
      for (const id of ids) {
        const b = s.boxesById[id];
        if (!b) continue;
        idxByOldId.set(id, entries.length);
        const base = {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          style: { ...b.style },
          ...(b.label !== undefined && b.label !== "" ? { label: b.label } : {}),
        };
        if (b.kind === "image") {
          const asset = s.assetsById[b.assetId] ?? {
            id: b.assetId,
            mimeType: "image/png",
            width: b.width,
            height: b.height,
          };
          entries.push({
            ...base,
            kind: "image",
            asset,
            ...(b.alt ? { alt: b.alt } : {}),
          });
        } else {
          entries.push({
            ...base,
            kind: "text",
            content: structuredClone(b.content),
          });
        }
      }
      const linkEntries: LinkClipboardEntry[] = [];
      for (const link of s.links) {
        if (!idSet.has(link.fromBoxId) || !idSet.has(link.toBoxId)) continue;
        const fromIdx = idxByOldId.get(link.fromBoxId);
        const toIdx = idxByOldId.get(link.toBoxId);
        if (fromIdx === undefined || toIdx === undefined) continue;
        linkEntries.push({
          fromIdx,
          toIdx,
          style: { ...link.style },
          ...(link.label !== undefined && link.label !== "" ? { label: link.label } : {}),
          ...(link.labelStyle ? { labelStyle: { ...link.labelStyle } } : {}),
          ...(link.labelOffset ? { labelOffset: { ...link.labelOffset } } : {}),
        });
      }
      get().ingestPastedBoxes({ boxes: entries, links: linkEntries });
    },
  })),
);

export function getEmptyFileJson(): string {
  return stringifyWhiteboardFile(createEmptyWhiteboardFile());
}

/** Convenience helper: returns the "primary" selection id (last one added), or null. */
export function getPrimarySelectedBoxId(s: Pick<WhiteboardState, "selectedBoxIds">): string | null {
  const ids = s.selectedBoxIds;
  return ids.length > 0 ? ids[ids.length - 1] : null;
}
