import { expect, test } from "@playwright/test";

test("editable bug-report text persists per image and regenerates only on an explicit field change", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("report-persistence");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");

  const report = page.getByLabel("Editable Markdown report");
  await report.fill("A carefully edited custom report.");
  await page.waitForTimeout(700);
  await page.reload();
  await expect(report).toHaveValue("A carefully edited custom report.");

  await page.locator("#annotationExpected").fill("The toolbar stays in place");
  await expect(report).toHaveValue(/## Expected behaviour\n\nThe toolbar stays in place/);
  await expect(report).not.toHaveValue("A carefully edited custom report.");
});
