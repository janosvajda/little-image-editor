import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { DrawingController } from "./drawingController";

function setupController(): { model: CanvasDocument; controller: DrawingController } {
  const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
  return { model, controller: new DrawingController(model) };
}

function resetMarkup(): void {
  const html = readFileSync(resolve("src/editor.html"), "utf8").replace(/<script[\s\S]*?<\/script>/, "");
  document.open(); document.write(html); document.close();
}

describe("DrawingController preferences", () => {
  it("restores the active tool and all drawing controls without replacing the chosen color", () => {
    const source = setupController();
    source.controller.setInitialColor("light");
    source.model.create({ name: "first", width: 4, height: 4, transparent: true, background: "#fff" });
    source.controller.select("highlighter");
    const change = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    change("#colorInput", "#123456");
    change("#sizeInput", "47");
    change("#opacityInput", "64");
    change("#hardnessInput", "72");
    const fill = document.querySelector<HTMLInputElement>("#fillInput")!;
    fill.checked = true; fill.dispatchEvent(new Event("change", { bubbles: true }));

    const session = source.model.snapshotSession();
    resetMarkup();
    const restored = setupController();
    restored.controller.setInitialColor("light");
    restored.model.restoreSession(session);
    expect(document.querySelector<HTMLSelectElement>("#paintToolSelect")!.value).toBe("highlighter");
    expect(document.querySelector("#paintToolControl")!.classList).toContain("active");
    expect(document.querySelector<HTMLInputElement>("#colorInput")!.value).toBe("#123456");
    expect(document.querySelector<HTMLInputElement>("#sizeInput")!.value).toBe("47");
    expect(document.querySelector<HTMLInputElement>("#opacityInput")!.value).toBe("64");
    expect(document.querySelector<HTMLInputElement>("#hardnessInput")!.value).toBe("72");
    expect(document.querySelector<HTMLInputElement>("#fillInput")!.checked).toBe(true);
  });

  it("resets tool state for a newly created image", () => {
    const subject = setupController();
    subject.controller.setInitialColor("light");
    subject.model.create({ name: "first", width: 4, height: 4, transparent: true, background: "#fff" });
    subject.controller.select("marker");
    const color = document.querySelector<HTMLInputElement>("#colorInput")!;
    color.value = "#123456"; color.dispatchEvent(new Event("input", { bubbles: true }));
    subject.model.create({ name: "second", width: 4, height: 4, transparent: true, background: "#fff" });
    expect(document.querySelector<HTMLSelectElement>("#paintToolSelect")!.value).toBe("brush");
    expect(color.value).toBe("#000000");
  });
});
