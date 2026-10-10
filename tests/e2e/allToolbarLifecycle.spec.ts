import { expect, test, type Page } from "@playwright/test";

const TOOLBAR_KEYS = ["tools", "adjust", "effects", "transform", "annotations", "layers"] as const;
const LAYOUT_COLUMNS = 2;
const LAYOUT_LEFT = 24;
const LAYOUT_TOP = 24;
const LAYOUT_COLUMN_GAP = 560;
const LAYOUT_ROW_GAP = 90;
const WIDE_VIEWPORT = { width: 1920, height: 1080 } as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("little-editor.panel-layout.v2"));
  await page.reload();
});

test("every toolbar opens, performs its primary function, and uses the shared controls", async ({ page }) => {
  await createImage(page, "toolbar-functions", 240, 160);
  await showEveryToolbar(page);

  await page.getByRole("button", { name: "Brush tools: Brush", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await dragOnCanvas(page, .65, .4, .8, .55);
  expect(await hasNonWhitePixel(page)).toBe(true);

  await page.locator("#brightnessInput").evaluate(input => {
    (input as HTMLInputElement).value = "-40";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#brightnessValue")).toHaveText("-40");

  await page.locator("#effectSelect").selectOption("sepia");
  await page.locator("#effectAmountInput").evaluate(input => {
    (input as HTMLInputElement).value = "35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#effectAmountValue")).toHaveText("35%");
  await page.locator("#applyEffectButton").evaluate(button => (button as HTMLButtonElement).click());

  await page.locator("#widthInput").fill("180");
  await page.locator("#heightInput").fill("120");
  await page.locator("#resizeButton").evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator("#dimensions")).toHaveText("180 × 120 px");

  const numberTool = page.getByRole("button", { name: "Number", exact: true });
  await numberTool.evaluate(button => (button as HTMLButtonElement).click());
  await expect(numberTool).toHaveClass(/active/);
  await clickCanvas(page, .5, .5);
  await expect(page.getByLabel("Next marker number")).toHaveValue("2");

  for (const key of TOOLBAR_KEYS) {
    const panel = page.locator(`[data-panel="${key}"]`);
    await expect(panel).toHaveAttribute("data-toolbar-panel", "managed");
    await expect(panel.locator(":scope > .panel-header > .collapse")).toHaveCount(1);
  }
});

test.describe("with room for every toolbar", () => {
  // Six open toolbars overlap on a small screen, where drops are moved to free space.
  test.use({ viewport: WIDE_VIEWPORT });

  test("every toolbar restores open, closed, collapsed, and positioned state after reload", async ({ page }) => {
    await showEveryToolbar(page);
    const expectedPositions: Record<string, { left: number; top: number }> = {};

    for (const [index, key] of TOOLBAR_KEYS.entries()) {
      const panel = page.locator(`[data-panel="${key}"]`);
      const deltaX = LAYOUT_LEFT + index % LAYOUT_COLUMNS * LAYOUT_COLUMN_GAP;
      const deltaY = LAYOUT_TOP + Math.floor(index / LAYOUT_COLUMNS) * LAYOUT_ROW_GAP;
      await dragPanel(panel, deltaX, deltaY);
      await panel.locator(":scope > .panel-header > .collapse").click();
      expectedPositions[key] = await panel.evaluate(element => ({
        left: (element as HTMLElement).offsetLeft,
        top: (element as HTMLElement).offsetTop
      }));
    }

    await page.reload();
    for (const key of TOOLBAR_KEYS) {
      const panel = page.locator(`[data-panel="${key}"]`);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveClass(/collapsed/);
      const position = await panel.evaluate(element => ({ left: (element as HTMLElement).offsetLeft, top: (element as HTMLElement).offsetTop }));
      expect(Math.abs(position.left - expectedPositions[key]!.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(position.top - expectedPositions[key]!.top)).toBeLessThanOrEqual(2);
    }

    await page.locator("#toolbarPickerButton").click();
    for (const key of ["adjust", "transform", "annotations", "layers"] as const) await page.locator(`[data-panel-toggle="${key}"]`).uncheck();
    await page.reload();

    for (const key of TOOLBAR_KEYS) {
      const shouldBeVisible = key === "tools" || key === "effects";
      if (shouldBeVisible) await expect(page.locator(`[data-panel="${key}"]`)).toBeVisible();
      else await expect(page.locator(`[data-panel="${key}"]`)).toBeHidden();
    }
  });

});

test("a toolbar auto-open mode uses generic metadata and becomes normal persisted visibility", async ({ page }) => {
  await createImage(page, "auto-open-toolbar", 200, 120);
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");

  const annotations = page.locator('[data-panel="annotations"]');
  await expect(annotations).toHaveAttribute("data-auto-open-mode", "annotate");
  await expect(annotations).toBeVisible();
  await expect(page).not.toHaveURL(/(?:\?|&)mode=annotate(?:&|$)/);

  await page.locator("#toolbarPickerButton").click();
  await page.locator('[data-panel-toggle="tools"]').check();
  await page.reload();
  await expect(annotations).toBeVisible();
  await expect(page.locator('[data-panel="tools"]')).toBeVisible();
});

async function showEveryToolbar(page: Page): Promise<void> {
  await page.locator("#toolbarPickerButton").click();
  for (const key of TOOLBAR_KEYS) {
    const toggle = page.locator(`[data-panel-toggle="${key}"]`);
    if (!(await toggle.isChecked())) await toggle.check();
  }
  await page.keyboard.press("Escape");
}

async function dragPanel(panel: import("@playwright/test").Locator, deltaX: number, deltaY: number): Promise<void> {
  const header = panel.locator(":scope > .panel-header");
  const box = await header.boundingBox();
  if (!box) throw new Error("Toolbar header is not visible.");
  const page = header.page();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY, { steps: 3 });
  await page.mouse.up();
}

async function createImage(page: Page, name: string, width: number, height: number): Promise<void> {
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill(name);
  await page.locator("#newImageWidth").fill(String(width));
  await page.locator("#newImageHeight").fill(String(height));
  await page.locator("#createImageButton").click();
}

async function dragOnCanvas(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await page.locator("#overlay").evaluate((overlay, points) => {
    const bounds = overlay.getBoundingClientRect();
    const dispatch = (type: string, x: number, y: number) => overlay.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1,
      clientX: bounds.left + bounds.width * x, clientY: bounds.top + bounds.height * y
    }));
    dispatch("pointerdown", points.fromX, points.fromY);
    dispatch("pointermove", points.toX, points.toY);
    dispatch("pointerup", points.toX, points.toY);
  }, { fromX, fromY, toX, toY });
}

async function clickCanvas(page: Page, x: number, y: number): Promise<void> {
  await page.locator("#overlay").evaluate((overlay, point) => {
    const canvas = overlay as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    canvas.setPointerCapture = () => undefined;
    const options = { bubbles: true, cancelable: true, button: 0, pointerId: 2, clientX: bounds.left + bounds.width * point.x, clientY: bounds.top + bounds.height * point.y };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...options, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...options, buttons: 0 }));
  }, { x, y });
}

function hasNonWhitePixel(page: Page): Promise<boolean> {
  return page.locator(".annotation-canvas").evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext("2d")!;
    const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 255 || pixels[index + 1] !== 255 || pixels[index + 2] !== 255) return true;
    }
    return false;
  });
}
