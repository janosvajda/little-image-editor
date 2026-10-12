import { expect, test } from "@playwright/test";

test("closes an unnamed new-image dialog through either cancel control", async ({ page }) => {
  await page.goto("/");

  await page.locator("#quickNewButton").click();
  await expect(page.getByLabel("Image name")).toHaveValue("");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();

  await page.locator("#quickNewButton").click();
  await expect(page.getByLabel("Image name")).toHaveValue("");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();
});
