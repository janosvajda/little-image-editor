import { expect, test } from '@playwright/test';

test('a JPEG crop remains movable after choosing Select', async ({ page }) => {
	await page.setContent('<div id="source" style="width:240px;height:180px;background:linear-gradient(90deg,red 0 50%,blue 50%)"></div>');
	const buffer = await page.locator('#source').screenshot({ type: 'jpeg' });
	await page.goto('/');
	await page.locator('#fileInput').setInputFiles({ name: 'source.jpg', mimeType: 'image/jpeg', buffer });
	await page.locator('[data-panel="tools"] [data-tool="crop"]').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	const bounds = (await page.locator('#overlay').boundingBox())!;
	const drag = async (from: [number, number], to: [number, number]) => {
		await page.mouse.move(bounds.x + from[0], bounds.y + from[1]);
		await page.mouse.down();
		await page.mouse.move(bounds.x + to[0], bounds.y + to[1], { steps: 5 });
		await page.mouse.up();
	};
	await drag([20, 20], [80, 80]);
	await page.keyboard.press('v');
	await drag([50, 50], [150, 100]);
	const alphaAt = (canvas: string, x: number, y: number) => page.locator(canvas).evaluate((element, point) => (element as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data[3], { x, y });
	// The cut leaves a hole in the image, and the piece moved with Select.
	expect(await alphaAt('#canvas', 50, 50)).toBe(0);
	expect(await alphaAt('.annotation-canvas', 50, 50)).toBe(0);
	expect(await alphaAt('.annotation-canvas', 150, 100)).toBe(255);
	await expect(page.locator('.layer-item-row')).toHaveCount(1);
});
