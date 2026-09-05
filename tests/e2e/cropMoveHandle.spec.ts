import { expect, test } from '@playwright/test';

const Crop = { Left: 220, Size: 80 } as const;
const Drag = { X: 35, Y: 45 } as const;

for (const zoom of ['100', '50', '200']) {
	for (const top of [120, 5]) {
		test(`crop move handle at ${zoom}% near y=${top} moves pixels without resizing or selecting again`, async ({ page }) => {
			await page.goto('/');
			await page.locator('#quickNewButton').click();
			await page.locator('#newImageTransparent').check();
			await page.locator('#createImageButton').click();
			await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
			await page.locator('#fillInput').check();
			await page.locator('[data-panel="tools"] .panel-close').click();
			const drag = async (x: number, y: number, dx: number, dy: number) => {
				await page.mouse.move(x, y);
				await page.mouse.down();
				await page.mouse.move(x + dx, y + dy, { steps: 6 });
				await page.mouse.up();
			};
			const bounds = (await page.locator('#overlay').boundingBox())!;
			await drag(bounds.x + 200, bounds.y, 160, 260);
			await page.keyboard.press('c');
			await drag(bounds.x + Crop.Left, bounds.y + top, Crop.Size, Crop.Size);
			await expect(page.locator('.layer-object-row.active')).toContainText('Raster fragment');
			await page.locator('#zoomSelect').selectOption(zoom);

			// Locate the rendered icon, rather than computing the hit position from production geometry.
			const circle = page.locator('.selection-move-handle circle');
			const handle = (await circle.boundingBox())!;
			const before = Number(await circle.getAttribute('cx'));
			const count = await page.locator('.layer-object-row').count();
			await drag(handle.x + handle.width / 2, handle.y + handle.height / 2, Drag.X, Drag.Y);
			await expect.poll(async () => Number(await circle.getAttribute('cx')))
				.toBeCloseTo(before + Drag.X / (Number(zoom) / 100), 0);
			await expect(page.locator('.layer-object-row')).toHaveCount(count);
			await expect(page.locator('.crop-selection-frame')).toHaveCount(0);
			const frame = page.locator('.selection-frame');
			await expect(frame).toHaveAttribute('width', String(Crop.Size));
			await expect(frame).toHaveAttribute('height', String(Crop.Size));
			const alpha = await page.locator('.annotation-canvas').evaluate((element, position) =>
				(element as HTMLCanvasElement).getContext('2d')!.getImageData(position.x, position.y, 1, 1).data[3],
				{ x: Crop.Left + 2, y: top + 2 });
			expect(alpha).toBe(0);
		});
	}
}
