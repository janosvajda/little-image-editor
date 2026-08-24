import { expect, test } from "@playwright/test";

test("keeps Close directly after Save and renders a compact confirmation", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.getByLabel("Image name").fill("layout-test");
  await page.getByRole("button", { name: "Create image" }).click();

  expect(await page.locator("#quickSaveButton + #quickCloseImageButton").count()).toBe(1);
  await page.locator("#quickCloseImageButton").click();

  const dialog = page.locator("#closeImageDialog");
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.width).toBeLessThanOrEqual(420);
  expect(dialogBounds!.height).toBeLessThanOrEqual(260);

  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const discard = dialog.getByRole("button", { name: "Close without saving" });
  const cancelBounds = await cancel.boundingBox();
  const discardBounds = await discard.boundingBox();
  expect(cancelBounds!.height).toBeLessThanOrEqual(40);
  expect(discardBounds!.height).toBeLessThanOrEqual(40);
  expect(Math.abs(cancelBounds!.y - discardBounds!.y)).toBeLessThanOrEqual(1);
  await expect(dialog.locator("footer svg").first()).toHaveCSS("width", "13px");
  await expect(dialog.locator("footer svg").last()).toHaveCSS("height", "13px");
});
