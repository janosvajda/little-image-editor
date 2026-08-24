import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../drawing/drawingToolCatalog";
import { CanvasDocument } from "../../core/document/imageDocument";
import { GenericToolbar, PersistentDocumentToolbar, ToolbarManager } from "./genericToolbar";

type TestTool = "first" | "second" | "utility";
const selectTools = [
  { id: "first", label: "First", icon: "1", title: "First tool" },
  { id: "second", label: "Second", icon: "2", title: "Second tool" }
] as const satisfies readonly ToolDefinition<TestTool>[];
const buttonTools = [{ id: "utility", label: "Utility", icon: "U", title: "Utility tool" }] as const satisfies readonly ToolDefinition<TestTool>[];

function createToolbar(): GenericToolbar<TestTool> {
  const root = document.createElement("section");
  root.innerHTML = '<label class="control"><span class="icon"></span><select id="futureTool"></select></label><div class="buttons"></div><input id="futureSetting" value="default">';
  document.body.append(root);
  return new GenericToolbar({
    root,
    tools: [...selectTools, ...buttonTools],
    selectGroups: [{ control: root.querySelector(".control")!, icon: root.querySelector(".icon")!, select: root.querySelector("select")!, tools: selectTools, defaultTool: "first" }],
    buttonContainer: root.querySelector(".buttons")!, buttonTools,
    defaultTool: "first"
  });
}

describe("GenericToolbar", () => {
  it("instantiates future tools and persists their controls without toolbar-specific code", () => {
    const toolbar = createToolbar();
    const listener = vi.fn(); toolbar.onSelection(listener);
    expect([...document.querySelector<HTMLSelectElement>("#futureTool")!.options].map(option => option.value)).toEqual(["first", "second"]);
    expect(document.querySelector('[data-tool="utility"]')).not.toBeNull();
    toolbar.select("second");
    const setting = document.querySelector<HTMLInputElement>("#futureSetting")!;
    setting.value = "remembered"; setting.dispatchEvent(new Event("input", { bubbles: true }));
    expect(listener).toHaveBeenCalledWith("second");

    toolbar.options.root.remove();
    const restored = createToolbar();
    expect(restored.activeTool).toBe("second");
    expect(document.querySelector<HTMLInputElement>("#futureSetting")!.value).toBe("remembered");
  });

  it("persists generic control and extra state inside its document", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const root = document.createElement("section");
    root.innerHTML = '<input id="documentSetting" value="default">'; document.body.append(root);
    const toolbar = new PersistentDocumentToolbar<{ base: number }>(root, model, "testToolbar");
    const restored = vi.fn(); toolbar.onRestore(restored);
    model.create({ name: "document", width: 2, height: 2, transparent: true, background: "#fff" });
    const input = root.querySelector<HTMLInputElement>("input")!;
    input.value = "remembered"; input.dispatchEvent(new Event("input", { bubbles: true }));
    toolbar.setExtra({ base: 7 });
    expect(model.toolbarState("testToolbar")).toEqual({ controls: { documentSetting: "remembered" }, extra: { base: 7 } });

    const session = model.snapshotSession();
    const secondRoot = root.cloneNode(true) as HTMLElement; secondRoot.querySelector<HTMLInputElement>("input")!.value = "default"; document.body.append(secondRoot);
    const secondModel = new CanvasDocument(document.createElement("canvas"), document.createElement("canvas"));
    const secondToolbar = new PersistentDocumentToolbar<{ base: number }>(secondRoot, secondModel, "testToolbar");
    const secondRestore = vi.fn(); secondToolbar.onRestore(secondRestore);
    secondModel.restoreSession(session);
    expect(secondRoot.querySelector<HTMLInputElement>("input")!.value).toBe("remembered");
    expect(secondToolbar.extra).toEqual({ base: 7 });
    expect(secondRestore).toHaveBeenCalledWith({ base: 7 });
    secondToolbar.reset();
    expect(secondRoot.querySelector<HTMLInputElement>("input")!.value).toBe("default");
  });

  it("resets a document toolbar when another image is created", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const root = document.createElement("section");
    root.innerHTML = '<input id="documentSetting" value="default"><input id="documentToggle" type="checkbox">';
    document.body.append(root);
    const toolbar = new PersistentDocumentToolbar(root, model, "testToolbar");
    const restored = vi.fn(); toolbar.onRestore(restored);

    model.create({ name: "first", width: 2, height: 2, transparent: true, background: "#fff" });
    const setting = root.querySelector<HTMLInputElement>("#documentSetting")!;
    const toggle = root.querySelector<HTMLInputElement>("#documentToggle")!;
    setting.value = "changed"; setting.dispatchEvent(new Event("input", { bubbles: true }));
    toggle.checked = true; toggle.dispatchEvent(new Event("change", { bubbles: true }));

    model.create({ name: "second", width: 3, height: 3, transparent: true, background: "#fff" });
    expect(setting.value).toBe("default");
    expect(toggle.checked).toBe(false);
    expect(model.toolbarState("testToolbar")).toBeUndefined();
    expect(restored).toHaveBeenLastCalledWith(undefined);
  });

  it("automatically manages every current or future panel", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const futurePanel = document.createElement("section");
    futurePanel.className = "panel"; futurePanel.dataset.panel = "future";
    futurePanel.innerHTML = '<input id="futurePanelValue" value="initial">'; document.body.append(futurePanel);
    const manager = new ToolbarManager(model);
    expect(manager.toolbars.length).toBeGreaterThan(0);
    expect(futurePanel.dataset.toolbarManaged).toBe("true");
    model.create({ name: "managed", width: 2, height: 2, transparent: true, background: "#fff" });
    const input = futurePanel.querySelector<HTMLInputElement>("input")!;
    input.value = "persistent"; input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    expect(model.toolbarState("future")).toEqual({ controls: { futurePanelValue: "persistent" }, extra: undefined });

    model.create({ name: "replacement", width: 3, height: 3, transparent: true, background: "#fff" });
    expect(input.value).toBe("initial");
    expect(model.toolbarState("future")).toBeUndefined();
  });
});
