import type { ProseMirrorDocJSON } from "./types";

/** Must stay in sync with `boardSchema` in `src/editor/schema.ts`. */
export const EMPTY_DOC_JSON: ProseMirrorDocJSON = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
