import { useWhiteboardStore } from "../store/whiteboardStore";

/** Dev-only: box count for quick perf sanity checks. */
export function DevPerfOverlay() {
  const boxCount = useWhiteboardStore((s) => Object.keys(s.boxesById).length);
  const linkCount = useWhiteboardStore((s) => s.links.length);
  if (!import.meta.env.DEV) return null;
  return (
    <div
      className="pointer-events-none absolute right-2 bottom-2 z-20 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white"
      aria-hidden
    >
      {boxCount} boxes · {linkCount} links
    </div>
  );
}
