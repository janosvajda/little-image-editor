import { expect, test } from "@playwright/test";

test("creates an unnamed image and recommends untitled.limg on first save", async ({ page }) => {
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

  const cancelButton = page.getByRole("button", { name: "Cancel" });
  const createButton = page.getByRole("button", { name: "Create" });
  await expect(cancelButton.locator("svg")).toHaveCount(1);
  await expect(createButton.locator("svg")).toHaveCount(1);
  await expect(createButton).not.toHaveClass(/primary/);

  await createButton.click();

  await expect(dialog).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeVisible();
  await page.evaluate(() => {
    const testWindow = window as Window & {
      suggestedProjectName?: string;
      showSaveFilePicker?: (options: { suggestedName?: string }) => Promise<FileSystemFileHandle>;
    };
    testWindow.showSaveFilePicker = (options) => {
      testWindow.suggestedProjectName = options.suggestedName;
      return Promise.resolve({
        name: "untitled.limg",
        createWritable: () => Promise.resolve({
          write: () => Promise.resolve(),
          close: () => Promise.resolve(),
        }),
      } as unknown as FileSystemFileHandle);
    };
  });
  await page.locator("#quickSaveButton").click();
  await expect.poll(() => page.evaluate(() => (window as Window & { suggestedProjectName?: string }).suggestedProjectName)).toBe("untitled.limg");
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
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#canvasWrap")).toBeHidden();
});
