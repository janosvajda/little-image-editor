import { expect, test } from "@playwright/test";

test("shows compact save and close icons and confirms destructive image closing", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.getByLabel("Image name").fill("close-test");
  await page.getByRole("button", { name: "Create image" }).click();

  await expect(page.locator("#quickSaveButton svg")).toHaveClass(/filled-icon/);
  await expect(page.locator("#quickSaveButton svg path")).toHaveAttribute("fill-rule", "evenodd");
  await expect(page.locator("#quickCloseImageButton svg")).toBeVisible();
  await expect(page.locator("#quickCloseImageButton")).toBeEnabled();

  await page.locator("#quickCloseImageButton").click();
  const dialog = page.getByRole("dialog", { name: "Close image?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Are you sure you want to close this image without saving?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeVisible();

  await page.locator("#fileMenu summary").click();
  const menuClose = page.getByRole("menuitem", { name: "Close image" });
  await expect(menuClose.locator("svg")).toHaveCount(1);
  await menuClose.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close without saving" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();
  await expect(page.locator("#quickCloseImageButton")).toBeDisabled();
});
