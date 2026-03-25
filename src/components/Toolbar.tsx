import {
  Bold,
  BringToFront,
  ChevronDown,
  FilePlus,
  FolderOpen,
  ImagePlus,
  Italic,
  Link2,
  MousePointer2,
  MoveDown,
  MoveUp,
  PaintBucket,
  Plus,
  Redo2,
  Save,
  SendToBack,
  SquarePlus,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toggleMark } from "prosemirror-commands";
import type { EditorView } from "prosemirror-view";
import { boardSchema } from "../editor/schema";
import { toBoardBundleFileName } from "../model/boardFileName";
import { setTextAlign, setTextStyle, type TextAlign } from "../editor/textStyle";
import { useEditorRegistry } from "../context/EditorRegistryContext";
import { getPaletteEntries } from "../model/palette";
import { useWhiteboardStore } from "../store/whiteboardStore";
import { registerImageBlob, replaceAssetStore } from "../persistence/assetStore";
import { downloadBoardBundle, readBoardFile } from "../persistence/fileIo";
import { ColorPaletteModal } from "./ColorPaletteModal";

type FontFamilyOption = {
  label: string;
  value: string;
};

const FONT_SIZE_LISTBOX_ID = "wb-font-size-options";
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px", "60px", "72px"];
const FONT_FAMILIES: FontFamilyOption[] = [
  { label: "System Sans", value: "system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Garamond", value: "Garamond, Baskerville, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  {
    label: "System Monospace",
    value: "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
];
const TEXT_ALIGNMENTS: Array<{ value: TextAlign; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Left align", icon: TextAlignStart },
  { value: "center", label: "Center align", icon: TextAlignCenter },
  { value: "right", label: "Right align", icon: TextAlignEnd },
];

const TOOLBAR_GROUP_CLASS = "flex flex-wrap items-center gap-1";
const SECTION_LABEL_CLASS =
  "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500";
const FIELD_CLASS =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25";
const ICON_BUTTON_BASE =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25";
const ICON_BUTTON_ACTIVE = "border-violet-400 bg-violet-100 text-violet-700";
const SWATCH_BUTTON_CLASS =
  "h-6 w-6 rounded border border-slate-400 shadow-sm transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-500/25";
const SMALL_SWATCH_BUTTON_CLASS =
  "h-4 w-4 rounded border border-slate-400 shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-500/25";
const ICON_SIZE = 16;

function normalizeFontSizeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(?:\s*px)?$/i);
  if (!match) return null;

  const size = Number(match[1]);
  if (!Number.isFinite(size) || size <= 0) return null;

  return `${size}px`;
}

function getSelectionTextStyleAttr(view: EditorView | null, attr: "fontFamily" | "fontSize"): string {
  if (!view) return "";

  const markType = boardSchema.marks.textStyle;
  if (!markType) return "";

  const {
    state,
    state: { selection },
  } = view;
  const { from, to, empty, $from } = selection;

  if (empty) {
    const mark = markType.isInSet(state.storedMarks ?? $from.marks());
    return typeof mark?.attrs[attr] === "string" ? mark.attrs[attr] : "";
  }

  let value: string | undefined;
  let hasText = false;
  let isMixed = false;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (isMixed || !node.isText) return;

    const overlapFrom = Math.max(pos, from);
    const overlapTo = Math.min(pos + node.nodeSize, to);
    if (overlapFrom >= overlapTo) return;

    hasText = true;
    const mark = markType.isInSet(node.marks);
    const nextValue = typeof mark?.attrs[attr] === "string" ? mark.attrs[attr] : "";
    if (value === undefined) {
      value = nextValue;
      return;
    }
    if (value !== nextValue) isMixed = true;
  });

  if (isMixed) return "";
  if (hasText) return value ?? "";

  const mark = markType.isInSet(state.storedMarks ?? $from.marks());
  return typeof mark?.attrs[attr] === "string" ? mark.attrs[attr] : "";
}

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
};

function IconButton({ icon: Icon, label, onClick, active = false, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`${ICON_BUTTON_BASE} ${active ? ICON_BUTTON_ACTIVE : ""} ${className}`.trim()}
      onClick={onClick}
    >
      <Icon size={ICON_SIZE} />
    </button>
  );
}

export function Toolbar() {
  const boardFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const { getView, subscribe } = useEditorRegistry();
  const [isAlignMenuOpen, setIsAlignMenuOpen] = useState(false);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [selectedTextAlign, setSelectedTextAlign] = useState<TextAlign>("left");
  const [fontSizeInput, setFontSizeInput] = useState("");
  const [isEditingFontSize, setIsEditingFontSize] = useState(false);

  const selectedBoxId = useWhiteboardStore((s) => s.selectedBoxId);
  const selectedLinkId = useWhiteboardStore((s) => s.selectedLinkId);
  const tool = useWhiteboardStore((s) => s.tool);
  const palette = useWhiteboardStore((s) => s.palette);
  const boardFileName = useWhiteboardStore((s) => s.boardFileName);
  const newBoard = useWhiteboardStore((s) => s.newBoard);
  const loadFromFileData = useWhiteboardStore((s) => s.loadFromFileData);
  const exportFile = useWhiteboardStore((s) => s.exportFile);
  const setBoardFileName = useWhiteboardStore((s) => s.setBoardFileName);
  const undo = useWhiteboardStore((s) => s.undo);
  const redo = useWhiteboardStore((s) => s.redo);
  const addBox = useWhiteboardStore((s) => s.addBox);
  const addImageBox = useWhiteboardStore((s) => s.addImageBox);
  const setTool = useWhiteboardStore((s) => s.setTool);
  const bringToFront = useWhiteboardStore((s) => s.bringToFront);
  const sendToBack = useWhiteboardStore((s) => s.sendToBack);
  const bringForward = useWhiteboardStore((s) => s.bringForward);
  const sendBackward = useWhiteboardStore((s) => s.sendBackward);
  const deleteSelectedBox = useWhiteboardStore((s) => s.deleteSelectedBox);
  const deleteSelectedLink = useWhiteboardStore((s) => s.deleteSelectedLink);
  const updateBoxStyle = useWhiteboardStore((s) => s.updateBoxStyle);
  const updateBoxLabel = useWhiteboardStore((s) => s.updateBoxLabel);
  const updateLinkLabel = useWhiteboardStore((s) => s.updateLinkLabel);

  const selectedBox = useWhiteboardStore(
    useCallback((s) => (selectedBoxId ? s.boxesById[selectedBoxId] : undefined), [selectedBoxId]),
  );
  const selectedLink = useWhiteboardStore(
    useCallback(
      (s) => (selectedLinkId ? s.links.find((link) => link.id === selectedLinkId) : undefined),
      [selectedLinkId],
    ),
  );
  const isTextBoxSelected = selectedBox?.kind === "text";

  const runOnEditor = useCallback(
    (fn: (view: NonNullable<ReturnType<typeof getView>>) => void) => {
      if (!selectedBoxId || selectedBox?.kind !== "text") return;
      const v = getView(selectedBoxId);
      if (v) fn(v);
    },
    [getView, selectedBox, selectedBoxId],
  );

  const selectionFontSize = useSyncExternalStore(
    subscribe,
    () => getSelectionTextStyleAttr(getView(selectedBoxId), "fontSize"),
    () => "",
  );

  const applyFontSize = useCallback(
    (rawValue: string) => {
      const normalized = normalizeFontSizeInput(rawValue);
      if (!normalized || !selectedBoxId || selectedBox?.kind !== "text") {
        setIsEditingFontSize(false);
        setFontSizeInput(selectionFontSize);
        return false;
      }

      const view = getView(selectedBoxId);
      if (!view) {
        setIsEditingFontSize(false);
        setFontSizeInput(selectionFontSize);
        return false;
      }

      const didApply = setTextStyle({ fontSize: normalized })(view.state, view.dispatch);
      if (!didApply) {
        setIsEditingFontSize(false);
        setFontSizeInput(selectionFontSize);
        return false;
      }

      setFontSizeInput(normalized);
      setIsEditingFontSize(false);
      setIsFontSizeMenuOpen(false);
      view.focus();
      return true;
    },
    [getView, selectedBox?.kind, selectedBoxId, selectionFontSize],
  );

  const onSave = async () => {
    const nextFileName = toBoardBundleFileName(boardFileName);
    try {
      await downloadBoardBundle(exportFile(), nextFileName);
      setBoardFileName(nextFileName);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to save board.");
    }
  };

  const onOpenPick = () => boardFileInputRef.current?.click();
  const onPickImage = () => imageFileInputRef.current?.click();

  const onOpenFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const loaded = await readBoardFile(f);
      replaceAssetStore(loaded.assets);
      loadFromFileData(loaded.file, f.name);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to open board.");
    }
  };

  const onAddImageFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const asset = await registerImageBlob(file);
      addImageBox(asset, 320, 240);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to add image.");
    }
  };

  const allSwatches = useMemo(() => getPaletteEntries(palette), [palette]);
  const selectedBoxLabelKey = useMemo(
    () => (selectedBoxId ? `${selectedBoxId}-${selectedBox?.label ?? ""}` : "no-box"),
    [selectedBoxId, selectedBox?.label],
  );
  const selectedLinkLabelKey = useMemo(
    () => (selectedLinkId ? `${selectedLinkId}-${selectedLink?.label ?? ""}` : "no-link"),
    [selectedLinkId, selectedLink?.label],
  );
  const CurrentTextAlignIcon =
    TEXT_ALIGNMENTS.find(({ value }) => value === selectedTextAlign)?.icon ?? TextAlignStart;

  useEffect(() => {
    if (!isAlignMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (alignMenuRef.current?.contains(event.target as Node)) return;
      setIsAlignMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isAlignMenuOpen]);

  useEffect(() => {
    if (!isFontSizeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (fontSizeMenuRef.current?.contains(event.target as Node)) return;
      setIsFontSizeMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isFontSizeMenuOpen]);

  useEffect(() => {
    if (isEditingFontSize) return;
    setFontSizeInput(selectionFontSize);
  }, [isEditingFontSize, selectionFontSize]);

  useEffect(() => {
    setSelectedTextAlign("left");
    setIsFontSizeMenuOpen(false);
    setIsEditingFontSize(false);
  }, [selectedBoxId]);

  return (
    <>
      <header className="z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className={TOOLBAR_GROUP_CLASS}>
        <IconButton icon={FilePlus} label="New board" onClick={() => newBoard()} />
        <IconButton icon={FolderOpen} label="Open board" onClick={onOpenPick} />
        <input
          ref={boardFileInputRef}
          type="file"
          accept="application/json,.json,application/zip,.zip,.wbz"
          hidden
          onChange={onOpenFile}
        />
        <IconButton icon={Save} label="Save board" onClick={onSave} />
        <IconButton icon={Undo2} label="Undo" onClick={() => undo()} />
        <IconButton icon={Redo2} label="Redo" onClick={() => redo()} />
        </div>
        <div className={TOOLBAR_GROUP_CLASS}>
        <IconButton icon={SquarePlus} label="Add box" onClick={() => addBox(320, 240)} />
        <IconButton icon={ImagePlus} label="Add image" onClick={onPickImage} />
        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onAddImageFile}
        />
        {selectedBoxId ? (
          <IconButton
            icon={Trash2}
            label="Delete selected box"
            onClick={() => deleteSelectedBox()}
            className="text-rose-600 hover:bg-rose-50"
          />
        ) : null}
        <IconButton
          icon={MousePointer2}
          label="Select tool"
          active={tool === "select"}
          onClick={() => setTool("select")}
        />
        <IconButton
          icon={Link2}
          label="Link tool"
          active={tool === "link"}
          onClick={() => setTool("link")}
        />
        </div>
        {selectedBoxId ? (
          <div className={TOOLBAR_GROUP_CLASS}>
          <label className={SECTION_LABEL_CLASS} htmlFor="wb-box-label-input">
            Label
          </label>
          <input
            id="wb-box-label-input"
            className={`${FIELD_CLASS} min-w-32`}
            type="text"
            placeholder="Optional"
            key={selectedBoxLabelKey}
            defaultValue={selectedBox?.label ?? ""}
            onBlur={(e) => {
              const t = e.target.value.trim();
              updateBoxLabel(selectedBoxId, t === "" ? undefined : t);
            }}
          />
          </div>
        ) : null}
        {selectedBoxId ? (
          <div className={`${TOOLBAR_GROUP_CLASS} border-l border-slate-200 pl-3`}>
          <span className={SECTION_LABEL_CLASS}>Z</span>
          <IconButton
            icon={BringToFront}
            label="Bring to front"
            onClick={() => bringToFront(selectedBoxId)}
          />
          <IconButton icon={SendToBack} label="Send to back" onClick={() => sendToBack(selectedBoxId)} />
          <IconButton icon={MoveUp} label="Bring forward" onClick={() => bringForward(selectedBoxId)} />
          <IconButton icon={MoveDown} label="Send backward" onClick={() => sendBackward(selectedBoxId)} />
          </div>
        ) : null}
        {selectedLinkId ? (
          <div className={TOOLBAR_GROUP_CLASS}>
          <label className={SECTION_LABEL_CLASS} htmlFor="wb-link-label-input">
            Link
          </label>
          <input
            id="wb-link-label-input"
            className={`${FIELD_CLASS} min-w-32`}
            aria-label="Link label"
            placeholder="Link label"
            key={selectedLinkLabelKey}
            defaultValue={selectedLink?.label ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              updateLinkLabel(selectedLinkId, v || undefined);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete selected link"
            onClick={() => deleteSelectedLink()}
            className="text-rose-600 hover:bg-rose-50"
          />
          </div>
        ) : null}
        <div className={TOOLBAR_GROUP_CLASS}>
        <span className={SECTION_LABEL_CLASS}>
          <PaintBucket size={14} />
          Fill
        </span>
        {allSwatches.map(({ id, label, hex }) => (
          <button
            key={id}
            type="button"
            className={SWATCH_BUTTON_CLASS}
            style={{ background: hex }}
            aria-label={`Set box color to ${hex}`}
            title={`Set box color to ${label}: ${hex}`}
            onClick={() => {
              if (selectedBoxId) updateBoxStyle(selectedBoxId, { fill: hex });
            }}
          />
        ))}
        <IconButton icon={Plus} label="Add custom color" onClick={() => setIsColorModalOpen(true)} />
        </div>
        {isTextBoxSelected ? (
          <div className={`${TOOLBAR_GROUP_CLASS} border-l border-slate-200 pl-3`}>
          <span className={SECTION_LABEL_CLASS}>
            <Type size={14} />
            Text
          </span>
          <IconButton
            icon={Bold}
            label="Bold"
            onClick={() =>
              runOnEditor((view) => {
                toggleMark(boardSchema.marks.strong)(view.state, view.dispatch);
                view.focus();
              })
            }
          />
          <IconButton
            icon={Italic}
            label="Italic"
            onClick={() =>
              runOnEditor((view) => {
                toggleMark(boardSchema.marks.em)(view.state, view.dispatch);
                view.focus();
              })
            }
          />
          <div className="relative" ref={alignMenuRef}>
            <button
              type="button"
              aria-label="Text alignment"
              title="Text alignment"
              aria-haspopup="menu"
              aria-expanded={isAlignMenuOpen}
              className={`${FIELD_CLASS} inline-flex min-w-0 items-center gap-1 px-2`}
              onClick={() => setIsAlignMenuOpen((open) => !open)}
            >
              <CurrentTextAlignIcon size={ICON_SIZE} />
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {isAlignMenuOpen ? (
              <div
                className="absolute left-0 top-full z-20 mt-1 flex rounded-md border border-slate-200 bg-white p-1 shadow-lg"
                role="menu"
                aria-label="Text alignment options"
              >
                {TEXT_ALIGNMENTS.map(({ value, label, icon }) => (
                  <IconButton
                    key={value}
                    icon={icon}
                    label={label}
                    onClick={() => {
                      runOnEditor((view) => {
                        setTextAlign(value)(view.state, view.dispatch);
                        view.focus();
                      });
                      setSelectedTextAlign(value);
                      setIsAlignMenuOpen(false);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative" ref={fontSizeMenuRef}>
            <input
              className={`${FIELD_CLASS} w-24 pr-7`}
              type="text"
              inputMode="decimal"
              role="combobox"
              aria-label="Font size"
              aria-autocomplete="list"
              aria-controls={FONT_SIZE_LISTBOX_ID}
              aria-expanded={isFontSizeMenuOpen}
              placeholder="Size"
              title="Choose or type a font size in px"
              value={fontSizeInput}
              onFocus={() => setIsFontSizeMenuOpen(true)}
              onChange={(e) => {
                setIsEditingFontSize(true);
                setFontSizeInput(e.target.value);
                setIsFontSizeMenuOpen(true);
              }}
              onBlur={(e) => {
                const nextValue = e.currentTarget.value;
                if (!nextValue.trim()) {
                  setIsEditingFontSize(false);
                  setFontSizeInput(selectionFontSize);
                  return;
                }
                applyFontSize(nextValue);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyFontSize(e.currentTarget.value);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsFontSizeMenuOpen(false);
                  setIsEditingFontSize(false);
                  setFontSizeInput(selectionFontSize);
                }
              }}
            />
            <button
              type="button"
              aria-label="Show font size options"
              aria-haspopup="listbox"
              aria-expanded={isFontSizeMenuOpen}
              className="absolute inset-y-0 right-0 inline-flex w-7 items-center justify-center text-slate-500"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsFontSizeMenuOpen((open) => !open)}
            >
              <ChevronDown size={14} />
            </button>
            {isFontSizeMenuOpen ? (
              <div
                id={FONT_SIZE_LISTBOX_ID}
                role="listbox"
                aria-label="Font size options"
                className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              >
                {FONT_SIZES.map((fs) => (
                  <button
                    key={fs}
                    type="button"
                    role="option"
                    aria-selected={fontSizeInput === fs}
                    className="block w-full px-2 py-1 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      applyFontSize(fs);
                    }}
                  >
                    {fs}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <select
            className={`${FIELD_CLASS} max-w-36`}
            aria-label="Font"
            onChange={(e) => {
              const ff = e.target.value;
              runOnEditor((view) => {
                setTextStyle({ fontFamily: ff })(view.state, view.dispatch);
                view.focus();
              });
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Font
            </option>
            {FONT_FAMILIES.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {allSwatches.map(({ id, label, hex }) => (
              <button
                key={`text-${id}`}
                type="button"
                className={SMALL_SWATCH_BUTTON_CLASS}
                style={{ background: hex }}
                aria-label={`Set text color to ${hex}`}
                title={`Set text color to ${label}: ${hex}`}
                onClick={() =>
                  runOnEditor((view) => {
                    setTextStyle({ color: hex })(view.state, view.dispatch);
                    view.focus();
                  })
                }
              />
            ))}
          </div>
          </div>
        ) : null}
      </header>
      <ColorPaletteModal open={isColorModalOpen} onClose={() => setIsColorModalOpen(false)} />
    </>
  );
}
