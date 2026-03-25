import type JSZip from "jszip";
import { DEFAULT_BOARD_FILE_NAME } from "../model/boardFileName";
import { parseWhiteboardFileJson, stringifyWhiteboardFile } from "../model/serialize";
import type { WhiteboardFile, ImageAsset } from "../model/types";
import { buildAssetBundlePath, getAssetBlob } from "./assetStore";

const BOARD_MANIFEST_NAME = "whiteboard.json";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isZipPayload(bytes: Uint8Array, name: string): boolean {
  return (
    name.toLowerCase().endsWith(".wbz") ||
    name.toLowerCase().endsWith(".zip") ||
    ZIP_MAGIC.every((value, index) => bytes[index] === value)
  );
}

async function loadZipLib() {
  const module = await import("jszip");
  return module.default;
}

export async function createBoardBundleBlob(file: WhiteboardFile): Promise<Blob> {
  const JSZipLib = await loadZipLib();
  const zip = new JSZipLib();
  zip.file(BOARD_MANIFEST_NAME, stringifyWhiteboardFile(file));

  for (const asset of file.assets) {
    const blob = getAssetBlob(asset.id);
    if (!blob) {
      throw new Error(`Missing image data for asset ${asset.id}`);
    }
    zip.file(buildAssetBundlePath(asset), await blob.arrayBuffer());
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function readBundleAsset(zip: JSZip, asset: ImageAsset): Promise<{ asset: ImageAsset; blob: Blob }> {
  const entry = zip.file(buildAssetBundlePath(asset));
  if (!entry) {
    throw new Error(`Board bundle is missing asset ${asset.id}`);
  }

  return {
    asset,
    blob: await entry.async("blob"),
  };
}

export async function downloadBoardBundle(
  file: WhiteboardFile,
  filename = DEFAULT_BOARD_FILE_NAME,
): Promise<void> {
  const blob = await createBoardBundleBlob(file);
  downloadBlob(blob, filename);
}

export async function readBoardFile(file: File): Promise<{
  file: WhiteboardFile;
  assets: Array<{ asset: ImageAsset; blob: Blob }>;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isZipPayload(bytes, file.name)) {
    const parsed = parseWhiteboardFileJson(new TextDecoder().decode(bytes));
    if (parsed.assets.length > 0) {
      throw new Error("Boards with embedded image assets must be opened from the .wbz bundle.");
    }
    return { file: parsed, assets: [] };
  }

  const JSZipLib = await loadZipLib();
  const zip = await JSZipLib.loadAsync(buffer);
  const manifest = zip.file(BOARD_MANIFEST_NAME);
  if (!manifest) {
    throw new Error("Invalid board bundle: missing whiteboard.json");
  }

  const parsed = parseWhiteboardFileJson(await manifest.async("string"));
  const assets = await Promise.all(parsed.assets.map((asset) => readBundleAsset(zip, asset)));
  return { file: parsed, assets };
}
