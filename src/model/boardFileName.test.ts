import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOARD_FILE_NAME,
  DEFAULT_BOARD_TITLE,
  getBoardDocumentTitle,
  toBoardBundleFileName,
} from "./boardFileName";

describe("boardFileName", () => {
  it("falls back to the default title for unsaved boards", () => {
    expect(getBoardDocumentTitle(null)).toBe(DEFAULT_BOARD_TITLE);
    expect(getBoardDocumentTitle("   ")).toBe(DEFAULT_BOARD_TITLE);
  });

  it("uses the file stem for the document title", () => {
    expect(getBoardDocumentTitle("Project Plan.wbz")).toBe("Project Plan");
    expect(getBoardDocumentTitle("Research Notes.json")).toBe("Research Notes");
  });

  it("normalizes saved boards to wbz bundle names", () => {
    expect(toBoardBundleFileName(null)).toBe(DEFAULT_BOARD_FILE_NAME);
    expect(toBoardBundleFileName("Project Plan")).toBe("Project Plan.wbz");
    expect(toBoardBundleFileName("Project Plan.json")).toBe("Project Plan.wbz");
  });
});
