import { NodeSelection } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { getAssetUrl } from "../persistence/assetStore";

type GetPos = boolean | (() => number | undefined);

function toDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function resolveNodePos(getPos: GetPos): number | null {
  if (typeof getPos !== "function") return null;
  const pos = getPos();
  return typeof pos === "number" ? pos : null;
}

function selectNode(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
  view.dispatch(tr);
}

function updateImageElement(image: HTMLImageElement, node: ProseMirrorNode): void {
  const width = toDimension(node.attrs.width);
  const height = toDimension(node.attrs.height);
  image.className = "wb-inline-image";
  image.src = getAssetUrl(node.attrs.assetId) ?? "";
  image.alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  image.draggable = false;
  image.style.width = width ? `${width}px` : "";
  image.style.height = height ? `${height}px` : "";
}

class BoardImageNodeView implements NodeView {
  node: ProseMirrorNode;
  view: EditorView;
  getPos: GetPos;
  dom: HTMLSpanElement;

  private imageEl: HTMLImageElement;
  private handleEl: HTMLButtonElement;
  private cleanupResize: (() => void) | null = null;

  constructor(node: ProseMirrorNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("span");
    this.dom.className = "wb-inline-image-node";
    this.dom.contentEditable = "false";

    this.imageEl = document.createElement("img");
    this.handleEl = document.createElement("button");
    this.handleEl.type = "button";
    this.handleEl.className = "wb-inline-image-handle";
    this.handleEl.setAttribute("aria-label", "Resize image");

    this.dom.append(this.imageEl, this.handleEl);
    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.dom.addEventListener("click", this.handleClick);
    this.handleEl.addEventListener("pointerdown", this.handleHandlePointerDown);

    updateImageElement(this.imageEl, node);
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    updateImageElement(this.imageEl, node);
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("is-selected");
  }

  deselectNode(): void {
    this.dom.classList.remove("is-selected");
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Node ? this.dom.contains(target) : false;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.cleanupResize?.();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.removeEventListener("click", this.handleClick);
    this.handleEl.removeEventListener("pointerdown", this.handleHandlePointerDown);
  }

  private handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    const pos = resolveNodePos(this.getPos);
    if (pos === null) return;
    selectNode(this.view, pos);
  };

  private handleClick = (event: MouseEvent) => {
    event.preventDefault();
    const pos = resolveNodePos(this.getPos);
    if (pos === null) return;
    selectNode(this.view, pos);
  };

  private handleHandlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const pos = resolveNodePos(this.getPos);
    if (pos === null) return;
    selectNode(this.view, pos);

    const startWidth =
      toDimension(this.node.attrs.width) ?? (Math.round(this.imageEl.getBoundingClientRect().width) || 160);
    const startHeight =
      toDimension(this.node.attrs.height) ??
      (Math.round(this.imageEl.getBoundingClientRect().height) || startWidth);
    const minScale = Math.max(48 / startWidth, 48 / startHeight);
    const startX = event.clientX;
    const startY = event.clientY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const widthScale = (startWidth + dx) / startWidth;
      const heightScale = (startHeight + dy) / startHeight;
      const scale = Math.max(minScale, widthScale, heightScale);
      const nextWidth = Math.max(48, Math.round(startWidth * scale));
      const nextHeight = Math.max(48, Math.round(startHeight * scale));
      const currentPos = resolveNodePos(this.getPos);
      if (currentPos === null) return;
      this.dispatchNodeAttrs(currentPos, {
        ...this.node.attrs,
        width: nextWidth,
        height: nextHeight,
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      this.cleanupResize = null;
    };

    this.cleanupResize?.();
    this.cleanupResize = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  private dispatchNodeAttrs(pos: number, attrs: Record<string, unknown>): void {
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, attrs);
    this.view.dispatch(tr);
  }
}

export function buildBoardNodeViews(): Record<
  string,
  (node: ProseMirrorNode, view: EditorView, getPos: GetPos) => NodeView
> {
  return {
    image(node, view, getPos) {
      return new BoardImageNodeView(node, view, getPos);
    },
  };
}
