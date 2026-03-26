import {
  FilePlus,
  FolderOpen,
  ImagePlus,
  Link2,
  MousePointer2,
  Redo2,
  Save,
  SquarePlus,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { BoardTool } from "../../store/whiteboardStore";

export type PreMenuSlotConfig = {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
};

export function buildPreMenuSlotConfig(p: {
  selectedBoxId: string | null;
  tool: BoardTool;
  newBoard: () => void;
  onOpenPick: () => void;
  onSave: () => void;
  undo: () => void;
  redo: () => void;
  addBox: (w: number, h: number) => void;
  onPickImage: () => void;
  deleteSelectedBox: () => void;
  setTool: (t: BoardTool) => void;
}): PreMenuSlotConfig[] {
  const slots: PreMenuSlotConfig[] = [
    { key: "pre-new", icon: FilePlus, label: "New board", onClick: () => p.newBoard() },
    { key: "pre-open", icon: FolderOpen, label: "Open board", onClick: p.onOpenPick },
    { key: "pre-save", icon: Save, label: "Save board", onClick: () => void p.onSave() },
    { key: "pre-undo", icon: Undo2, label: "Undo", onClick: () => p.undo() },
    { key: "pre-redo", icon: Redo2, label: "Redo", onClick: () => p.redo() },
    { key: "pre-add-box", icon: SquarePlus, label: "Add box", onClick: () => p.addBox(320, 240) },
    { key: "pre-add-image", icon: ImagePlus, label: "Add image", onClick: p.onPickImage },
  ];

  if (p.selectedBoxId) {
    slots.push({
      key: "pre-delete-box",
      icon: Trash2,
      label: "Delete selected box",
      onClick: () => p.deleteSelectedBox(),
      className: "text-rose-600 hover:bg-rose-50",
    });
  }

  slots.push(
    {
      key: "pre-select",
      icon: MousePointer2,
      label: "Select tool",
      active: p.tool === "select",
      onClick: () => p.setTool("select"),
    },
    {
      key: "pre-link",
      icon: Link2,
      label: "Link tool",
      active: p.tool === "link",
      onClick: () => p.setTool("link"),
    },
  );

  return slots;
}
