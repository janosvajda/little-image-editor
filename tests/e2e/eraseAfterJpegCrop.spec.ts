import { expect, test, type Page } from '@playwright/test';

test('erases pixels from a selected crop created after drawing on a JPEG', async ({
	page,
}) => {
	await page.setContent(
		'<div id="source" style="width:800px;height:600px;background:white"></div>',
	);
	const source = await page.locator('#source').screenshot({ type: 'jpeg' });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({
		name: 'eraser-crop-source.jpeg',
		mimeType: 'image/jpeg',
		buffer: source,
	});
	await page.getByRole('button', { name: /Brush tools:/ }).click();
	await page.locator('#colorInput').fill('#000000');
	await page.locator('#sizeInput').fill('20');
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	await drag(page, bounds.x + 340, bounds.y + 260, bounds.x + 440, bounds.y + 260);
	await page.locator('[data-panel="tools"] [data-tool="crop"]').click();
	// Cuts and erasing take what is under their starting point, so both start on the stroke.
	await drag(page, bounds.x + 345, bounds.y + 255, bounds.x + 480, bounds.y + 300);

	const selected = page.locator('.layer-item-row.active');
	await expect(selected).toContainText('Pixels');
	const selectedId = await selected.getAttribute('data-object-id');
	await page.locator('[data-tool="eraser"]').click();
	await drag(page, bounds.x + 380, bounds.y + 262, bounds.x + 380, bounds.y + 280);

	await expect(page.locator('.layer-item-row.active')).toHaveAttribute(
		'data-object-id',
		selectedId!,
	);
	const pixels = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			erasedAlpha: context.getImageData(380, 260, 1, 1).data[3],
			retainedAlpha: context.getImageData(420, 260, 1, 1).data[3],
		};
	});
	expect(pixels.erasedAlpha).toBe(0);
	expect(pixels.retainedAlpha).toBeGreaterThan(0);
});

test('erases the base JPEG when no retained object is selected', async ({ page }) => {
	await page.setContent(
		'<div id="source" style="width:800px;height:600px;background:#111111"></div>',
	);
	const source = await page.locator('#source').screenshot({ type: 'jpeg' });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({
		name: 'flat-eraser-source.jpeg',
		mimeType: 'image/jpeg',
		buffer: source,
	});
	await expect(page.locator('.layer-object-row.active')).toHaveCount(0);
	await page.locator('[data-tool="eraser"]').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	await drag(page, bounds.x + 400, bounds.y + 280, bounds.x + 400, bounds.y + 320);

	const pixel = await page.locator('#canvas').evaluate((canvas) =>
		Array.from(
			(canvas as HTMLCanvasElement)
				.getContext('2d')!
				.getImageData(400, 300, 1, 1).data,
		),
	);
	expect(pixel).toEqual([255, 255, 255, 255]);
	await expect(page.locator('.layer-object-row')).toHaveCount(0);
});

async function drag(
	page: Page,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
): Promise<void> {
	await page.mouse.move(fromX, fromY);
	await page.mouse.down();
	await page.mouse.move(toX, toY, { steps: 8 });
	await page.mouse.up();
}
