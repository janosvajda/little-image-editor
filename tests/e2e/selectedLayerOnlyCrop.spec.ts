import { expect, test, type Page } from '@playwright/test';

test('crop extracts only the selected item', async ({ page }) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageTransparent').check();
	await page.locator('#createImageButton').click();
	await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
	await page.locator('#fillInput').check();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');

	await page.locator('#colorInput').fill('#d02020');
	await drag(page, bounds.x + 300, bounds.y + 100, bounds.x + 500, bounds.y + 220);
	await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
	await page.locator('#colorInput').fill('#2050d0');
	await drag(page, bounds.x + 580, bounds.y + 220, bounds.x + 380, bounds.y + 100);
	// The first, red rectangle is the bottom item of the layer.
	await page
		.locator('.layer-item-row')
		.last()
		.evaluate((row) => (row as HTMLElement).click());

	await page.locator('[data-panel="tools"] [data-tool="crop"]').click();
	await drag(page, bounds.x + 400, bounds.y + 120, bounds.x + 460, bounds.y + 200);
	await drag(page, bounds.x + 430, bounds.y + 150, bounds.x + 430, bounds.y + 350);

	const colors = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return {
			source: [...context.getImageData(430, 150, 1, 1).data],
			destination: [...context.getImageData(430, 350, 1, 1).data],
		};
	});
	expect(colors.source.slice(0, 3)).toEqual([32, 80, 208]);
	expect(colors.destination.slice(0, 3)).toEqual([208, 32, 32]);
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
	await page.mouse.move(toX, toY, { steps: 6 });
	await page.mouse.up();
}
