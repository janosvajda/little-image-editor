import { expect, test, type Page } from '@playwright/test';

for (const format of ['jpeg', 'png'] as const) {
	test(`draws above a moved ${format} crop after painting an earlier layer`, async ({ page }) => {
		await page.setContent('<div id="source" style="width:240px;height:180px;background:red"></div>');
		const source = await page.locator('#source').screenshot({ type: format });
		await page.goto('/');
		await page.locator('#fileInput').setInputFiles({
			name: `source.${format}`, mimeType: `image/${format}`, buffer: source,
		});
		await page.getByRole('button', { name: /Brush tools:/ }).click();
		await page.locator('#colorInput').fill('#000000');
		await page.locator('[data-panel="tools"] .panel-close').click();
		const bounds = await page.locator('#overlay').boundingBox();
		if (!bounds) throw new Error('Canvas overlay is not visible.');
		const drag = (fromX: number, fromY: number, toX: number, toY: number) =>
			draw(page, bounds.x + fromX, bounds.y + fromY, bounds.x + toX, bounds.y + toY);
		await drag(190, 140, 210, 140);
		await page.keyboard.press('c');
		await drag(20, 20, 100, 100);
		await drag(50, 50, 150, 100);
		await page.keyboard.press('b');
		await drag(130, 100, 170, 100);
		const pixel = await page.locator('.annotation-canvas').evaluate((canvas) =>
			Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(150, 100, 1, 1).data),
		);
		expect(pixel).toEqual([0, 0, 0, 255]);
	});
}

async function draw(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
	await page.mouse.move(fromX, fromY);
	await page.mouse.down();
	await page.mouse.move(toX, toY, { steps: 6 });
	await page.mouse.up();
}
