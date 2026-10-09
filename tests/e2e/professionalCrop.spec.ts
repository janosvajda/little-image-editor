import { expect, test } from '@playwright/test';

test('immediately cuts selected pixels into a movable, deletable layer', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');

	await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
	await overlay.dispatchEvent('pointerdown', {
		clientX: bounds.x + 100,
		clientY: bounds.y + 100,
		pointerId: 1,
	});
	await overlay.dispatchEvent('pointermove', {
		clientX: bounds.x + 300,
		clientY: bounds.y + 250,
		pointerId: 1,
	});
	await overlay.dispatchEvent('pointerup', {
		clientX: bounds.x + 300,
		clientY: bounds.y + 250,
		pointerId: 1,
	});

	await page.locator('[data-tool="crop"]').click();
	await overlay.dispatchEvent('pointerdown', {
		clientX: bounds.x + 50,
		clientY: bounds.y + 50,
		pointerId: 2,
	});
	await overlay.dispatchEvent('pointermove', {
		clientX: bounds.x + 450,
		clientY: bounds.y + 350,
		pointerId: 2,
	});
	await overlay.dispatchEvent('pointerup', {
		clientX: bounds.x + 450,
		clientY: bounds.y + 350,
		pointerId: 2,
	});

	await expect(page.locator('#applyCropButton')).toHaveCount(0);
	await expect(page.locator('#dimensions')).toHaveText('800 × 600 px');
	await expect(page.locator('.layer-object-row')).toHaveCount(2);
	await expect(page.locator('[data-tool="crop"]')).toHaveClass(/active/);
	const selectedRow = page.locator('.layer-object-row.active');
	await expect(selectedRow).toContainText('Raster fragment');
	const pixels = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			inside: context.getImageData(100, 150, 1, 1).data[3],
		};
	});
	expect(pixels.inside).toBeGreaterThan(0);
	await page.keyboard.press('Delete');
	await expect(page.locator('.layer-object-row')).toHaveCount(1);
	await page.locator('#undoButton').click();
	await expect(page.locator('#dimensions')).toHaveText('800 × 600 px');
	await expect(page.locator('.layer-object-row')).toHaveCount(2);
});
