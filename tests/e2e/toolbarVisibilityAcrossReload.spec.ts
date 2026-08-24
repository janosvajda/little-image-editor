import { expect, test } from "@playwright/test";

test("every registered toolbar shares visibility and collapse persistence after reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("toolbar-visibility");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");

  await expect(page.locator('[data-panel="annotations"]')).toBeVisible();
  await expect(page).not.toHaveURL(/(?:\?|&)mode=annotate(?:&|$)/);

  const toolbarKeys = ["tools", "adjust", "effects", "transform", "annotations"];
  await page.locator("#toolbarPickerButton").click();
  for (const key of toolbarKeys) {
    const toggle = page.locator(`[data-panel-toggle="${key}"]`);
    if (!(await toggle.isChecked())) await toggle.check();
  }
  for (const key of toolbarKeys) {
    const panel = page.locator(`[data-panel="${key}"]`);
    await expect(panel).toBeVisible();
    await panel.locator(".collapse").evaluate(button => (button as HTMLButtonElement).click());
    await expect(panel).toHaveClass(/collapsed/);
  }
  await page.reload();

  for (const key of toolbarKeys) {
    const panel = page.locator(`[data-panel="${key}"]`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/collapsed/);
  }
  await page.locator("#toolbarPickerButton").click();
  for (const key of toolbarKeys) await expect(page.locator(`[data-panel-toggle="${key}"]`)).toBeChecked();
});
