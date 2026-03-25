import { Sketch } from "@uiw/react-color";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

function isSelectedEntry(selection: PaletteSelection | null, entry: PaletteEntry): boolean {
  if (!selection) return false;
  return selection.kind === "named"
    ? entry.kind === "named" && selection.key === entry.key
    : entry.kind === "custom" && selection.index === entry.index;
}

function getSuggestedCustomColor(palette: Palette): string {
  return DEFAULT_CUSTOM_COLOR_CANDIDATES.find((candidate) => !paletteHasHex(palette, candidate)) ?? "#ffffff";
}

export function ColorPaletteModal({ open, onClose }: Props) {
  const palette = useWhiteboardStore((s) => s.palette);
  const addCustomColor = useWhiteboardStore((s) => s.addCustomColor);
  const setNamedColor = useWhiteboardStore((s) => s.setNamedColor);
  const removeNamedColor = useWhiteboardStore((s) => s.removeNamedColor);
  const updateCustomColor = useWhiteboardStore((s) => s.updateCustomColor);
  const removeCustomColor = useWhiteboardStore((s) => s.removeCustomColor);

  const entries = useMemo(() => getPaletteEntries(palette), [palette]);
  const [selection, setSelection] = useState<PaletteSelection | null>(null);
  const [draftHex, setDraftHex] = useState("#ffffff");
  const wasOpenRef = useRef(false);
  const initialDraftHex = useMemo(() => getSuggestedCustomColor(palette), [palette]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelection(null);
      setDraftHex(initialDraftHex);
    }
    wasOpenRef.current = open;
  }, [initialDraftHex, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

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

  const onRemove = () => {
    if (!selection) return;
    if (selection.kind === "named") {
      removeNamedColor(selection.key);
    } else {
      removeCustomColor(selection.index);
    }
    setSelection(null);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-color-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="wb-color-modal-title" className="text-lg font-semibold text-slate-900">
              Manage colors
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Add a new custom swatch, or select any existing color to update or remove it.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
            aria-label="Close color modal"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden px-5 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Available colors</h3>
                <p className="text-xs text-slate-500">Built-in and custom swatches currently shown in the toolbar.</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                onClick={onCreateMode}
              >
                <Plus size={16} />
                New custom color
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2">
              {entries.length ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {entries.map((entry) => {
                    const selected = isSelectedEntry(selection, entry);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500/25 ${
                          selected
                            ? "border-violet-400 bg-violet-50 text-violet-900"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        onClick={() => onSelectEntry(entry)}
                      >
                        <span
                          className="h-8 w-8 shrink-0 rounded-md border border-slate-300 shadow-sm"
                          style={{ backgroundColor: entry.hex }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{entry.label}</span>
                          <span className="block truncate text-xs text-slate-500">{entry.hex}</span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-slate-500">
                          {entry.kind === "named" ? "Built-in" : "Custom"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  No colors are currently available. Add a custom color to create a new swatch.
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedEntry ? `Edit ${selectedEntry.label}` : "Add custom color"}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {selectedEntry
                  ? "Update the selected swatch with the Sketch picker, or remove it from the palette."
                  : "Choose a color and add it as a new custom swatch."}
              </p>
            </div>

            <div className="flex min-h-0 flex-1 justify-center overflow-y-auto">
              <Sketch
                color={draftHex}
                width={320}
                disableAlpha
                presetColors={false}
                onChange={(color) => {
                  const nextHex = normalizePaletteHex(color.hex);
                  if (nextHex) setDraftHex(nextHex);
                }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-3">
                <span
                  className="h-8 w-8 rounded-md border border-slate-300 shadow-sm"
                  style={{ backgroundColor: normalizedDraft ?? draftHex }}
                  aria-hidden="true"
                />
                <div>
                  <div className="text-sm font-medium text-slate-800">{normalizedDraft ?? draftHex}</div>
                  <div className="text-xs text-slate-500">
                    {!normalizedDraft
                      ? "Enter a valid 6-digit hex color."
                      : hasDuplicate
                        ? "That color is already in the palette."
                        : selectedEntry
                          ? "Ready to update the selected swatch."
                          : "Ready to add as a new custom swatch."}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {selectedEntry ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
                  onClick={onRemove}
                >
                  <Trash2 size={16} />
                  Remove color
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                onClick={onClose}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/25 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={primaryDisabled}
                onClick={onSubmit}
              >
                {selectedEntry ? "Update color" : "Add color"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
