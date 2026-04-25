import { Sketch } from "@uiw/react-color";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getPaletteEntries,
  normalizePaletteHex,
  paletteHasHex,
  type PaletteEntry,
  type PaletteSelection,
} from "../model/palette";
import type { Palette } from "../model/types";
import { useWhiteboardStore } from "../store/whiteboardStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

const DEFAULT_CUSTOM_COLOR_CANDIDATES = ["#ff6b6b", "#4dabf7", "#51cf66", "#ffd43b", "#845ef7", "#ff922b", "#ffffff"];

const SKETCH_WIDTH_MAX = 320;
const SKETCH_WIDTH_MIN = 200;
const SKETCH_WIDTH_SCALE_BELOW_SM = 1.5;
const SKETCH_PRE_TRANSFORM_HEIGHT_PX = 268;
const SKETCH_SCALE_Y_BELOW_SM = 1.5;

function isSelectedEntry(selection: PaletteSelection | null, entry: PaletteEntry): boolean {
  if (!selection) return false;
  return selection.kind === "named"
    ? entry.kind === "named" && selection.key === entry.key
    : entry.kind === "custom" && selection.index === entry.index;
}

function generateRandomHex(): string {
  const value = Math.floor(Math.random() * 0x1000000);
  return `#${value.toString(16).padStart(6, "0")}`;
}

function getSuggestedCustomColor(palette: Palette): string {
  const defaultCandidate = DEFAULT_CUSTOM_COLOR_CANDIDATES.find((candidate) => !paletteHasHex(palette, candidate));
  if (defaultCandidate) return defaultCandidate;

  const MAX_ATTEMPTS = 64;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = generateRandomHex();
    if (!paletteHasHex(palette, candidate)) return candidate;
  }
  return generateRandomHex();
}

const SM_MIN_WIDTH_QUERY = "(min-width: 640px)";

function useMediaQueryMatches(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function ColorPaletteModal({ open, onClose }: Props) {
  const palette = useWhiteboardStore((s) => s.palette);
  const addCustomColor = useWhiteboardStore((s) => s.addCustomColor);
  const setNamedColor = useWhiteboardStore((s) => s.setNamedColor);
  const removeNamedColor = useWhiteboardStore((s) => s.removeNamedColor);
  const updateCustomColor = useWhiteboardStore((s) => s.updateCustomColor);
  const removeCustomColor = useWhiteboardStore((s) => s.removeCustomColor);
  const reorderCustomColor = useWhiteboardStore((s) => s.reorderCustomColor);
  const renameCustomColor = useWhiteboardStore((s) => s.renameCustomColor);

  const entries = useMemo(() => getPaletteEntries(palette), [palette]);
  const [selection, setSelection] = useState<PaletteSelection | null>(null);
  const [draftHex, setDraftHex] = useState("#ffffff");
  const wasOpenRef = useRef(false);
  const initialDraftHex = useMemo(() => getSuggestedCustomColor(palette), [palette]);
  const sketchHostRef = useRef<HTMLDivElement>(null);
  const sketchOverlayCloseRef = useRef<HTMLButtonElement>(null);
  const [sketchWidth, setSketchWidth] = useState(SKETCH_WIDTH_MAX);
  const [sketchOverlayOpen, setSketchOverlayOpen] = useState(false);
  const isSmUp = useMediaQueryMatches(SM_MIN_WIDTH_QUERY);

  const customItemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const selectedCustomIndex = selection?.kind === "custom" ? selection.index : null;
  const savedCustomLabel =
    selectedCustomIndex !== null ? palette.customLabels?.[selectedCustomIndex] ?? "" : "";
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setDraftName(savedCustomLabel);
  }, [savedCustomLabel, selectedCustomIndex]);

  const setCustomItemRef = useCallback((index: number, node: HTMLLIElement | null) => {
    const map = customItemRefs.current;
    if (node) {
      map.set(index, node);
    } else {
      map.delete(index);
    }
  }, []);

  const findClosestCustomIndex = useCallback((clientX: number, clientY: number): number | null => {
    const map = customItemRefs.current;
    if (map.size === 0) return null;
    let bestIndex: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [index, node] of map) {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
    }
    return bestIndex;
  }, []);

  useEffect(() => {
    if (!open) {
      setSketchOverlayOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (isSmUp) {
      setSketchOverlayOpen(false);
    }
  }, [isSmUp]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelection(null);
      setDraftHex(initialDraftHex);
    }
    wasOpenRef.current = open;
  }, [initialDraftHex, open]);

  useEffect(() => {
    if (!open || !sketchOverlayOpen || isSmUp) return;
    const id = window.requestAnimationFrame(() => {
      sketchOverlayCloseRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isSmUp, open, sketchOverlayOpen]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = sketchHostRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setSketchWidth(
        isSmUp ? SKETCH_WIDTH_MAX : Math.round(SKETCH_WIDTH_MAX * SKETCH_WIDTH_SCALE_BELOW_SM),
      );
      return;
    }
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const base = Math.max(SKETCH_WIDTH_MIN, Math.min(SKETCH_WIDTH_MAX, Math.floor(w)));
      const belowSm = Math.min(Math.floor(w), Math.round(base * SKETCH_WIDTH_SCALE_BELOW_SM));
      const next = isSmUp ? base : belowSm;
      setSketchWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, isSmUp, sketchOverlayOpen]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!isSmUp && sketchOverlayOpen) {
        setSketchOverlayOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSmUp, onClose, open, sketchOverlayOpen]);

  if (!open) return null;

  const normalizedDraft = normalizePaletteHex(draftHex);
  const hasDuplicate = normalizedDraft ? paletteHasHex(palette, normalizedDraft, selection ?? undefined) : false;
  const selectedEntry = selection ? entries.find((entry) => isSelectedEntry(selection, entry)) ?? null : null;
  const primaryDisabled = !normalizedDraft || hasDuplicate;

  const onSelectEntry = (entry: PaletteEntry) => {
    setSelection(entry.kind === "named" ? { kind: "named", key: entry.key } : { kind: "custom", index: entry.index });
    setDraftHex(entry.hex);
  };

  const onCreateMode = () => {
    setSelection(null);
    setDraftHex(initialDraftHex);
  };

  const onSubmit = () => {
    if (!normalizedDraft || hasDuplicate) return;
    if (!selection) {
      addCustomColor(normalizedDraft);
      setDraftHex(normalizedDraft);
      return;
    }

    if (selection.kind === "named") {
      setNamedColor(selection.key, normalizedDraft);
      return;
    }

    updateCustomColor(selection.index, normalizedDraft);
  };

  const commitRename = () => {
    if (selectedCustomIndex === null) return;
    if (draftName === savedCustomLabel) return;
    renameCustomColor(selectedCustomIndex, draftName);
  };

  const onRemove = () => {
    if (!selection) return;
    if (selection.kind === "named") {
      removeNamedColor(selection.key);
    } else {
      removeCustomColor(selection.index);
    }
    setSelection(null);
  };

  const commitReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    reorderCustomColor(fromIndex, toIndex);
    // Keep custom selection pointing at the same item (or shift others appropriately).
    setSelection((current) => {
      if (!current || current.kind !== "custom") return current;
      const idx = current.index;
      if (idx === fromIndex) return { kind: "custom", index: toIndex };
      if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) {
        return { kind: "custom", index: idx - 1 };
      }
      if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) {
        return { kind: "custom", index: idx + 1 };
      }
      return current;
    });
  };

  const onCustomHandlePointerDown = (event: React.PointerEvent<HTMLElement>, fromIndex: number) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // ignore: not all environments support pointer capture
    }
    setDragFromIndex(fromIndex);
    setDragOverIndex(fromIndex);
  };

  const onCustomHandlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (dragFromIndex === null) return;
    const next = findClosestCustomIndex(event.clientX, event.clientY);
    if (next === null) return;
    setDragOverIndex((prev) => (prev === next ? prev : next));
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const handle = event.currentTarget;
    try {
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
    if (commit && dragFromIndex !== null && dragOverIndex !== null) {
      commitReorder(dragFromIndex, dragOverIndex);
    }
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const backdropDismiss = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const showSketch = isSmUp || sketchOverlayOpen;

  const sketchPicker = showSketch ? (
    <div
      ref={sketchHostRef}
      className={
        isSmUp
          ? "flex w-full min-w-0 shrink-0 justify-center overflow-x-hidden max-lg:max-w-[min(100%,320px)] lg:w-full lg:max-w-none"
          : "flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-x-hidden px-3 pb-3"
      }
    >
      <div
        style={
          !isSmUp
            ? {
                marginBottom:
                  SKETCH_PRE_TRANSFORM_HEIGHT_PX * (SKETCH_SCALE_Y_BELOW_SM - 1),
              }
            : undefined
        }
      >
        <Sketch
          color={draftHex}
          width={sketchWidth}
          disableAlpha
          presetColors={false}
          style={
            !isSmUp
              ? {
                  transform: `scaleY(${SKETCH_SCALE_Y_BELOW_SM})`,
                  transformOrigin: "top center",
                }
              : undefined
          }
          onChange={(color) => {
            const nextHex = normalizePaletteHex(color.hex);
            if (nextHex) setDraftHex(nextHex);
          }}
        />
      </div>
    </div>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/45 p-2 max-sm:p-0 max-sm:items-stretch sm:items-center sm:p-4"
      onPointerDown={backdropDismiss}
    >
      <div
        className="relative flex min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl max-sm:h-full max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:border-0 max-sm:shadow-none sm:max-h-[min(90dvh,52rem)] sm:rounded-2xl sm:border sm:shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-color-modal-title"
      >
        {!isSmUp && sketchOverlayOpen ? (
          <div
            className="absolute inset-0 z-20 flex min-h-0 flex-col bg-white pt-[env(safe-area-inset-top)]"
            role="presentation"
          >
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-slate-200 px-3 py-3">
              <button
                ref={sketchOverlayCloseRef}
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                onClick={() => setSketchOverlayOpen(false)}
              >
                Done
              </button>
            </div>
            {sketchPicker}
          </div>
        ) : null}

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 id="wb-color-modal-title" className="text-lg font-semibold text-slate-900">
              Manage colors
            </h2>
            <p className="mt-1 hidden text-sm text-slate-600 sm:block">
              Add a new custom swatch, or select any existing color to update or remove it.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 sm:h-9 sm:w-9"
            aria-label="Close color modal"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/*
          DOM: list first, picker second — matches visual order at every breakpoint.
          max-lg: flex-col stacks list above picker. lg+: grid list left (1fr), picker right (22rem).
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden px-3 py-3 sm:gap-5 sm:px-5 sm:py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-5 lg:overflow-hidden">
          <section className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:col-start-1 lg:row-start-1 lg:min-h-0">
            <div className="mb-2 flex shrink-0 flex-row items-start justify-between gap-2 sm:mb-3 sm:gap-3 lg:mb-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-800">Available colors</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Tap a swatch to load it into the picker, or add a new custom color.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                onClick={onCreateMode}
              >
                <Plus size={16} aria-hidden />
                <span className="max-sm:sr-only">New Custom Color</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-xl border border-slate-200 bg-slate-50 p-2 max-h-[min(60dvh,28rem)] lg:max-h-[min(70dvh,32rem)]">
              {entries.length ? (
                <ul className="grid list-none grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {entries.map((entry) => {
                    const selected = isSelectedEntry(selection, entry);
                    const isCustom = entry.kind === "custom";
                    const isDragging = isCustom && dragFromIndex === entry.index;
                    const isDropTarget =
                      isCustom &&
                      dragFromIndex !== null &&
                      dragOverIndex === entry.index &&
                      dragOverIndex !== dragFromIndex;
                    return (
                      <li
                        key={entry.id}
                        ref={isCustom ? (node) => setCustomItemRef(entry.index, node) : undefined}
                        className={`relative min-w-0 transition ${
                          isDragging ? "opacity-50" : ""
                        }`}
                      >
                        <div
                          className={`flex w-full min-h-12 items-stretch rounded-lg border transition ${
                            selected
                              ? "border-violet-500 bg-violet-50 text-violet-950 ring-1 ring-violet-500/20"
                              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                          } ${isDropTarget ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-slate-50" : ""}`}
                        >
                          <button
                            type="button"
                            aria-pressed={selected}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                            onClick={() => onSelectEntry(entry)}
                          >
                            <span
                              className="h-9 w-9 shrink-0 rounded-md border border-slate-300 shadow-sm"
                              style={{ backgroundColor: entry.hex }}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{entry.label}</span>
                              <span className="block truncate font-mono text-xs text-slate-500">{entry.hex}</span>
                            </span>
                            {entry.kind === "named" ? (
                              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-slate-600">
                                Built-in
                              </span>
                            ) : null}
                          </button>
                          {isCustom ? (
                            <span
                              role="button"
                              tabIndex={-1}
                              aria-label={`Drag to reorder ${entry.label}`}
                              className="flex w-8 shrink-0 cursor-grab items-center justify-center rounded-r-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing select-none"
                              style={{ touchAction: "none" }}
                              onPointerDown={(event) => onCustomHandlePointerDown(event, entry.index)}
                              onPointerMove={onCustomHandlePointerMove}
                              onPointerUp={(event) => endDrag(event, true)}
                              onPointerCancel={(event) => endDrag(event, false)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <GripVertical size={16} aria-hidden />
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  No colors in the palette yet. Use the color picker to add your first swatch.
                </div>
              )}
            </div>
          </section>

          <section className="relative z-[1] flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 max-lg:border-t max-lg:border-slate-200 max-lg:pt-4 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:justify-between lg:overflow-y-auto">
            <div className="mb-3 shrink-0 sm:mb-4">
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedEntry ? `Edit ${selectedEntry.label}` : "Add custom color"}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {selectedEntry
                  ? isSmUp
                    ? "Adjust the color, then update or remove the swatch."
                    : "Open the color picker to adjust, then update or remove the swatch."
                  : isSmUp
                    ? "Pick a color, then add it to your palette."
                    : "Open the color picker to choose a color, then add it to your palette."}
              </p>
            </div>

            {selectedCustomIndex !== null ? (
              <div className="mb-3 shrink-0 sm:mb-4">
                <label
                  htmlFor="wb-color-modal-name"
                  className="block text-xs font-medium text-slate-600"
                >
                  Name
                </label>
                <input
                  id="wb-color-modal-name"
                  type="text"
                  value={draftName}
                  maxLength={64}
                  placeholder={`Custom ${selectedCustomIndex + 1}`}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setDraftName(savedCustomLabel);
                      event.currentTarget.blur();
                    }
                  }}
                  className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                />
              </div>
            ) : null}

            <div className="flex w-full min-w-0 flex-row gap-2 lg:flex-col lg:items-stretch lg:justify-center lg:gap-3">
              {isSmUp ? sketchPicker : null}

              <div className="flex min-w-0 w-full flex-1 flex-col lg:w-full">
                <div
                  className={`shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 max-lg:mt-0 lg:mt-3 ${!isSmUp ? "hidden" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-9 w-9 shrink-0 rounded-md border border-slate-300 shadow-sm"
                      style={{ backgroundColor: normalizedDraft ?? draftHex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium text-slate-800">
                        {normalizedDraft ?? draftHex}
                      </div>
                      <div className="text-xs text-slate-500">
                        {!normalizedDraft
                          ? "Enter a valid hex color in the picker."
                          : hasDuplicate
                            ? "Already in the palette."
                            : selectedEntry
                              ? "Tap update to save this swatch."
                              : "Tap add to create a new swatch."}
                      </div>
                    </div>
                  </div>
                </div>

                {!isSmUp && !sketchOverlayOpen ? (
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition hover:bg-slate-100 active:bg-slate-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                    aria-label="Open color picker"
                    onClick={() => setSketchOverlayOpen(true)}
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-md border border-slate-300 shadow-sm"
                      style={{ backgroundColor: normalizedDraft ?? draftHex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-medium leading-tight text-slate-800">
                        {normalizedDraft ?? draftHex}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] leading-snug text-slate-500">
                        {!normalizedDraft
                          ? "Open the color picker to choose a color."
                          : hasDuplicate
                            ? "Already in the palette."
                            : selectedEntry
                              ? "Tap update to save this swatch."
                              : "Tap add to create a new swatch."}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-violet-700">Change Color</span>
                  </button>
                ) : null}

                <div className="mt-3 flex w-full min-w-0 shrink-0 flex-col gap-2 lg:mt-4 lg:flex-row lg:flex-wrap lg:justify-end lg:gap-2">
                  {selectedEntry ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 self-stretch rounded-lg border-2 border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 active:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 lg:min-h-10 lg:w-auto lg:self-auto lg:border lg:py-2 lg:font-medium"
                      onClick={onRemove}
                    >
                      <Trash2 size={16} aria-hidden />
                      Remove
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-transparent bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 active:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-300 disabled:text-slate-500 lg:min-h-10 lg:w-auto lg:px-4 lg:py-2.5 lg:font-medium"
                    disabled={primaryDisabled}
                    onClick={onSubmit}
                  >
                    {selectedEntry ? "Update" : "Add"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
