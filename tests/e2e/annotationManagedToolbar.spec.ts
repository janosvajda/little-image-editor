import { expect, test } from "@playwright/test";

test("annotation is a fully managed toolbar with visibility, collapse, layout, and reset behavior", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator('[data-panel="annotations"]');
  await expect(panel).toBeHidden();

  await page.locator("#toolbarPickerButton").click();
  const toggle = page.locator('[data-panel-toggle="annotations"]');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(panel).toBeVisible();
  await expect(toggle).toBeChecked();

  const collapse = panel.locator(".collapse");
  await collapse.click();
  await expect(panel).toHaveClass(/collapsed/);
  await expect(collapse).toHaveAttribute("aria-expanded", "false");
  await collapse.click();

  const header = panel.locator(".panel-header");
  const before = await panel.boundingBox();
  const headerBox = await header.boundingBox();
  await page.mouse.move(headerBox!.x + 80, headerBox!.y + headerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox!.x + 140, headerBox!.y + headerBox!.height / 2 + 50, { steps: 3 });
  await page.mouse.up();
  const moved = await panel.boundingBox();
  expect(Math.abs(moved!.x - before!.x) + Math.abs(moved!.y - before!.y)).toBeGreaterThan(20);

  await page.reload();
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-panel-toggle="annotations"]')).toBeChecked();
  const restored = await panel.boundingBox();
  expect(Math.abs(restored!.x - moved!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored!.y - moved!.y)).toBeLessThanOrEqual(2);

  await page.locator("#editMenu summary").click();
  await page.locator("#resetLayoutButton").click();
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-panel-toggle="annotations"]')).not.toBeChecked();
});

test("annotation auto-open preserves existing toolbar visibility", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("managed-capture");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");

  await expect(page.locator('[data-panel="annotations"]')).toBeVisible();
  await expect(page.locator('[data-panel-toggle="annotations"]')).toBeChecked();
  await expect(page.locator('[data-panel="tools"]')).toBeVisible();
  await expect(page.locator('[data-panel-toggle="tools"]')).toBeChecked();

  await page.locator("#toolbarPickerButton").click();
  await page.locator('[data-panel-toggle="adjust"]').check();
  await expect(page.locator('[data-panel="adjust"]')).toBeVisible();
  await expect(page.locator('[data-panel="annotations"]')).toBeVisible();
});
