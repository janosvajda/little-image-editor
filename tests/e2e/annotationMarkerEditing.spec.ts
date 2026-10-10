import { expect, test } from "@playwright/test";
import { toggleQaReporting } from "./support/qaReporting";

test("manually sets and visibly resets marker numbering and edits the generated report", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("marker-controls");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await page.getByRole("button", { name: "Number", exact: true }).click();
  await toggleQaReporting(page);

  const nextNumber = page.getByLabel("Next marker number");
  await nextNumber.fill("0");
  await nextNumber.press("Tab");
  await expect(page.getByLabel("Next marker number")).toHaveValue("0");

  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * .7, bounds!.y + bounds!.height * .5);
  await expect(page.getByLabel("Next marker number")).toHaveValue("1");

  await nextNumber.fill("8");
  await nextNumber.press("Tab");
  await page.getByRole("button", { name: /Reset to 1/ }).click();
  await expect(nextNumber).toHaveValue("1");
  await expect(page.getByLabel("Next marker number")).toHaveValue("1");

  await toggleQaReporting(page);
  const report = page.getByLabel("Editable Markdown report");
  await expect(report).toBeEditable();
  await report.fill("Custom report text written by the user.");
  await expect(report).toHaveValue("Custom report text written by the user.");
});
