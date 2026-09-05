import { expect, test, type Page } from '@playwright/test';

async function drag(page: Page, from: [number, number], to: [number, number]) {
	const bounds = await page.locator('#overlay').boundingBox();
	if (!bounds) throw new Error('Missing canvas');
	await page.mouse.move(bounds.x + from[0], bounds.y + from[1]);
	await page.mouse.down();
	await page.mouse.move(bounds.x + to[0], bounds.y + to[1], { steps: 6 });
	await page.mouse.up();
}

async function pixel(page: Page, x: number, y: number) {
	return page.locator('#canvas').evaluate((element, position) =>
		[...(element as HTMLCanvasElement).getContext('2d')!.getImageData(position.x, position.y, 1, 1).data], { x, y });
}

for (const type of ['jpeg', 'png'] as const) {
	test(`${type}: selection and repeated moves keep pixels in the original image, with undo and redo`, async ({ page }) => {
		await page.setContent('<div id="source" style="width:240px;height:180px;background:linear-gradient(90deg,#ff0000 0 50%,#0000ff 50%)"></div>');
		const buffer = await page.locator('#source').screenshot({ type });
		await page.goto('/');
		await page.locator('#fileInput').setInputFiles({ name: `source.${type}`, mimeType: `image/${type}`, buffer });
		await page.locator('[data-tool="crop"]').click();
		await page.locator('[data-panel="tools"] .panel-close').click();
		const original = await page.locator('#canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
		await drag(page, [20, 20], [80, 80]);
		expect(await page.locator('#canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(original);
		await expect(page.locator('.layer-object-row')).toHaveCount(0);
		await drag(page, [50, 50], [150, 100]);
		expect(await pixel(page, 50, 50)).toEqual([255, 255, 255, 255]);
		const moved = await pixel(page, 150, 100);
		expect(moved[0]).toBeGreaterThan(250);
		expect(moved[2]).toBeLessThan(5);
		await expect(page.locator('.layer-object-row')).toHaveCount(0);
		await drag(page, [150, 100], [170, 120]);
		expect(await pixel(page, 170, 120)).toEqual(moved);
		await page.locator('#undoButton').click();
		expect(await pixel(page, 150, 100)).toEqual(moved);
		await page.locator('#undoButton').click();
		expect(await page.locator('#canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(original);
		await page.locator('#redoButton').click();
		expect(await pixel(page, 150, 100)).toEqual(moved);
		await expect(page.locator('.layer-object-row')).toHaveCount(0);
		await page.evaluate(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({
				name: 'same-layer.limg',
				createWritable: async () => ({ write: async (blob: Blob) => { (window as Window & { savedImageCrop?: string }).savedImageCrop = await blob.text(); }, close: async () => undefined }),
			}) });
		});
		await page.locator('#saveProjectButton').evaluate((button: HTMLButtonElement) => button.click());
		const project = await page.waitForFunction(() => (window as Window & { savedImageCrop?: string }).savedImageCrop).then((handle) => handle.jsonValue());
		await page.reload();
		await page.locator('#fileInput').setInputFiles({ name: 'same-layer.limg', mimeType: 'application/vnd.little-image-editor.project+json', buffer: Buffer.from(project) });
		expect(await pixel(page, 150, 100)).toEqual(moved);
		expect(await pixel(page, 50, 50)).toEqual([255, 255, 255, 255]);
		await expect(page.locator('.layer-object-row')).toHaveCount(0);
	});
}

test('transparent PNG move preserves transparency and Escape cancels the preview', async ({ page }) => {
	await page.setContent('<div id="source" style="width:240px;height:180px"><div style="width:100px;height:100px;background:red"></div></div>');
	const buffer = await page.locator('#source').screenshot({ omitBackground: true });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer });
	await page.locator('[data-tool="crop"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	await drag(page, [20, 20], [80, 80]);
	const bounds = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(bounds.x + 50, bounds.y + 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 150, bounds.y + 100, { steps: 6 });
	await page.keyboard.press('Escape');
	await page.mouse.up();
	expect(await pixel(page, 50, 50)).toEqual([255, 0, 0, 255]);
	expect((await pixel(page, 150, 100))[3]).toBe(0);
	await drag(page, [20, 20], [80, 80]);
	await drag(page, [50, 50], [150, 100]);
	expect((await pixel(page, 50, 50))[3]).toBe(0);
	expect(await pixel(page, 150, 100)).toEqual([255, 0, 0, 255]);
	await expect(page.locator('.layer-object-row')).toHaveCount(0);
});

test('lasso moves only the selected polygon inside the image layer', async ({ page }) => {
	await page.setContent('<div id="source" style="width:240px;height:180px;background:linear-gradient(90deg,#ff0000 0 50%,#0000ff 50%)"></div>');
	const buffer = await page.locator('#source').screenshot();
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({ name: 'lasso.png', mimeType: 'image/png', buffer });
	await page.locator('[data-tool="crop"]').click();
	await page.locator('[data-crop-selection-kind="lasso"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	const bounds = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(bounds.x + 20, bounds.y + 20);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 80, bounds.y + 20, { steps: 4 });
	await page.mouse.move(bounds.x + 20, bounds.y + 80, { steps: 4 });
	await page.mouse.move(bounds.x + 20, bounds.y + 20, { steps: 4 });
	await page.mouse.up();
	await drag(page, [30, 30], [150, 100]);
	expect(await pixel(page, 30, 30)).toEqual([255, 255, 255, 255]);
	expect(await pixel(page, 70, 70)).toEqual([255, 0, 0, 255]);
	expect(await pixel(page, 150, 100)).toEqual([255, 0, 0, 255]);
	expect(await pixel(page, 190, 140)).toEqual([0, 0, 255, 255]);
	await expect(page.locator('.layer-object-row')).toHaveCount(0);
});
