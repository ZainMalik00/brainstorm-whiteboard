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
    selectedBoxIds: [],
    selectedLinkId: null,
    tool: "select",
    linkSourceId: null,
    boardFileName: null,
    lastSavedCoreJson,
    past: [],
    future: [],
    lastBoxDefaults: {},
    viewportSize: { width: 0, height: 0 },
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

describe("whiteboardStore multi-selection actions", () => {
  beforeEach(() => {
    resetStore();
  });

  it("supports shift-click style toggle and additive selection", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(50, 50);
    useWhiteboardStore.getState().addBox(100, 100);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    expect(ids).toHaveLength(3);

    useWhiteboardStore.getState().selectBoxes([ids[0]]);
    expect(useWhiteboardStore.getState().selectedBoxIds).toEqual([ids[0]]);

    useWhiteboardStore.getState().toggleBoxInSelection(ids[1]);
    expect(useWhiteboardStore.getState().selectedBoxIds).toEqual([ids[0], ids[1]]);

    useWhiteboardStore.getState().toggleBoxInSelection(ids[0]);
    expect(useWhiteboardStore.getState().selectedBoxIds).toEqual([ids[1]]);

    useWhiteboardStore.getState().addBoxesToSelection([ids[0], ids[2]]);
    expect([...useWhiteboardStore.getState().selectedBoxIds].sort()).toEqual([...ids].sort());
  });

  it("deletes all selected boxes in one undo step", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(50, 50);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().selectBoxes(ids);
    useWhiteboardStore.getState().deleteSelectedBoxes();
    expect(Object.keys(useWhiteboardStore.getState().boxesById)).toHaveLength(0);
    expect(useWhiteboardStore.getState().selectedBoxIds).toEqual([]);

    useWhiteboardStore.getState().undo();
    expect(Object.keys(useWhiteboardStore.getState().boxesById)).toHaveLength(2);
  });

  it("duplicates selected boxes with an offset", () => {
    useWhiteboardStore.getState().addBox(10, 20);
    const [originalId] = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().selectBoxes([originalId]);
    useWhiteboardStore.getState().duplicateSelectedBoxes();

    const boxes = Object.values(useWhiteboardStore.getState().boxesById);
    expect(boxes).toHaveLength(2);
    const dup = boxes.find((b) => b.id !== originalId);
    expect(dup).toBeDefined();
    expect(dup!.x).toBeGreaterThan(10);
    expect(dup!.y).toBeGreaterThan(20);
    expect(useWhiteboardStore.getState().selectedBoxIds).toEqual([dup!.id]);
  });

  it("commits multi-box position updates in a single undo step", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(100, 100);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().commitMultiBoxPositions([
      { id: ids[0], x: 10, y: 10 },
      { id: ids[1], x: 110, y: 110 },
    ]);
    const boxes = useWhiteboardStore.getState().boxesById;
    expect(boxes[ids[0]].x).toBe(10);
    expect(boxes[ids[1]].y).toBe(110);

    useWhiteboardStore.getState().undo();
    const reverted = useWhiteboardStore.getState().boxesById;
    expect(reverted[ids[0]].x).toBe(0);
    expect(reverted[ids[1]].y).toBe(100);
  });
});

describe("whiteboardStore last-box-defaults", () => {
  beforeEach(() => {
    resetStore();
  });

  it("records fill/stroke/textColor from updateBoxStyle and applies to new boxes", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    const [firstId] = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().updateBoxStyle(firstId, { fill: "#abcdef", textColor: "#123123" });
    expect(useWhiteboardStore.getState().lastBoxDefaults.fill).toBe("#abcdef");
    expect(useWhiteboardStore.getState().lastBoxDefaults.textColor).toBe("#123123");

    useWhiteboardStore.getState().addBox(200, 200);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    const newBox = useWhiteboardStore.getState().boxesById[ids[1]];
    expect(newBox.style.fill).toBe("#abcdef");
    if (newBox.kind !== "text") throw new Error("Expected a text box");
    expect(newBox.style.textColor).toBe("#123123");
  });

  it("resets lastBoxDefaults on newBoard", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    const [id] = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().updateBoxStyle(id, { fill: "#aabbcc" });
    useWhiteboardStore.getState().recordLastTextStyle({ fontSize: "20px", fontFamily: "Arial" });
    expect(useWhiteboardStore.getState().lastBoxDefaults.fill).toBe("#aabbcc");
    expect(useWhiteboardStore.getState().lastBoxDefaults.fontSize).toBe("20px");

    useWhiteboardStore.getState().newBoard();
    expect(useWhiteboardStore.getState().lastBoxDefaults).toEqual({});
  });

  it("adopts the style of a single-selected box into lastBoxDefaults", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(200, 200);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().updateBoxStyle(ids[0], { fill: "#ff8800", textColor: "#222" });
    useWhiteboardStore.getState().updateBoxStyle(ids[1], { fill: "#0088ff", textColor: "#eee" });

    // Select the second box; defaults should adopt its style.
    useWhiteboardStore.getState().selectBoxes([ids[1]]);
    expect(useWhiteboardStore.getState().lastBoxDefaults.fill).toBe("#0088ff");
    expect(useWhiteboardStore.getState().lastBoxDefaults.textColor).toBe("#eee");

    // A subsequent addBox should inherit those colors.
    useWhiteboardStore.getState().addBox(400, 400);
    const allIds = Object.keys(useWhiteboardStore.getState().boxesById);
    const newId = allIds.find((id) => id !== ids[0] && id !== ids[1])!;
    const newBox = useWhiteboardStore.getState().boxesById[newId];
    expect(newBox.style.fill).toBe("#0088ff");
    if (newBox.kind !== "text") throw new Error("Expected a text box");
    expect(newBox.style.textColor).toBe("#eee");
  });

  it("does NOT overwrite lastBoxDefaults on multi-selection", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(200, 200);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().updateBoxStyle(ids[0], { fill: "#aaa111" });
    useWhiteboardStore.getState().updateBoxStyle(ids[1], { fill: "#bbb222" });
    // Last single-update set fill to "#bbb222"; multi-select should leave that intact.
    useWhiteboardStore.getState().selectBoxes(ids);
    expect(useWhiteboardStore.getState().lastBoxDefaults.fill).toBe("#bbb222");
  });
});

describe("whiteboardStore copy/paste with links", () => {
  beforeEach(() => {
    resetStore();
  });

  it("duplicate preserves incident links between selected boxes", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(200, 0);
    useWhiteboardStore.getState().addBox(400, 0);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().addLink(ids[0], ids[1]); // incident: both selected
    useWhiteboardStore.getState().addLink(ids[1], ids[2]); // dangling: only one selected

    useWhiteboardStore.getState().selectBoxes([ids[0], ids[1]]);
    useWhiteboardStore.getState().duplicateSelectedBoxes();

    const links = useWhiteboardStore.getState().links;
    // 2 originals + 1 duplicated (incident only)
    expect(links).toHaveLength(3);
    const newSelection = useWhiteboardStore.getState().selectedBoxIds;
    expect(newSelection).toHaveLength(2);
    const newLink = links.find(
      (l) => newSelection.includes(l.fromBoxId) && newSelection.includes(l.toBoxId),
    );
    expect(newLink).toBeDefined();
    expect(newLink!.fromBoxId).not.toBe(ids[0]);
    expect(newLink!.toBoxId).not.toBe(ids[1]);
  });

  it("duplicate drops dangling links whose endpoint is not selected", () => {
    useWhiteboardStore.getState().addBox(0, 0);
    useWhiteboardStore.getState().addBox(200, 0);
    const ids = Object.keys(useWhiteboardStore.getState().boxesById);
    useWhiteboardStore.getState().addLink(ids[0], ids[1]);

    useWhiteboardStore.getState().selectBoxes([ids[0]]); // only one endpoint
    useWhiteboardStore.getState().duplicateSelectedBoxes();

    const links = useWhiteboardStore.getState().links;
    // Just the original link; no new link added because the duplicate has no incident links.
    expect(links).toHaveLength(1);
    // 3 boxes total now (2 originals + 1 duplicate).
    expect(Object.keys(useWhiteboardStore.getState().boxesById)).toHaveLength(3);
  });
});
