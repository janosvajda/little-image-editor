import { expect, test } from "@playwright/test";

test("manually sets and visibly resets marker numbering and edits the generated report", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("marker-controls");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await page.getByRole("button", { name: "Number", exact: true }).click();

  const nextNumber = page.getByLabel("Next marker number");
  await nextNumber.fill("0");
  await nextNumber.press("Tab");
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 0");

  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * .7, bounds!.y + bounds!.height * .5);
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 1");

  await nextNumber.fill("8");
  await nextNumber.press("Tab");
  await page.getByRole("button", { name: "Restart numbering at 1" }).click();
  await expect(nextNumber).toHaveValue("1");
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 1");

  const report = page.getByLabel("Editable bug report");
  await expect(report).toBeEditable();
  await report.fill("Custom report text written by the user.");
  await expect(report).toHaveValue("Custom report text written by the user.");
});
