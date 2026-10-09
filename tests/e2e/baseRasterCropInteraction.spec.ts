import { expect, type Page, test } from '@playwright/test';

test('selects and moves pixels within an opened raster image layer', async ({
	page,
}) => {
	await page.setContent(
		'<div id="source" style="width:240px;height:180px;background:linear-gradient(90deg,#d21b1b 0 50%,#1955d1 50%)"></div>',
	);
	const source = await page.locator('#source').screenshot({ type: 'png' });

	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({
		name: 'crop-source.png',
		mimeType: 'image/png',
		buffer: source,
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
	await page.locator('[data-tool="crop"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();

	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	await page.mouse.move(bounds.x + 20, bounds.y + 20);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 100, bounds.y + 100, { steps: 5 });
	await page.mouse.up();

	await expect(page.locator('.layer-object-row')).toHaveCount(0);
	const selectedColor = await basePixel(page, 50, 50);
	await page.mouse.move(bounds.x + 50, bounds.y + 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 150, bounds.y + 100, { steps: 5 });
	await page.mouse.up();

	await expect(page.locator('.layer-object-row')).toHaveCount(0);
	expect(await basePixel(page, 50, 50)).toEqual([255, 255, 255, 255]);
	expect(await basePixel(page, 150, 100)).toEqual(selectedColor);
});

async function basePixel(page: Page, x: number, y: number): Promise<number[]> {
	return page.locator('#canvas').evaluate(
		(canvas, position) => [
			...(canvas as HTMLCanvasElement)
				.getContext('2d')!
				.getImageData(position.x, position.y, 1, 1).data,
		],
		{ x, y },
	);
}

test('leaves an empty source when cropping a transparent raster image', async ({
	page,
}) => {
	await page.setContent(
		'<div id="source" style="width:240px;height:180px"><div style="width:120px;height:120px;background:#d21b1b"></div></div>',
	);
	const source = await page.locator('#source').screenshot({
		type: 'png',
		omitBackground: true,
	});
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({
		name: 'transparent-crop-source.png',
		mimeType: 'image/png',
		buffer: source,
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
	await page.locator('[data-tool="crop"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	await page.mouse.move(bounds.x + 20, bounds.y + 20);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 100, bounds.y + 100, { steps: 5 });
	await page.mouse.up();
	await page.mouse.move(bounds.x + 50, bounds.y + 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 150, bounds.y + 140, { steps: 5 });
	await page.mouse.up();

	const sourceAlpha = await page.locator('#canvas').evaluate((canvas) =>
		(canvas as HTMLCanvasElement).getContext('2d')!.getImageData(50, 50, 1, 1)
			.data[3],
	);
	expect(sourceAlpha).toBe(0);
});
