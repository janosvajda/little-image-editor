import { expect, test } from '@playwright/test';

test('filters a selected raster area without creating or changing editable layers', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageName').fill('raster-filter');
	await page.locator('#createImageButton').click();

	const layerRowsBefore = await page.locator('.layer-row').count();
	await page.locator('[data-tool="select"]').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.move(bounds!.x + 350, bounds!.y + 250);
	await page.mouse.down();
	await page.mouse.move(bounds!.x + 550, bounds!.y + 400);
	await page.mouse.up();

	await expect(page.locator('.raster-selection-frame')).toBeVisible();
	expect(await page.locator('.layer-row').count()).toBe(layerRowsBefore);

	await page.locator('#effectSelect').selectOption('invert');
	await page.locator('#effectAmountInput').fill('100');
	await page.locator('#applyEffectButton').click();

	const colors = await page.locator('#canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			inside: [...context.getImageData(450, 300, 1, 1).data],
			outside: [...context.getImageData(50, 50, 1, 1).data],
		};
	});
	expect(colors.inside.slice(0, 3)).toEqual([0, 0, 0]);
	expect(colors.outside.slice(0, 3)).toEqual([255, 255, 255]);
	expect(await page.locator('.layer-row').count()).toBe(layerRowsBefore);
});
