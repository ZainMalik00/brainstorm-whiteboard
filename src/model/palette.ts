import {
  DEFAULT_BOX_STYLE,
  DEFAULT_LINK_STYLE,
  DEFAULT_PALETTE,
  type BoxStyle,
  type LinkStyle,
  type Palette,
} from "./types";

export type PaletteSelection =
  | { kind: "named"; key: string }
  | { kind: "custom"; index: number };

export type PaletteEntry = PaletteSelection & {
  id: string;
  label: string;
  hex: string;
};

const NAMED_COLOR_LABELS: Record<string, string> = {
  box1: "Box 1",
  box2: "Box 2",
  box3: "Box 3",
  box4: "Box 4",
  text: "Text",
  accent: "Accent",
  stroke: "Stroke",
  link: "Link",
};

const NAMED_COLOR_ORDER = Object.keys(DEFAULT_PALETTE.named);
const COLOR_VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/i;

function expandShorthandHex(value: string): string {
  const [, r, g, b] = value;
  return `#${r}${r}${g}${g}${b}${b}`;
}

function readColorString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizePaletteHex(trimmed) ?? trimmed;
}

function isIgnoredSelection(ignore: PaletteSelection | undefined, selection: PaletteSelection): boolean {
  if (!ignore || ignore.kind !== selection.kind) return false;
  if (ignore.kind === "named" && selection.kind === "named") {
    return ignore.key === selection.key;
  }
  if (ignore.kind === "custom" && selection.kind === "custom") {
    return ignore.index === selection.index;
  }
  return false;
}

function compareNamedKeys(a: string, b: string): number {
  const ai = NAMED_COLOR_ORDER.indexOf(a);
  const bi = NAMED_COLOR_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

function resolveColorVariable(name: string, palette: Palette): string | null {
  switch (name) {
    case "--wb-box-fill":
      return getNamedPaletteColor(palette, "box1");
    case "--wb-box-stroke":
      return getNamedPaletteColor(palette, "stroke");
    case "--wb-link-stroke":
      return getNamedPaletteColor(palette, "link");
    case "--wb-text":
      return getNamedPaletteColor(palette, "text");
    default:
      break;
  }

  if (name.startsWith("--wb-palette-custom-")) {
    const index = Number(name.slice("--wb-palette-custom-".length));
    if (!Number.isInteger(index) || index < 0) return null;
    return readColorString(palette.custom[index]);
  }

  if (name.startsWith("--wb-palette-")) {
    return getNamedPaletteColor(palette, name.slice("--wb-palette-".length));
  }

  return null;
}

export function normalizePaletteHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) return expandShorthandHex(trimmed.toLowerCase());
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function clonePalette(palette: Palette): Palette {
  const named: Record<string, string> = {};
  const sourceNamed =
    palette && typeof palette.named === "object" && palette.named !== null
      ? (palette.named as Record<string, unknown>)
      : {};

  for (const [key, value] of Object.entries(sourceNamed)) {
    const color = readColorString(value);
    if (color) named[key] = color;
  }

  const custom = Array.isArray(palette.custom)
    ? palette.custom
        .map((value) => readColorString(value))
        .filter((value): value is string => value !== null)
    : [];

  return { named, custom };
}

export function formatPaletteLabel(key: string): string {
  if (NAMED_COLOR_LABELS[key]) return NAMED_COLOR_LABELS[key];
  return key
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/^./, (match) => match.toUpperCase());
}

export function getNamedPaletteColor(palette: Palette | undefined, key: string): string {
  const paletteColor = readColorString(palette?.named?.[key]);
  if (paletteColor) return paletteColor;
  const fallbackColor = readColorString(DEFAULT_PALETTE.named[key as keyof typeof DEFAULT_PALETTE.named]);
  return fallbackColor ?? "#000000";
}

export function getDefaultBoxStyle(palette?: Palette): BoxStyle {
  return {
    fill: getNamedPaletteColor(palette, "box1"),
    stroke: getNamedPaletteColor(palette, "stroke"),
    borderRadius: DEFAULT_BOX_STYLE.borderRadius,
    textColor: getNamedPaletteColor(palette, "text"),
  };
}

export function getDefaultLinkStyle(palette?: Palette): LinkStyle {
  return {
    stroke: getNamedPaletteColor(palette, "link"),
    strokeWidth: DEFAULT_LINK_STYLE.strokeWidth,
  };
}

export function getPaletteEntries(palette: Palette): PaletteEntry[] {
  const namedEntries = Object.entries(palette.named)
    .sort(([a], [b]) => compareNamedKeys(a, b))
    .map(([key, hex]) => ({
      id: `named:${key}`,
      kind: "named" as const,
      key,
      label: formatPaletteLabel(key),
      hex,
    }));

  const customEntries = palette.custom.map((hex, index) => ({
    id: `custom:${index}`,
    kind: "custom" as const,
    index,
    label: `Custom ${index + 1}`,
    hex,
  }));

  return [...namedEntries, ...customEntries];
}

export function paletteHasHex(
  palette: Palette,
  hex: string,
  ignore?: PaletteSelection,
): boolean {
  const normalized = normalizePaletteHex(hex);
  if (!normalized) return false;

  for (const [key, value] of Object.entries(palette.named)) {
    if (isIgnoredSelection(ignore, { kind: "named", key })) continue;
    if (normalizePaletteHex(value) === normalized) return true;
  }

  for (const [index, value] of palette.custom.entries()) {
    if (isIgnoredSelection(ignore, { kind: "custom", index })) continue;
    if (normalizePaletteHex(value) === normalized) return true;
  }

  return false;
}

export function resolveStoredColor(
  color: string | null | undefined,
  palette: Palette,
  fallbackColor: string,
): string {
  const normalizedHex = normalizePaletteHex(color);
  if (normalizedHex) return normalizedHex;

  const raw = readColorString(color);
  if (!raw) return fallbackColor;
  if (raw.startsWith("rgb") || raw.startsWith("hsl")) return raw;

  const match = raw.match(COLOR_VAR_RE);
  if (!match) return raw;

  const [, varName, fallback] = match;
  const resolved = resolveColorVariable(varName, palette);
  if (resolved) return resolved;
  if (fallback) return resolveStoredColor(fallback, palette, fallbackColor);
  return fallbackColor;
}
