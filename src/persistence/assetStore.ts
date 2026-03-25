import type { ImageAsset } from "../model/types";

const assetBlobs = new Map<string, Blob>();
const assetObjectUrls = new Map<string, string>();

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

function assertImageMimeType(mimeType: string): void {
  if (!normalizeMimeType(mimeType).startsWith("image/")) {
    throw new Error(`Unsupported image type: ${mimeType || "unknown"}`);
  }
}

async function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to decode image"));
  });
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await waitForImageLoad(image);
    return {
      width: Math.max(1, image.naturalWidth || 1),
      height: Math.max(1, image.naturalHeight || 1),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function revokeAssetUrl(assetId: string): void {
  const objectUrl = assetObjectUrls.get(assetId);
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  assetObjectUrls.delete(assetId);
}

function storeAssetBlob(assetId: string, blob: Blob): void {
  revokeAssetUrl(assetId);
  assetBlobs.set(assetId, blob);
}

export function extensionFromMimeType(mimeType: string): string {
  switch (normalizeMimeType(mimeType)) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    default:
      return "bin";
  }
}

export function buildAssetBundlePath(asset: ImageAsset): string {
  return `assets/${asset.id}.${extensionFromMimeType(asset.mimeType)}`;
}

export async function registerImageBlob(
  blob: Blob,
  options: { assetId?: string; mimeType?: string } = {},
): Promise<ImageAsset> {
  const mimeType = normalizeMimeType(options.mimeType || blob.type || "image/png");
  assertImageMimeType(mimeType);
  const assetId = options.assetId ?? crypto.randomUUID();
  const normalizedBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType);
  const dimensions = await readImageDimensions(normalizedBlob);
  storeAssetBlob(assetId, normalizedBlob);
  return {
    id: assetId,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function importImageAsset(asset: ImageAsset, blob: Blob): void {
  assertImageMimeType(asset.mimeType);
  const normalizedBlob = blob.type === asset.mimeType ? blob : blob.slice(0, blob.size, asset.mimeType);
  storeAssetBlob(asset.id, normalizedBlob);
}

export function replaceAssetStore(assets: Array<{ asset: ImageAsset; blob: Blob }>): void {
  clearAssetStore();
  for (const { asset, blob } of assets) {
    importImageAsset(asset, blob);
  }
}

export function clearAssetStore(): void {
  for (const assetId of assetObjectUrls.keys()) {
    revokeAssetUrl(assetId);
  }
  assetBlobs.clear();
}

export function getAssetBlob(assetId: string): Blob | null {
  return assetBlobs.get(assetId) ?? null;
}

export function getAssetUrl(assetId: string): string | null {
  const blob = assetBlobs.get(assetId);
  if (!blob) return null;
  let objectUrl = assetObjectUrls.get(assetId);
  if (!objectUrl) {
    objectUrl = URL.createObjectURL(blob);
    assetObjectUrls.set(assetId, objectUrl);
  }
  return objectUrl;
}
