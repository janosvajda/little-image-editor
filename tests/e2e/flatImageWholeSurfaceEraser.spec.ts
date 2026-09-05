import { expect, test, type Page } from '@playwright/test';

test('whole-image eraser flattens stale overlays before editing a JPEG', async ({
	page,
}) => {
	await page.setContent(
		'<div id="source" style="width:800px;height:600px;background:white"></div>',
	);
	const source = await page.locator('#source').screenshot({ type: 'jpeg' });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({
		name: 'flat-surface.jpeg',
		mimeType: 'image/jpeg',
		buffer: source,
	});
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');

	await page.getByRole('button', { name: /Shape tools: Rectangle/ }).click();
	await drag(page, bounds.x + 350, bounds.y + 250, bounds.x + 450, bounds.y + 350);
	await page.keyboard.press('v');
	await page.mouse.click(bounds.x + 600, bounds.y + 450);
	await expect(page.locator('.layer-object-row.active')).toHaveCount(0);

	await page.keyboard.press('e');
	await drag(page, bounds.x + 350, bounds.y + 280, bounds.x + 350, bounds.y + 320);

	await expect(page.locator('.layer-object-row')).toHaveCount(0);
	const pixel = await page.locator('#canvas').evaluate((canvas) =>
		Array.from(
			(canvas as HTMLCanvasElement)
				.getContext('2d')!
				.getImageData(350, 300, 1, 1).data,
		),
	);
	expect(pixel).toEqual([255, 255, 255, 255]);
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
