import { baseKeymap, splitBlock, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Schema } from "prosemirror-model";
import { wrapInList } from "prosemirror-schema-list";
import type { Command } from "prosemirror-state";
import { Plugin } from "prosemirror-state";
import { boardSchema } from "./schema";
import { buildBoardNodeViews } from "./imageNodeView";

function buildKeymap(schema: Schema) {
  const keys: Record<string, Command> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Shift-Mod-z": redo,
    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-i": toggleMark(schema.marks.em),
    Enter: splitBlock,
  };
  if (schema.nodes.bullet_list) {
    keys["Shift-Ctrl-8"] = wrapInList(schema.nodes.bullet_list);
  }
  return keys;
}

export function buildBoardEditorPlugins(schema: Schema = boardSchema): Plugin[] {
  return [
    history(),
    keymap(buildKeymap(schema)),
    keymap(baseKeymap),
  ];
}

export { buildBoardNodeViews };
