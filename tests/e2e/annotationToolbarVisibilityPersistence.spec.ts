import { expect, test } from "@playwright/test";
import { QA_REPORTING_TITLE } from "../../src/app/features/annotations/bugReportMetadata";

test("annotation uses the standard toolbar header and Toolbars visibility persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("#toolbarPickerButton").click();
  const toggle = page.locator('[data-panel-toggle="annotations"]');
  await toggle.check();

  const panel = page.locator('[data-panel="annotations"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header button")).toHaveCount(2);
  await expect(panel.locator(".panel-header .collapse")).toBeVisible();
  await expect(panel.getByRole("button", { name: `Close ${QA_REPORTING_TITLE}` })).toBeVisible();

  await toggle.uncheck();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-panel-toggle="annotations"]')).not.toBeChecked();
});
