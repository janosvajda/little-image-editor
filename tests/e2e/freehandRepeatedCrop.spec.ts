import { expect, test, type Locator } from '@playwright/test';

test('crop stays active while extracting and moving multiple freehand regions', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');

	await drag(overlay, bounds.x + 100, bounds.y + 100, bounds.x + 500, bounds.y + 300, 1);
	await expect(page.locator('.layer-item-row')).toHaveCount(1);
	await page.locator('[data-panel="tools"] [data-tool="crop"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	// A cut takes what is under its starting point, here the stroke.
	await drag(overlay, bounds.x + 100, bounds.y + 100, bounds.x + 240, bounds.y + 220, 2);

	await expect(page.locator('.layer-item-row')).toHaveCount(2);
	await expect(page.locator('[data-panel="tools"] [data-tool="crop"]')).toHaveClass(/active/);
	await expect(page.locator('.layer-item-row.active')).toContainText('Pixels');

	const moveFrom = { x: bounds.x + 150, y: bounds.y + 125 };
	await page.mouse.move(moveFrom.x, moveFrom.y);
	await page.mouse.down();
	await page.mouse.move(moveFrom.x, moveFrom.y + 300, { steps: 5 });
	await page.mouse.up();
	await expect(page.locator('[data-panel="tools"] [data-tool="crop"]')).toHaveClass(/active/);
	const movedPixels = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			sourceAlpha: context.getImageData(150, 125, 1, 1).data[3],
			destinationAlpha: context.getImageData(150, 425, 1, 1).data[3],
		};
	});
	expect(movedPixels.sourceAlpha).toBe(0);
	expect(movedPixels.destinationAlpha).toBeGreaterThan(0);
	await drag(overlay, bounds.x + 300, bounds.y + 200, bounds.x + 520, bounds.y + 330, 4);

	await expect(page.locator('.layer-item-row')).toHaveCount(3);
	await expect(page.locator('[data-panel="tools"] [data-tool="crop"]')).toHaveClass(/active/);
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
