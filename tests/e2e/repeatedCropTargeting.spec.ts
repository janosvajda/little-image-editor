import { expect, test, type Locator } from '@playwright/test';

test('a moved crop fragment does not block cropping another retained layer', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
	await page.locator('#fillInput').check();

	await drag(overlay, bounds.x + 100, bounds.y + 100, bounds.x + 200, bounds.y + 200, 1);
	await drag(overlay, bounds.x + 300, bounds.y + 100, bounds.x + 400, bounds.y + 200, 2);
	await expect(page.locator('.layer-object-row')).toHaveCount(2);

	await page.locator('[data-tool="crop"]').click();
	await drag(overlay, bounds.x + 90, bounds.y + 90, bounds.x + 210, bounds.y + 210, 3);
	await expect(page.locator('.layer-object-row')).toHaveCount(3);
	await expect(page.locator('[data-tool="crop"]')).toHaveClass(/active/);

	await drag(overlay, bounds.x + 174, bounds.y + 66, bounds.x + 174, bounds.y + 266, 4);
	await expect(page.locator('[data-tool="crop"]')).toHaveClass(/active/);
	const pixels = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			sourceAlpha: context.getImageData(150, 150, 1, 1).data[3],
			destinationAlpha: context.getImageData(150, 350, 1, 1).data[3],
		};
	});
	expect(pixels.sourceAlpha).toBe(0);
	expect(pixels.destinationAlpha).toBeGreaterThan(0);
	await drag(overlay, bounds.x + 290, bounds.y + 90, bounds.x + 410, bounds.y + 210, 5);

	await expect(page.locator('.layer-object-row')).toHaveCount(4);
	await expect(page.locator('.layer-object-row.active')).toContainText(
		'Raster fragment',
	);
});

async function drag(
	target: Locator,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	pointerId: number,
): Promise<void> {
	await target.dispatchEvent('pointerdown', {
		clientX: fromX,
		clientY: fromY,
		button: 0,
		buttons: 1,
		pointerId,
	});
	await target.dispatchEvent('pointermove', {
		clientX: toX,
		clientY: toY,
		button: 0,
		buttons: 1,
		pointerId,
	});
	await target.dispatchEvent('pointerup', {
		clientX: toX,
		clientY: toY,
		button: 0,
		buttons: 0,
		pointerId,
	});
}
