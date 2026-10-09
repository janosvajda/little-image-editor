import { expect, test, type Page } from '@playwright/test';

const CropIdSelector = '.layer-object-row.active';
const Pixel = { Black: [0, 0, 0, 255], Blue: [0, 0, 255, 255] } as const;
const CroppedStroke = { Color: '#0000ff', Width: '40' } as const;

test('native double-clicks select without paint, and paint stays with a crop through moving and project reload', async ({ page }) => {
	await page.setContent('<div id="source" style="width:240px;height:180px;background:red"></div>');
	const source = await page.locator('#source').screenshot({ type: 'png' });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({ name: 'raster.png', mimeType: 'image/png', buffer: source });
	await page.getByRole('button', { name: /Brush tools:/ }).click();
	await page.locator('#colorInput').fill(CroppedStroke.Color);
	await page.locator('#sizeInput').fill(CroppedStroke.Width);
	await page.locator('[data-panel="tools"] .panel-close').click();
	const bounds = await page.locator('#overlay').boundingBox();
	if (!bounds) throw new Error('Canvas is not visible');
	const drag = (x: number, y: number, toX: number, toY: number) => draw(page, bounds.x + x, bounds.y + y, bounds.x + toX, bounds.y + toY);
	await drag(30, 50, 90, 50);
	await page.keyboard.press('c');
	await drag(20, 20, 100, 100);
	await drag(50, 50, 150, 100);
	const cropId = await page.locator(CropIdSelector).getAttribute('data-object-id');
	await page.keyboard.press('v');
	await page.mouse.click(bounds.x + 220, bounds.y + 20);
	await expect(page.locator(CropIdSelector)).toHaveCount(0);
	await page.keyboard.press('b');
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="tools"]').check();
	await page.keyboard.press('Escape');
	await page.locator('#colorInput').fill('#000000');
	await page.locator('[data-panel="tools"] .panel-close').click();
	const beforeSelection = await annotationImage(page);
	await page.mouse.dblclick(bounds.x + 150, bounds.y + 100);
	await expect(page.locator(CropIdSelector)).toHaveAttribute('data-object-id', cropId!);
	expect(await annotationImage(page)).toBe(beforeSelection);
	await expect(page.locator('.layer-object-row')).toHaveCount(2);
	await expect(page.locator('.layer-row.active')).toHaveCount(1);

	await page.keyboard.press('b');
	await drag(135, 100, 170, 100);
	await expect(page.locator(CropIdSelector)).toHaveAttribute('data-object-id', cropId!);
	await expect(page.locator('.layer-object-row')).toHaveCount(2);
	expect(await pixelAt(page, 150, 100)).toEqual(Pixel.Black);
	await page.locator('#undoButton').click();
	expect(await pixelAt(page, 150, 100)).toEqual(Pixel.Blue);
	await page.locator('#redoButton').click();
	expect(await pixelAt(page, 150, 100)).toEqual(Pixel.Black);

	await page.keyboard.press('v');
	await page.mouse.dblclick(bounds.x + 150, bounds.y + 100);
	await drag(150, 100, 130, 120);
	expect(await pixelAt(page, 130, 120)).toEqual(Pixel.Black);
	const moved = await annotationImage(page);
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({
			name: 'painted-crop.limg',
			createWritable: async () => ({ write: async (blob: Blob) => { (window as Window & { savedCrop?: string }).savedCrop = await blob.text(); }, close: async () => undefined }),
		}) });
	});
	await page.locator('#saveProjectButton').evaluate((button: HTMLButtonElement) => button.click());
	const project = await page.waitForFunction(() => (window as Window & { savedCrop?: string }).savedCrop).then((handle) => handle.jsonValue());
	await page.reload();
	await page.locator('#fileInput').setInputFiles({ name: 'painted-crop.limg', mimeType: 'application/vnd.little-image-editor.project+json', buffer: Buffer.from(project) });
	await expect.poll(() => annotationImage(page)).toBe(moved);
	await expect(page.locator('.layer-object-row')).toHaveCount(2);
	const reopenedBounds = await page.locator('#overlay').boundingBox();
	if (!reopenedBounds) throw new Error('Reopened canvas is not visible');
	await page.mouse.dblclick(reopenedBounds.x + 130, reopenedBounds.y + 120);
	await page.keyboard.press('e');
	await page.mouse.click(reopenedBounds.x + 130, reopenedBounds.y + 120);
	expect((await pixelAt(page, 130, 120))[3]).toBe(0);
	await page.keyboard.press('v');
	await page.mouse.click(reopenedBounds.x + 130, reopenedBounds.y + 120);
	await expect(page.locator('.layer-object-row.active')).toHaveCount(0);
	const beforeRowSelection = await annotationImage(page);
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.locator(`[data-object-id="${cropId}"] .layer-name`).dblclick();
	await expect(page.locator(CropIdSelector)).toHaveAttribute('data-object-id', cropId!);
	expect(await annotationImage(page)).toBe(beforeRowSelection);
});

async function annotationImage(page: Page): Promise<string> {
	return page.locator('.annotation-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
	return page.locator('.annotation-canvas').evaluate((canvas, point) => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });
}
async function draw(page: Page, x: number, y: number, toX: number, toY: number): Promise<void> {
	await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(toX, toY, { steps: 6 }); await page.mouse.up();
}
