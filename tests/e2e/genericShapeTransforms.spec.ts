import { expect, test, type Page } from "@playwright/test";

test("drawing and annotation rectangles share persistent resize and rotation handles", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("transformable-shapes");
  await page.locator("#createImageButton").click();
  await page.locator(".palette-menu-trigger").nth(1).click();
  await page.getByRole("menu", { name: "Shape tools" }).getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  await page.locator("#toolbarPickerButton").click();
  await page.locator('[data-panel-toggle="tools"]').uncheck();

  await dragCanvas(page, { x: 200, y: 150 }, { x: 400, y: 250 });
  const created = await alphaBounds(page);
  expect(created.width).toBeGreaterThan(190);
  expect(created.height).toBeGreaterThan(90);

  await dragCanvas(page, { x: 400, y: 250 }, { x: 500, y: 350 });
  const resized = await alphaBounds(page);
  expect(resized.width).toBeGreaterThan(created.width + 80);
  expect(resized.height).toBeGreaterThan(created.height + 80);

  await dragCanvas(page, { x: 350, y: 126 }, { x: 500, y: 250 });
  const rotated = await alphaBounds(page);
  expect(rotated.height).toBeGreaterThan(rotated.width);

  await page.reload();
  await expect(page.locator("#startupSplash")).toBeHidden();
  const restored = await alphaBounds(page);
  expect(restored.width).toBeGreaterThan(0);
  expect(restored.height).toBeGreaterThan(restored.width);
});

async function dragCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  const size = await overlay.evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  const screen = (point: { x: number; y: number }) => ({ x: bounds!.x + point.x * bounds!.width / size.width, y: bounds!.y + point.y * bounds!.height / size.height });
  const start = screen(from), end = screen(to);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up();
}

function alphaBounds(page: Page): Promise<{ width: number; height: number }> {
  return page.locator(".annotation-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { width: right < left ? 0 : right - left + 1, height: bottom < top ? 0 : bottom - top + 1 };
  });
}
