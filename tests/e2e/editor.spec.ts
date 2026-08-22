import { expect, test } from "@playwright/test";

test("loads the official splash and application icon", async ({ page }) => {
  await page.goto("/");

  const splashLogo = page.locator("#startupSplash img");
  await expect(splashLogo).toHaveJSProperty("complete", true);
  expect(await splashLogo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const iconUrl = await page.locator(".app-mark .logo").evaluate(element => {
    const match = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    return match?.[1] ?? "";
  });
  expect(iconUrl).not.toBe("");
  const iconResponse = await page.request.get(iconUrl);
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toBe("image/png");

  const adjust = await page.locator('[data-panel="adjust"]').boundingBox();
  const transform = await page.locator('[data-panel="transform"]').boundingBox();
  expect(adjust).not.toBeNull();
  expect(transform).not.toBeNull();
  expect(transform!.y).toBeGreaterThanOrEqual(adjust!.y + adjust!.height + 13);
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
  await page.getByTitle("Color picker (I)").click();
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 1, clientY: 1, pointerId: 1 });
  await page.locator("#overlay").dispatchEvent("pointerdown", { clientX: 2, clientY: 2, pointerId: 1 });
  await expect(page.getByTitle("Color picker (I)")).toHaveClass(/active/);
  await page.locator("#paintToolControl").click();
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await expect(page.getByTitle("Color picker (I)")).not.toHaveClass(/active/);
  await page.getByLabel("Shape tool").selectOption("star");
  await expect(page.locator("#shapeToolControl")).toHaveClass(/active/);
  await page.getByLabel("Paint tool").selectOption("highlighter");
  await page.locator("#colorInput").evaluate((input: HTMLInputElement) => {
    input.value = "#123456"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#brightnessInput").evaluate((input: HTMLInputElement) => {
    input.value = "24"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Invert" }).click();
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
  await expect(page.getByLabel("Paint tool")).toHaveValue("highlighter");
  await expect(page.locator("#paintToolControl")).toHaveClass(/active/);
  await expect(page.locator("#colorInput")).toHaveValue("#123456");
  await expect(page.locator("#brightnessInput")).toHaveValue("24");
  await expect(page.locator("#brightnessValue")).toHaveText("24");
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
