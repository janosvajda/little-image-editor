import { expect, test, type Locator, type Page } from "@playwright/test";

const TOOLBARS = ["tools", "adjust", "effects", "transform", "annotations", "layers"] as const;
const LAYOUT_KEY = "little-editor.panel-layout.v2";
test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(key => {
    if (sessionStorage.getItem("toolbar-contract-initialized")) return;
    localStorage.removeItem(key);
    sessionStorage.setItem("toolbar-contract-initialized", "true");
  }, LAYOUT_KEY);
  await page.goto("/");
});

test("every toolbar shares real open, close, collapse, drag, and reload persistence", async ({ page }) => {
  await setAllToolbars(page, true);

  const positions = new Map<string, { x: number; y: number }>();
  for (const [index, key] of TOOLBARS.entries()) {
    const panel = toolbar(page, key);
    await expectManagedContract(panel, key);
    await dragPanel(panel, 22 + index * 25, 18 + index * 22);
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    positions.set(key, { x: box!.x, y: box!.y });
    await panel.locator(":scope > .panel-header > .collapse").click();
    await expect(panel).toHaveClass(/collapsed/);
  }

  await page.reload();
  for (const key of TOOLBARS) {
    const panel = toolbar(page, key);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/collapsed/);
    const actual = await panel.boundingBox();
    const expected = positions.get(key)!;
    expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(2);
  }

  await setAllToolbars(page, false);
  await page.reload();
  for (const key of TOOLBARS) {
    await expect(toolbar(page, key)).toBeHidden();
    await expect(page.locator(`[data-panel-toggle="${key}"]`)).not.toBeChecked();
  }

  await setAllToolbars(page, true);
  await page.reload();
  for (const key of TOOLBARS) {
    await expect(toolbar(page, key)).toBeVisible();
    await expect(page.locator(`[data-panel-toggle="${key}"]`)).toBeChecked();
  }
});

test("all drawing, adjustment, effect, transform, and annotation controls remain operational", async ({ page }) => {
  await createImage(page);
  await setAllToolbars(page, true);
  await expandAll(page);

  for (const label of ["Pencil", "Brush", "Marker", "Highlighter", "Calligraphy ink", "Spray paint"]) {
    await choosePaletteTool(page, "brush tools", "Brush tools", label);
    await expect(page.getByRole("button", { name: new RegExp(`Brush tools: ${label}`) })).toHaveClass(/active/);
  }
  for (const label of ["Line", "Arrow", "Rectangle", "Rounded rectangle", "Ellipse", "Triangle", "Diamond", "Star"]) {
    await choosePaletteTool(page, "shape tools", "Shape tools", label);
    await expect(page.getByRole("button", { name: new RegExp(`Shape tools: ${label}`) })).toHaveClass(/active/);
  }
  for (const tool of ["eraser", "picker", "crop", "zoom", "fill"]) {
    await page.locator(`[data-panel="tools"] [data-tool="${tool}"]`).click();
    await expect(page.locator(`[data-panel="tools"] [data-tool="${tool}"]`)).toHaveClass(/active/);
  }
  await setRange(page, "#sizeInput", "31");
  await expect(page.locator("#sizeValue")).toHaveText("31 px");
  await setRange(page, "#opacityInput", "63");
  await expect(page.locator("#opacityValue")).toHaveText("63%");
  await setRange(page, "#hardnessInput", "47");
  await expect(page.locator("#hardnessValue")).toHaveText("47%");
  await choosePaletteTool(page, "shape tools", "Shape tools", "Rectangle");
  await page.locator("#fillInput").check();
  await expect(page.locator("#fillInput")).toBeChecked();

  for (const [selector, label] of [["#brightnessInput", "#brightnessValue"], ["#contrastInput", "#contrastValue"], ["#saturationInput", "#saturationValue"]] as const) {
    await setRange(page, selector, "-25", true);
    await expect(page.locator(label)).toHaveText("-25");
  }
  await page.locator("#resetFiltersButton").click();
  for (const label of ["#brightnessValue", "#contrastValue", "#saturationValue"]) await expect(page.locator(label)).toHaveText("0");

  for (const effect of ["monochrome", "sepia", "invert", "sharpen"]) {
    await page.locator("#effectSelect").selectOption(effect);
    await expect(page.locator("#effectHint")).not.toBeEmpty();
  }
  await page.locator("#previewEffectButton").click();
  await expect(page.locator("#previewEffectButton")).toHaveAttribute("aria-label", "Cancel preview");
  await page.locator("#previewEffectButton").click();
  await expect(page.locator("#previewEffectButton")).toHaveAttribute("aria-label", "Preview");
  await page.locator("#applyEffectButton").click();
  await expect(page.locator("#clearEffectButton")).toBeEnabled();
  await page.locator("#clearEffectButton").click();
  await expect(page.locator("#clearEffectButton")).toBeDisabled();

  await page.locator("#rotateLeftButton").click();
  await expect(page.locator("#dimensions")).toHaveText("120 × 180 px");
  await page.locator("#rotateRightButton").click();
  await expect(page.locator("#dimensions")).toHaveText("180 × 120 px");
  await page.locator("#flipHButton").click();
  await page.locator("#flipVButton").click();
  await page.locator("#widthInput").fill("150");
  await page.locator("#heightInput").fill("90");
  await page.locator("#resizeButton").click();
  await expect(page.locator("#dimensions")).toHaveText("150 × 90 px");

  const annotationTools = ["Select", "Arrow", "Number", "Box", "Highlight", "Text", "Blur", "Redact", "Crop"];
  for (const name of annotationTools) {
    const button = toolbar(page, "annotations").getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveClass(/active/);
  }
  await toolbar(page, "annotations").getByRole("button", { name: "Number", exact: true }).click();
  await page.locator("#annotationMarkerValue").fill("7");
  await page.locator("#annotationMarkerValue").press("Enter");
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 7");
  await page.getByRole("button", { name: "Restart numbering at 1" }).click();
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 1");
  await page.locator("#annotationExpected").fill("Expected behavior");
  await page.locator("#annotationActual").fill("Actual behavior");
  await expect(page.locator("#annotationReportText")).toHaveValue(/Expected: Expected behavior/);
  await expect(page.locator("#annotationReportText")).toHaveValue(/Actual: Actual behavior/);
  await page.locator("#annotationReportText").fill("Manually edited report");
  await expect(page.locator("#annotationReportText")).toHaveValue("Manually edited report");
});

test("auto-open is a generic toolbar metadata capability, not an annotation name branch", async ({ page }) => {
  await page.route(/\/\?(?:.*)?$/, async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('data-panel="adjust"', 'data-panel="adjust" data-auto-open-mode="audit-adjust"');
    await route.fulfill({ response, body: html, headers: { ...response.headers(), "content-type": "text/html" } });
  });
  await page.goto("/?mode=audit-adjust");

  await expect(toolbar(page, "adjust")).toBeVisible();
  await expect(toolbar(page, "adjust")).toHaveAttribute("data-auto-open-mode", "audit-adjust");
  await expect(page).not.toHaveURL(/mode=audit-adjust/);
  for (const key of TOOLBARS.filter(key => key !== "adjust")) {
    const panel = toolbar(page, key);
    const defaultVisible = await panel.getAttribute("data-default-visible") !== null;
    if (defaultVisible) await expect(panel).toBeVisible();
    else await expect(panel).toBeHidden();
  }

  await page.reload();
  await expect(toolbar(page, "adjust")).toBeVisible();
});

function toolbar(page: Page, key: typeof TOOLBARS[number]): Locator { return page.locator(`[data-panel="${key}"]`); }

async function expectManagedContract(panel: Locator, key: string): Promise<void> {
  await expect(panel).toHaveAttribute("data-toolbar-panel", "managed");
  await expect(panel).toHaveAttribute("data-panel", key);
  await expect(panel.locator(":scope > .panel-header")).toHaveCount(1);
  await expect(panel.locator(":scope > .panel-body")).toHaveCount(1);
  await expect(panel.locator(":scope > .panel-header > .collapse")).toHaveCount(1);
}

async function setAllToolbars(page: Page, visible: boolean): Promise<void> {
  await page.locator("#toolbarPickerButton").click();
  for (const key of TOOLBARS) {
    const toggle = page.locator(`[data-panel-toggle="${key}"]`);
    if ((await toggle.isChecked()) !== visible) await toggle.setChecked(visible);
  }
  await page.keyboard.press("Escape");
}

async function expandAll(page: Page): Promise<void> {
  for (const key of TOOLBARS) {
    const panel = toolbar(page, key);
    if (await panel.evaluate(element => element.classList.contains("collapsed"))) await panel.locator(".collapse").click();
  }
}

async function dragPanel(panel: Locator, deltaX: number, deltaY: number): Promise<void> {
  const header = panel.locator(":scope > .panel-header");
  const box = await header.boundingBox();
  if (!box) throw new Error("Toolbar header is not visible.");
  const page = header.page();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY, { steps: 3 });
  await page.mouse.up();
}

async function createImage(page: Page): Promise<void> {
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("toolbar-contract");
  await page.locator("#newImageWidth").fill("180");
  await page.locator("#newImageHeight").fill("120");
  await page.locator("#createImageButton").click();
}

async function setRange(page: Page, selector: string, value: string, commit = false): Promise<void> {
  await page.locator(selector).evaluate((input, state) => {
    (input as HTMLInputElement).value = state.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (state.commit) input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { value, commit });
}

async function choosePaletteTool(page: Page, triggerName: string, menuName: string, toolName: string): Promise<void> {
  await page.getByRole("button", { name: `Choose ${triggerName}` }).click();
  await page.getByRole("menu", { name: menuName }).getByRole("menuitem", { name: toolName, exact: true }).click();
}
