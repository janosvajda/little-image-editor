import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const validPng = readFileSync("src/assets/images/extensionIcon.png");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const name = document.querySelector<HTMLInputElement>("#newImageName");
      if (name) name.value = "e2e-image";
    });
  });
});

test("loads the official splash and application icon", async ({ page }) => {
  await page.goto("/");

  const splashResponse = await page.request.get("/assets/images/splashScreen.png");
  expect(splashResponse.ok()).toBe(true);
  expect(splashResponse.headers()["content-type"]).toBe("image/png");

  const iconUrl = await page.locator(".app-mark .logo").evaluate(element => {
    const match = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    return match?.[1] ?? "";
  });
  expect(iconUrl).not.toBe("");
  const iconResponse = await page.request.get(iconUrl);
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toBe("image/png");
  const emptyIconUrl = await page.locator(".drop-icon").evaluate(element => {
    const match = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    return match?.[1] ?? "";
  });
  expect(emptyIconUrl).toContain("extensionIcon.png");
  expect((await page.request.get(emptyIconUrl)).ok()).toBe(true);

  await expect(page.locator('[data-panel="tools"]')).toBeVisible();
  await expect(page.locator('[data-panel="effects"]')).toBeVisible();
  await expect(page.locator('[data-panel="adjust"]')).toBeHidden();
  await expect(page.locator('[data-panel="transform"]')).toBeHidden();
  const initialTools = await page.locator('[data-panel="tools"]').boundingBox();
  const initialEffects = await page.locator('[data-panel="effects"]').boundingBox();
  expect(initialTools!.x + initialTools!.width <= initialEffects!.x || initialEffects!.x + initialEffects!.width <= initialTools!.x || initialTools!.y + initialTools!.height <= initialEffects!.y || initialEffects!.y + initialEffects!.height <= initialTools!.y).toBe(true);
  await page.locator("#toolbarPickerButton").click();
  const pickerButton = await page.locator("#toolbarPickerButton").boundingBox();
  const pickerList = await page.locator(".toolbar-visibility").boundingBox();
  expect(Math.abs(pickerList!.x - pickerButton!.x)).toBeLessThanOrEqual(1);
  await page.getByLabel("Adjust", { exact: true }).check();
  await page.getByLabel("Transform", { exact: true }).check();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

  const adjust = await page.locator('[data-panel="adjust"]').boundingBox();
  const effects = await page.locator('[data-panel="effects"]').boundingBox();
  const transform = await page.locator('[data-panel="transform"]').boundingBox();
  expect(adjust).not.toBeNull();
  expect(effects).not.toBeNull();
  expect(transform).not.toBeNull();
  const overlaps = (first: NonNullable<typeof adjust>, second: NonNullable<typeof adjust>) =>
    first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;
  expect(overlaps(adjust!, effects!)).toBe(false);
  expect(overlaps(adjust!, transform!)).toBe(false);
  expect(overlaps(effects!, transform!)).toBe(false);
});

test("restores adjustment controls and matching pixels after reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  const brightness = page.locator("#brightnessInput");
  await brightness.evaluate(input => {
    input.value = "-69";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const pixelBeforeReload = await page.locator("#canvas").evaluate(canvas =>
    (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0]
  );

  await page.reload();
  await expect(page.locator("#startupSplash")).toBeHidden();
  await expect(brightness).toHaveValue("-69");
  expect((await page.locator(".horizontal-ruler").boundingBox())!.width).toBeGreaterThan(500);
  expect((await page.locator(".vertical-ruler").boundingBox())!.height).toBeGreaterThan(300);
  expect(await page.locator("#canvas").evaluate(canvas =>
    (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0]
  )).toBe(pixelBeforeReload);
});

test("keeps canvas zoom and ruler measurements synchronized", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  await page.locator("#zoomSelect").selectOption("200");
  await page.locator("#rulerUnitSelect").selectOption("mm");

  await expect(page.locator("#zoomLabel")).toHaveText("200%");
  await expect(page.locator(".canvas-stage")).toHaveCSS("width", "1600px");
  await expect(page.locator(".ruler-corner")).toHaveText("mm");
  expect(await page.locator(".horizontal-ruler .ruler-tick").count()).toBeGreaterThan(1);

  await page.locator("#canvasWrap").evaluate(wrap => {
    wrap.scrollLeft = 300;
    wrap.scrollTop = 200;
    wrap.dispatchEvent(new Event("scroll"));
  });
  const wrapBounds = await page.locator("#canvasWrap").boundingBox();
  const horizontalBounds = await page.locator(".horizontal-ruler").boundingBox();
  const verticalBounds = await page.locator(".vertical-ruler").boundingBox();
  const corner = page.locator(".ruler-corner");
  const cornerBounds = await corner.boundingBox();
  expect(Math.abs(horizontalBounds!.y - wrapBounds!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(verticalBounds!.x - wrapBounds!.x)).toBeLessThanOrEqual(1);
  await expect(corner).toHaveText("mm");
  await expect(corner).toHaveCSS("z-index", "3");
  await expect(page.locator(".horizontal-ruler")).toHaveCSS("clip-path", "none");
  await expect(page.locator(".vertical-ruler")).toHaveCSS("clip-path", "none");
  expect(Math.abs(cornerBounds!.x - wrapBounds!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(cornerBounds!.y - wrapBounds!.y)).toBeLessThanOrEqual(1);

  await page.locator('[data-tool="zoom"]').click();
  await expect(page.locator('[data-tool="zoom"]')).toHaveClass(/active/);
  await expect(page.locator(".zoom-tool-options")).toBeVisible();
  await expect(page.locator(".zoom-tool-options button")).toHaveCount(4);
  const canvasBox = await page.locator("#overlay").boundingBox();
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: canvasBox!.x + 20, clientY: canvasBox!.y + 20 });
  await expect(page.locator("#zoomLabel")).toHaveText("300%");
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: canvasBox!.x + 20, clientY: canvasBox!.y + 20, altKey: true });
  await expect(page.locator("#zoomLabel")).toHaveText("200%");

  await page.locator("#rulerToggleButton").click();
  await expect(page.locator(".canvas-viewport")).toHaveClass(/rulers-hidden/);
});

test("keeps edit pixel math independent from 200% zoom", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  await page.locator("#zoomSelect").selectOption("200");
  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();

  await page.locator('[data-tool="crop"]').click();
  await overlay.dispatchEvent("pointerdown", { clientX: bounds!.x + bounds!.width * .25, clientY: bounds!.y + bounds!.height * .25, pointerId: 1 });
  await overlay.dispatchEvent("pointerup", { clientX: bounds!.x + bounds!.width * .75, clientY: bounds!.y + bounds!.height * .75, pointerId: 1 });
  await page.locator("#applyCropButton").click();
  await expect(page.locator("#dimensions")).toHaveText("400 × 300 px");
  await expect(page.locator(".canvas-stage")).toHaveCSS("width", "800px");
  await expect(page.locator(".canvas-stage")).toHaveCSS("height", "600px");

  await page.locator("#toolbarPickerButton").click();
  await page.getByLabel("Transform", { exact: true }).check();
  await page.locator("#widthInput").fill("200");
  await page.locator("#heightInput").fill("100");
  await page.locator("#resizeButton").click();
  await expect(page.locator("#dimensions")).toHaveText("200 × 100 px");
  await expect(page.locator(".canvas-stage")).toHaveCSS("width", "400px");
  await page.locator("#rotateRightButton").click();
  await expect(page.locator("#dimensions")).toHaveText("100 × 200 px");
  await expect(page.locator(".canvas-stage")).toHaveCSS("width", "200px");
  await expect(page.locator(".canvas-stage")).toHaveCSS("height", "400px");

  await page.locator("#undoButton").click();
  await expect(page.locator("#dimensions")).toHaveText("200 × 100 px");
  await expect(page.locator("#zoomLabel")).toHaveText("200%");
});

test("keeps the canvas stationary while drawing at maximum zoom", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  await page.locator("#zoomSelect").selectOption("800");
  await page.locator("#canvasWrap").evaluate(wrap => { wrap.scrollLeft = 300; wrap.scrollTop = 220; });
  const before = await page.locator("#canvasWrap").evaluate(wrap => ({ left: wrap.scrollLeft, top: wrap.scrollTop }));

  await page.mouse.move(600, 420);
  await page.mouse.down();
  await page.mouse.move(70, 430, { steps: 12 });
  await page.mouse.up();

  expect(await page.locator("#canvasWrap").evaluate(wrap => ({ left: wrap.scrollLeft, top: wrap.scrollTop }))).toEqual(before);
});

test("uses grouped tool flyouts without changing tool persistence", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();

  await expect(page.locator(".tool-choosers")).toBeHidden();
  await expect(page.locator(".grouped-tool-palette")).toBeVisible();
  await expect(page.locator('#paintToolSelect option[value="eraser"]')).toHaveCount(0);
  const brushGroup = page.locator(".palette-group-button").first();
  const brushMenuTrigger = page.locator(".palette-menu-trigger").first();
  const shapeMenuTrigger = page.locator(".palette-menu-trigger").nth(1);
  await brushMenuTrigger.click();
  await expect(page.getByRole("menu", { name: "Brush tools" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Marker" }).click();
  await expect(page.locator("#paintToolSelect")).toHaveValue("marker");
  await expect(brushGroup.locator(".palette-name")).toHaveText("Marker");
  await page.locator('[data-tool="picker"]').click();
  await brushGroup.click();
  await expect(brushGroup).toHaveClass(/active/);
  await expect(page.getByRole("menu", { name: "Brush tools" })).toBeHidden();

  await shapeMenuTrigger.click();
  await expect(page.getByRole("menu", { name: "Shape tools" })).toBeVisible();
  await brushMenuTrigger.click();
  await expect(page.getByRole("menu", { name: "Shape tools" })).toBeHidden();
  await expect(page.getByRole("menu", { name: "Brush tools" })).toBeVisible();
  await shapeMenuTrigger.click();
  await expect(page.getByRole("menu", { name: "Brush tools" })).toBeHidden();
  await expect(page.getByRole("menu", { name: "Shape tools" })).toBeVisible();
  await shapeMenuTrigger.click();
  await expect(page.getByRole("menu", { name: "Shape tools" })).toBeHidden();

  const eraser = page.locator('[data-tool="eraser"]');
  await eraser.click();
  await expect(eraser).toHaveClass(/active/);
  await expect(brushGroup).not.toHaveClass(/active/);
  await page.waitForTimeout(100);
  await page.reload();
  await expect(page.locator("#startupSplash")).toBeHidden();
  await expect(page.locator('[data-tool="eraser"]')).toHaveClass(/active/);
});

test("shows the correct contextual UI for every drawing tool", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  const brush = page.locator(".palette-group-button").first();
  const brushTrigger = page.locator(".palette-menu-trigger").first();
  const shape = page.locator(".palette-group-button").nth(1);
  const paintColour = page.locator("#colorInput").locator("..");
  const size = page.locator("#sizeInput").locator("..");
  const hardness = page.locator("#hardnessInput").locator("..");
  const shapeFill = page.locator("#fillInput").locator("..");

  for (const name of ["Pencil", "Brush", "Marker", "Highlighter", "Calligraphy ink", "Spray paint"]) {
    await brush.click({ button: "right" }); await page.getByRole("menu", { name: "Brush tools" }).getByText(name, { exact: true }).click();
    await expect(brush).toHaveClass(/active/); await expect(paintColour).toBeVisible(); await expect(size).toBeVisible(); await expect(hardness).toBeVisible();
    await expect(shapeFill).toBeHidden();
  }
  for (const name of ["Line", "Arrow", "Rectangle", "Rounded rectangle", "Ellipse", "Triangle", "Diamond", "Star"]) {
    await shape.click({ button: "right" }); await page.getByRole("menu", { name: "Shape tools" }).getByText(name, { exact: true }).click();
    await expect(shape).toHaveClass(/active/); await expect(paintColour).toBeVisible(); await expect(size).toBeVisible(); await expect(shapeFill).toBeVisible();
  }

  await page.locator('[data-tool="eraser"]').click();
  await expect(paintColour).toBeHidden(); await expect(size).toBeVisible(); await expect(hardness).toBeVisible();
  await page.locator('[data-tool="picker"]').click();
  await expect(page.locator(".picker-tool-options")).toBeVisible(); await expect(paintColour).toBeHidden(); await expect(page.locator(".fill-tool-options")).toBeHidden();
  const paintBeforePicking = await page.locator("#colorInput").inputValue();
  const fillBeforePicking = await page.locator("#fillColorInput").inputValue();
  const overlayBounds = await page.locator("#overlay").boundingBox();
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: overlayBounds!.x + 2, clientY: overlayBounds!.y + 2, pointerId: 1 });
  await expect(page.locator("#sampledColorInput")).toHaveValue("#ffffff");
  await expect(page.locator("#colorInput")).toHaveValue(paintBeforePicking);
  await expect(page.locator("#fillColorInput")).toHaveValue(fillBeforePicking);
  await page.locator("#colorInput").evaluate((input: HTMLInputElement) => { input.value = "#123456"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await brushTrigger.click();
  await page.getByRole("menu", { name: "Brush tools" }).getByRole("menuitem", { name: "Brush", exact: true }).click();
  await page.locator('[data-tool="picker"]').click();
  await expect(page.locator("#sampledColorInput")).toHaveValue("#ffffff");
  await expect(page.locator("#colorInput")).toHaveValue("#123456");
  await expect(page.locator("#fillColorInput")).toHaveValue("#000000");
  await page.getByRole("button", { name: "Use for paint" }).click(); await expect(page.locator("#colorInput")).toHaveValue("#ffffff");
  await page.getByRole("button", { name: "Use for fill" }).click(); await expect(page.locator("#fillColorInput")).toHaveValue("#ffffff");
  await page.locator('[data-tool="crop"]').click(); await expect(page.locator(".crop-tool-options")).toBeVisible();
  await page.locator('[data-tool="zoom"]').click(); await expect(page.locator(".zoom-tool-hint")).toBeVisible();
  await page.locator('[data-tool="fill"]').click(); await expect(page.locator(".fill-tool-options")).toBeVisible(); await expect(paintColour).toBeHidden();
});

test("returns from Picker directly to the selected paint tool through the split-button main area", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("picker-to-pencil");
  await page.locator("#newImageWidth").fill("200");
  await page.locator("#newImageHeight").fill("200");
  await page.locator("#createImageButton").click();
  await page.locator(".palette-menu-trigger").first().click();
  await page.getByRole("menu", { name: "Brush tools" }).getByRole("menuitem", { name: "Pencil", exact: true }).click();
  await page.locator("#colorInput").evaluate((input: HTMLInputElement) => {
    input.value = "#ff0000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-tool="picker"]').click();
  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await overlay.dispatchEvent("pointerdown", { clientX: bounds!.x + 1, clientY: bounds!.y + 1, pointerId: 1 });
  await expect(page.locator('[data-tool="picker"]')).toHaveClass(/active/);

  const paintMain = page.locator(".palette-group-button").first();
  await paintMain.click();
  await expect(paintMain).toHaveClass(/active/);
  await expect(page.locator('[data-tool="picker"]')).not.toHaveClass(/active/);
  await expect(page.getByRole("menu", { name: "Brush tools" })).toBeHidden();
  await expect(page.locator("#paintToolSelect")).toHaveValue("pencil");

  await overlay.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const area = canvas.getBoundingClientRect();
    const from = { x: area.left + area.width * .55, y: area.top + area.height * .55 };
    const to = { x: area.left + area.width * .7, y: area.top + area.height * .55 };
    canvas.setPointerCapture = () => undefined;
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, pointerId: 2, clientX: from.x, clientY: from.y }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, button: 0, buttons: 1, pointerId: 2, clientX: to.x, clientY: to.y }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, pointerId: 2, clientX: to.x, clientY: to.y }));
  });
  const retainedType = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("littleImageEditor");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const request = database.transaction("recovery", "readonly").objectStore("recovery").get("currentImage");
      request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
      request.onerror = () => reject(request.error);
    });
    const toolbarStates = record?.toolbarStates as Record<string, unknown> | undefined;
    const session = toolbarStates?.annotations as { state?: { objects?: Array<{ type?: string }> } } | undefined;
    return session?.state?.objects?.at(-1)?.type;
  });
  expect(retainedType).toBe("stroke");
  const paintPixels = await page.locator(".annotation-canvas").evaluate(canvas => {
    const surface = canvas as HTMLCanvasElement;
    const data = surface.getContext("2d")!.getImageData(0, 0, surface.width, surface.height).data;
    let visible = 0, red = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3]!) visible += 1;
      if (data[index]! > data[index + 1]!) red += 1;
    }
    return { visible, red };
  });
  expect(paintPixels.visible).toBeGreaterThan(0);
  expect(paintPixels.red).toBeGreaterThan(0);
});

test("gives every visible interactive UI element an accessible identity", async ({ page }) => {
  const unnamedControls = async () => page.locator("button,select,input,summary").evaluateAll(controls => controls
    .filter(control => {
      const element = control as HTMLElement;
      const style = getComputedStyle(element);
      return !element.hasAttribute("hidden") && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    })
    .filter(control => {
      const element = control as HTMLElement;
      const label = element.closest("label")?.textContent?.trim() ?? "";
      return !(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || label);
    })
    .map(control => `${control.tagName.toLowerCase()}#${(control as HTMLElement).id}`));

  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await unnamedControls()).toEqual([]);
  await page.locator("#createImageButton").click();
  await page.locator("#toolbarPickerButton").click();
  for (const name of ["Tools", "Adjust", "Effects", "Transform"]) await page.getByLabel(name, { exact: true }).check();
  await page.locator("#functionsButton").click();
  expect(await unnamedControls()).toEqual([]);
});

test("fills a contiguous region with the selected colour at 200% zoom and undoes it", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  await page.locator("#zoomSelect").selectOption("200");
  await page.locator("#colorInput").evaluate((input: HTMLInputElement) => {
    input.value = "#123456"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-tool="fill"]').click();
  await expect(page.locator(".fill-tool-options")).toBeVisible();
  await page.locator("#fillColorInput").evaluate((input: HTMLInputElement) => {
    input.value = "#ff0000"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#fillToleranceInput").evaluate((input: HTMLInputElement) => {
    input.value = "20"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const overlay = page.locator("#overlay"), bounds = await overlay.boundingBox();
  await overlay.dispatchEvent("pointerdown", { clientX: bounds!.x + bounds!.width / 2, clientY: bounds!.y + bounds!.height / 2, pointerId: 1 });
  expect(await page.locator(".annotation-canvas").evaluate(canvas => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data])).toEqual([255, 0, 0, 255]);
  await page.locator("#undoButton").click();
  expect(await page.locator(".annotation-canvas").evaluate(canvas => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data])).toEqual([0, 0, 0, 0]);
  await page.locator(".palette-menu-trigger").first().click();
  await page.getByRole("menu", { name: "Brush tools" }).getByRole("menuitem", { name: "Brush", exact: true }).click();
  await expect(page.locator("#colorInput")).toHaveValue("#123456");
});

test("creates and edits a new image", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("New image (Ctrl/⌘ N)").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Preset").selectOption("1280x720");
  await page.getByRole("button", { name: "Create image" }).click();
  await expect(page.locator("#dimensions")).toHaveText("1280 × 720 px");
  await expect(page.locator("#canvasWrap")).toBeVisible();
  await page.locator(".palette-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: "Spray paint" }).click();
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await page.locator('[data-tool="picker"]').click();
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 1, clientY: 1, pointerId: 1 });
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 2, clientY: 2, pointerId: 1 });
  await expect(page.locator('[data-tool="picker"]')).toHaveClass(/active/);
  await page.locator(".palette-group-button").first().click();
  await expect(page.locator(".palette-group-button").first()).toHaveClass(/active/);
  await expect(page.locator('[data-tool="picker"]')).not.toHaveClass(/active/);
  await page.locator(".palette-group-button").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Star" }).click();
  await expect(page.locator(".palette-group-button").nth(1)).toHaveClass(/active/);
  await page.locator(".palette-group-button").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Highlighter" }).click();
  await page.locator("#colorInput").evaluate((input: HTMLInputElement) => {
    input.value = "#123456"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#brightnessInput").evaluate((input: HTMLInputElement) => {
    input.value = "24"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#effectSelect").selectOption("invert");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel preview" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel preview" }).click();
  await page.getByRole("button", { name: "Apply effect" }).click();
  await expect(page.getByRole("button", { name: "Clear last effect" })).toBeEnabled();
  await expect(page.locator("#undoButton")).toBeEnabled();
  await page.waitForFunction(async () => {
    const request = indexedDB.open("littleImageEditor");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const transaction = database.transaction("recovery", "readonly");
    const result = transaction.objectStore("recovery").get("currentImage");
    return new Promise<boolean>(resolve => { result.onsuccess = () => resolve(Boolean(result.result)); result.onerror = () => resolve(false); });
  });
  await page.reload();
  await expect(page.locator("#dimensions")).toHaveText("1280 × 720 px");
  await expect(page.locator("#canvasWrap")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear last effect" })).toBeEnabled();
  await page.getByRole("button", { name: "Clear last effect" }).click();
  await expect(page.getByLabel("Paint tool")).toHaveValue("highlighter");
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await expect(page.locator("#colorInput")).toHaveValue("#123456");
  await expect(page.locator("#brightnessInput")).toHaveValue("0");
  await expect(page.locator("#brightnessValue")).toHaveText("0");
});

test("navigates menus and opens functions with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
  await expect(page.locator("#fileMenu")).toHaveAttribute("open", "");
  await page.locator("#newImageButton").press("ArrowRight");
  await expect(page.locator("#editMenu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await page.getByTitle("Image functions").click();
  await expect(page.getByText("Sprite sheet", { exact: true })).toBeVisible();
});

test("audits top actions, new-image controls, toolbar checklist, and panel controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#startupSplash")).toBeHidden();
  for (const selector of ["#quickSaveButton", "#saveButton", "#saveAsButton", "#exportButton", "#closeImageButton", "#undoButton", "#redoButton"]) {
    await expect(page.locator(selector)).toBeDisabled();
  }

  await page.locator("#quickNewButton").click();
  const dialog = page.locator("#newImageDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator('#newImagePreset option[value="3508x4961"]')).toHaveText(/A3/);
  await expect(page.locator('#newImagePreset option[value="2480x3508"]')).toHaveText(/A4/);
  await expect(page.locator('#newImagePreset option[value="1748x2480"]')).toHaveText(/A5/);
  await page.locator("#newImagePreset").selectOption("1748x2480");
  await expect(page.locator("#newImageWidth")).toHaveValue("1748");
  await expect(page.locator("#newImageHeight")).toHaveValue("2480");
  await expect(page.locator("#newImageResolution")).toHaveValue("300");
  await page.locator("#newImageFormat").selectOption("image/jpeg");
  await page.locator("#newImageTransparent").check();
  await expect(page.locator("#newImageColor")).toBeDisabled();
  await expect(page.locator("#transparencyWarning")).toContainText("JPEG does not support transparency");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();

  await page.locator("#quickNewButton").click();
  await page.locator("#newImageWidth").fill("64");
  await page.locator("#newImageHeight").fill("48");
  await page.locator("#newImageTransparent").uncheck();
  await page.locator("#newImageColor").fill("#336699");
  await page.locator("#createImageButton").click();
  await expect(page.locator("#dimensions")).toHaveText("64 × 48 px");
  for (const selector of ["#quickSaveButton", "#saveButton", "#saveAsButton", "#exportButton", "#closeImageButton"]) {
    await expect(page.locator(selector)).toBeEnabled();
  }

  const toolbarPicker = page.locator("#toolbarPickerButton");
  await toolbarPicker.focus();
  await toolbarPicker.press("ArrowDown");
  await expect(page.locator(".toolbar-visibility")).toBeVisible();
  await expect(page.locator('[data-panel-toggle="tools"]')).toBeFocused();
  await page.locator('[data-panel-toggle="tools"]').press("End");
  await expect(page.locator('[data-panel-toggle="transform"]')).toBeFocused();
  await page.locator('[data-panel-toggle="transform"]').press("Space");
  await expect(page.locator('[data-panel="transform"]')).toBeVisible();
  await page.locator('[data-panel-toggle="transform"]').press("Escape");
  await expect(page.locator(".toolbar-visibility")).toBeHidden();
  await expect(toolbarPicker).toBeFocused();

  const collapse = page.locator('[data-panel="tools"] .collapse');
  await collapse.click();
  await expect(collapse).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-panel="tools"] .panel-body')).toBeHidden();
  await collapse.click();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-panel="tools"] .panel-body')).toBeVisible();

  await page.locator("#editMenu summary").click();
  await page.locator("#resetLayoutButton").click();
  await toolbarPicker.click();
  await expect(page.getByLabel("Tools", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Effects", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Adjust", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Transform", { exact: true })).not.toBeChecked();
});

test("audits tool flyout keyboard behavior and popup exclusivity", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#createImageButton").click();
  const paint = page.locator(".palette-group-button").first();
  const shapes = page.locator(".palette-group-button").nth(1);
  const paintTrigger = page.locator(".palette-menu-trigger").first();
  const shapesTrigger = page.locator(".palette-menu-trigger").nth(1);

  await paintTrigger.focus();
  await paintTrigger.press("ArrowDown");
  const brushMenu = page.getByRole("menu", { name: "Brush tools" });
  await expect(brushMenu).toBeVisible();
  await expect(brushMenu.getByRole("menuitem").first()).toBeFocused();
  await brushMenu.getByRole("menuitem").first().press("End");
  await expect(brushMenu.getByRole("menuitem").last()).toBeFocused();
  await brushMenu.getByRole("menuitem").last().press("Escape");
  await expect(brushMenu).toBeHidden();
  await expect(paintTrigger).toBeFocused();

  const panelBefore = await page.locator('[data-panel="tools"]').boundingBox();
  const pickerBefore = await page.locator('[data-tool="picker"]').boundingBox();
  await shapesTrigger.click();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await expect(shapeMenu).toBeVisible();
  const menuBounds = await shapeMenu.boundingBox();
  const panelBounds = await page.locator('[data-panel="tools"]').boundingBox();
  const groupBounds = await shapes.boundingBox();
  const pickerBounds = await page.locator('[data-tool="picker"]').boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(groupBounds!.y + groupBounds!.height);
  expect(Math.abs(panelBounds!.height - panelBefore!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(pickerBounds!.y - pickerBefore!.y)).toBeLessThanOrEqual(1);
  await shapesTrigger.click();
  await expect(shapeMenu).toBeHidden();
  await page.locator('[data-tool="picker"]').click();
  await expect(page.locator('[data-tool="picker"]')).toHaveClass(/active/);

  await paint.click({ button: "right" });
  await expect(brushMenu).toBeVisible();
  await page.locator("#toolbarPickerButton").click();
  await expect(brushMenu).toBeHidden();
  await expect(page.locator(".toolbar-visibility")).toBeVisible();
});

test("audits adjustments, effects, transforms, history, file input, and sprite controls", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageWidth").fill("16");
  await page.locator("#newImageHeight").fill("12");
  await page.locator("#newImageColor").fill("#336699");
  await page.locator("#createImageButton").click();
  await page.locator("#toolbarPickerButton").click();
  await page.getByLabel("Adjust", { exact: true }).check();
  await page.getByLabel("Transform", { exact: true }).check();

  for (const [name, value] of [["brightness", "25"], ["contrast", "-20"], ["saturation", "40"]] as const) {
    await page.locator(`#${name}Input`).evaluate((input, next) => {
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await expect(page.locator(`#${name}Value`)).toHaveText(value);
  }
  await page.locator("#resetFiltersButton").click();
  for (const name of ["brightness", "contrast", "saturation"]) {
    await expect(page.locator(`#${name}Input`)).toHaveValue("0");
    await expect(page.locator(`#${name}Value`)).toHaveText("0");
  }

  for (const effect of ["monochrome", "sepia", "invert", "sharpen"]) {
    await page.locator("#effectSelect").selectOption(effect);
    await page.locator("#previewEffectButton").click();
    await expect(page.locator("#previewEffectButton")).toHaveAttribute("aria-label", "Cancel preview");
    await page.locator("#previewEffectButton").click();
    await expect(page.locator("#previewEffectButton")).toHaveAttribute("aria-label", "Preview");
  }
  await page.locator("#effectSelect").selectOption("invert");
  await page.locator("#applyEffectButton").click();
  await expect(page.locator("#clearEffectButton")).toBeEnabled();
  await page.locator("#clearEffectButton").click();
  await expect(page.locator("#clearEffectButton")).toBeDisabled();

  await page.locator("#rotateRightButton").click();
  await expect(page.locator("#dimensions")).toHaveText("12 × 16 px");
  await page.locator("#rotateLeftButton").click();
  await expect(page.locator("#dimensions")).toHaveText("16 × 12 px");
  await page.locator("#flipHButton").click();
  await page.locator("#flipVButton").click();
  await expect(page.locator("#undoButton")).toBeEnabled();
  await page.locator("#widthInput").fill("20");
  await page.locator("#heightInput").fill("10");
  await page.locator("#resizeButton").click();
  await expect(page.locator("#dimensions")).toHaveText("20 × 10 px");
  await page.locator("#undoButton").click();
  await expect(page.locator("#dimensions")).toHaveText("16 × 12 px");
  await page.locator("#redoButton").click();
  await expect(page.locator("#dimensions")).toHaveText("20 × 10 px");

  await expect(page.locator("#fileInput")).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  await page.locator("#functionsButton").click();
  await expect(page.locator("#buildSpriteButton")).toBeDisabled();
  await expect(page.locator("#spriteInput")).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  await page.locator("#spriteInput").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: validPng },
    { name: "two.png", mimeType: "image/png", buffer: validPng }
  ]);
  await expect(page.locator("#spriteCount")).toHaveText("2");
  await expect(page.locator("#buildSpriteButton")).toBeEnabled();
  await page.locator("#spriteColumns").fill("2");
  await page.locator("#spritePadding").fill("1");
  await page.locator("#buildSpriteButton").click();
  await expect(page.locator("#functionsDialog")).toBeHidden();
  await expect(page.locator("#spriteCount")).toHaveText("0");
  await expect(page.locator("#buildSpriteButton")).toBeDisabled();
  const iconSize = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(await (await fetch("/assets/images/extensionIcon.png")).blob());
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  });
  await expect(page.locator("#dimensions")).toHaveText(`${iconSize.width * 2 + 1} × ${iconSize.height} px`);
});
