const BOARD_FILE_EXTENSIONS = [".wbz", ".zip", ".json"] as const;

export const DEFAULT_BOARD_TITLE = "Brainstorm WhiteBoard";
export const DEFAULT_BOARD_FILE_NAME = `${DEFAULT_BOARD_TITLE}.wbz`;

function stripKnownBoardFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lowered = trimmed.toLowerCase();
  const extension = BOARD_FILE_EXTENSIONS.find((candidate) => lowered.endsWith(candidate));
  return extension ? trimmed.slice(0, -extension.length) : trimmed;
}

export function getBoardDocumentTitle(fileName: string | null | undefined): string {
  const trimmed = fileName?.trim();
  if (!trimmed) return DEFAULT_BOARD_TITLE;
  const baseName = stripKnownBoardFileExtension(trimmed).trim();
  return baseName || DEFAULT_BOARD_TITLE;
}

export function toBoardBundleFileName(fileName: string | null | undefined): string {
  const trimmed = fileName?.trim();
  if (!trimmed) return DEFAULT_BOARD_FILE_NAME;
  const baseName = stripKnownBoardFileExtension(trimmed).trim();
  return `${baseName || DEFAULT_BOARD_TITLE}.wbz`;
}
