import { expect, test } from "@playwright/test";

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
  expect(await page.locator("#canvas").evaluate(canvas => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data])).toEqual([255, 0, 0, 255]);
  await page.locator("#undoButton").click();
  expect(await page.locator("#canvas").evaluate(canvas => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data])).toEqual([255, 255, 255, 255]);
  await page.locator("#paintToolControl").click();
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
  await page.getByLabel("Paint tool").selectOption("spray");
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await page.locator('[data-tool="picker"]').click();
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 1, clientY: 1, pointerId: 1 });
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 2, clientY: 2, pointerId: 1 });
  await expect(page.locator('[data-tool="picker"]')).toHaveClass(/active/);
  await page.locator("#paintToolControl").click();
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await expect(page.locator('[data-tool="picker"]')).not.toHaveClass(/active/);
  await page.getByLabel("Shape tool").selectOption("star");
  await expect(page.locator("#shapeToolControl")).toHaveClass(/active/);
  await page.getByLabel("Paint tool").selectOption("highlighter");
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
