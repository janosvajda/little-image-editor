import { expect, test } from "@playwright/test";

test("requires a real file name before creating a new image", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();

  const dialog = page.getByRole("dialog");
  const name = page.getByLabel("Image name");
  await expect(name).toHaveValue("");
  await expect(name).toHaveAttribute("placeholder", "Untitled");
  await expect(page.getByLabel("Resolution (PPI)")).toHaveValue("96");
  await expect(page.getByLabel("Resolution (PPI)").locator("option")).toHaveText([
    "72 PPI", "96 PPI", "144 PPI", "150 PPI", "240 PPI", "300 PPI", "600 PPI", "1200 PPI"
  ]);

  await page.getByRole("button", { name: "Create image" }).click();
  await expect(dialog).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "");
  await expect(page.getByText("File name is mandatory.")).toBeVisible();
  await expect(page.locator("#canvasWrap")).toBeHidden();
  const nameBounds = await name.boundingBox();
  const errorBounds = await page.locator("#newImageNameError").boundingBox();
  const fileTypeBounds = await page.getByLabel("File type").boundingBox();
  expect(errorBounds!.y).toBeGreaterThan(nameBounds!.y + nameBounds!.height);
  expect(errorBounds!.y + errorBounds!.height).toBeLessThan(fileTypeBounds!.y);

  const cancelButton = page.getByRole("button", { name: "Cancel" });
  const createButton = page.getByRole("button", { name: "Create" });
  await expect(cancelButton.locator("svg")).toHaveCount(1);
  await expect(createButton.locator("svg")).toHaveCount(1);
  await expect(createButton).not.toHaveClass(/primary/);

  await name.fill("holiday-photo");
  await expect(name).not.toHaveAttribute("aria-invalid", "");
  await expect(page.getByText("File name is mandatory.")).toBeHidden();
  await createButton.click();

  await expect(dialog).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeVisible();
});

test("closes an unnamed new-image dialog through either cancel control", async ({ page }) => {
  await page.goto("/");

  await page.locator("#quickNewButton").click();
  await expect(page.getByLabel("Image name")).toHaveValue("");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();

  await page.locator("#quickNewButton").click();
  await expect(page.getByLabel("Image name")).toHaveValue("");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();
});
