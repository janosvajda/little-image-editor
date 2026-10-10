import { expect, test } from '@playwright/test';

test('drawing after a crop remains visible in the previously cut paint area', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageTransparent').check();
	await page.locator('#createImageButton').click();
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');

	await drag(page, bounds.x + 320, bounds.y + 300, bounds.x + 620, bounds.y + 300);
	await page.locator('[data-panel="tools"] [data-tool="crop"]').click();
	await drag(page, bounds.x + 380, bounds.y + 260, bounds.x + 430, bounds.y + 340);
	await drag(page, bounds.x + 400, bounds.y + 300, bounds.x + 400, bounds.y + 450);
	await drag(page, bounds.x + 500, bounds.y + 260, bounds.x + 550, bounds.y + 340);
	await drag(page, bounds.x + 520, bounds.y + 300, bounds.x + 520, bounds.y + 450);

	await page.getByRole('button', { name: /Brush tools:/ }).click();
	await drag(page, bounds.x + 700, bounds.y + 550, bounds.x + 400, bounds.y + 300);
	await drag(page, bounds.x + 370, bounds.y + 300, bounds.x + 560, bounds.y + 300);

	const alpha = await page.locator('.annotation-canvas').evaluate((canvas) => {
		const context = (canvas as HTMLCanvasElement).getContext('2d')!;
		return [400, 520].map(
			(x) => context.getImageData(x, 300, 1, 1).data[3],
		);
	});
	expect(alpha.every((value) => value > 0)).toBe(true);
});

async function drag(
	page: import('@playwright/test').Page,
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
