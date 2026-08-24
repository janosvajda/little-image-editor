import { expect, test, type Page } from "@playwright/test";

test("every drawing tool activates through the shared palette and receives canvas interaction", async ({ page }) => {
  await page.goto("/");
  await createImage(page);

  const groups = [
    { trigger: "Choose brush tools", menu: "Brush tools", tools: ["Pencil", "Brush", "Marker", "Highlighter", "Calligraphy ink", "Spray paint"] },
    { trigger: "Choose shape tools", menu: "Shape tools", tools: ["Line", "Arrow", "Rectangle", "Rounded rectangle", "Ellipse", "Triangle", "Diamond", "Star"] }
  ] as const;
  for (const group of groups) for (const tool of group.tools) {
    await page.getByRole("button", { name: group.trigger }).click();
    await page.getByRole("menu", { name: group.menu }).getByRole("menuitem", { name: tool, exact: true }).click();
    await expect(page.locator('[data-panel="tools"] .palette-group-button.active')).toContainText(tool);
  }

  for (const id of ["eraser", "select", "picker", "crop", "zoom", "fill"]) {
    const button = page.locator(`[data-panel="tools"] [data-tool="${id}"]`);
    await button.click();
    await expect(button).toHaveClass(/active/);
  }

  await chooseShape(page, "Rectangle");
  await dragCanvas(page, { x: 300, y: 220 }, { x: 500, y: 340 });
  await expect.poll(() => annotationAlphaCount(page)).toBeGreaterThan(0);

  await chooseBrush(page, "Brush");
  await dragCanvas(page, { x: 560, y: 220 }, { x: 650, y: 310 });
  await expect.poll(() => imageHasNonWhitePixel(page)).toBe(true);
});

async function createImage(page: Page): Promise<void> {
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("drawing-tools-contract");
  await page.locator("#createImageButton").click();
}

async function chooseShape(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Choose shape tools" }).click();
  await page.getByRole("menu", { name: "Shape tools" }).getByRole("menuitem", { name, exact: true }).click();
}

async function chooseBrush(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Choose brush tools" }).click();
  await page.getByRole("menu", { name: "Brush tools" }).getByRole("menuitem", { name, exact: true }).click();
}

async function dragCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.locator("#overlay").evaluate((overlay, points) => {
    const canvas = overlay as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const screen = (point: { x: number; y: number }) => ({ x: bounds.left + point.x * bounds.width / canvas.width, y: bounds.top + point.y * bounds.height / canvas.height });
    const start = screen(points.from), end = screen(points.to);
    canvas.setPointerCapture = () => undefined;
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, pointerId: 20, clientX: start.x, clientY: start.y }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, button: 0, buttons: 1, pointerId: 20, clientX: end.x, clientY: end.y }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, pointerId: 20, clientX: end.x, clientY: end.y }));
  }, { from, to });
}

async function annotationAlphaCount(page: Page): Promise<number> {
  return page.locator(".annotation-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) count += 1;
    return count;
  });
}

async function imageHasNonWhitePixel(page: Page): Promise<boolean> {
  return page.locator("#canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] !== 255 || pixels[index + 1] !== 255 || pixels[index + 2] !== 255) return true;
    return false;
  });
}
