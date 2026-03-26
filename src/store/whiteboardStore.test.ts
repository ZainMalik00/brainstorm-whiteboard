import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyRuntime } from "../model/whiteboardFactory";
import { useWhiteboardStore } from "./whiteboardStore";

function resetStore() {
  const runtime = createEmptyRuntime();
  const lastSavedCoreJson = JSON.stringify({
    viewport: runtime.viewport,
    palette: runtime.palette,
    assetsById: runtime.assetsById,
    boxesById: runtime.boxesById,
    links: runtime.links,
  });
  useWhiteboardStore.setState({
    ...runtime,
    selectedBoxId: null,
    selectedLinkId: null,
    tool: "select",
    linkSourceId: null,
    boardFileName: null,
    lastSavedCoreJson,
    past: [],
    future: [],
  });
}

describe("whiteboardStore palette actions", () => {
  beforeEach(() => {
    resetStore();
  });

  it("adds, updates, and removes palette colors with duplicate guarding", () => {
    useWhiteboardStore.getState().addCustomColor("#abc");
    expect(useWhiteboardStore.getState().palette.custom).toEqual(["#aabbcc"]);

    useWhiteboardStore.getState().addCustomColor("#aabbcc");
    expect(useWhiteboardStore.getState().palette.custom).toEqual(["#aabbcc"]);

    useWhiteboardStore.getState().setNamedColor("box1", "#123456");
    expect(useWhiteboardStore.getState().palette.named.box1).toBe("#123456");

    useWhiteboardStore.getState().setNamedColor("box1", "#aabbcc");
    expect(useWhiteboardStore.getState().palette.named.box1).toBe("#123456");

    useWhiteboardStore.getState().updateCustomColor(0, "#654321");
    expect(useWhiteboardStore.getState().palette.custom).toEqual(["#654321"]);

    useWhiteboardStore.getState().removeNamedColor("box2");
    expect(useWhiteboardStore.getState().palette.named.box2).toBeUndefined();

    useWhiteboardStore.getState().removeCustomColor(0);
    expect(useWhiteboardStore.getState().palette.custom).toEqual([]);
  });

  it("creates new boxes and links with the current palette colors", () => {
    useWhiteboardStore.getState().setNamedColor("box1", "#123456");
    useWhiteboardStore.getState().setNamedColor("stroke", "#654321");
    useWhiteboardStore.getState().setNamedColor("text", "#112233");
    useWhiteboardStore.getState().setNamedColor("link", "#334455");

    useWhiteboardStore.getState().addBox(40, 50);
    useWhiteboardStore.getState().addBox(180, 200);

    const boxes = Object.values(useWhiteboardStore.getState().boxesById);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].style.fill).toBe("#123456");
    expect(boxes[0].style.stroke).toBe("#654321");
    if (boxes[0].kind !== "text") throw new Error("Expected a text box");
    expect(boxes[0].style.textColor).toBe("#112233");

    useWhiteboardStore.getState().addLink(boxes[0].id, boxes[1].id);
    expect(useWhiteboardStore.getState().links[0].style.stroke).toBe("#334455");
  });
});
