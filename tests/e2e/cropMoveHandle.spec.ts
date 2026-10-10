import { expect, test } from '@playwright/test';

const Crop = { Left: 220, Size: 80 } as const;
const Drag = { X: 35, Y: 45 } as const;

for (const zoom of ['100', '50', '200']) {
	for (const top of [120, 5]) {
		test(`dragging a cut piece at ${zoom}% near y=${top} moves pixels without resizing or selecting again`, async ({ page }) => {
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
			await expect(page.locator('.layer-item-row.active')).toContainText('Pixels');
			await page.locator('#zoomSelect').selectOption(zoom);

			// Grab the cut piece through its rendered frame, rather than computing production geometry.
			const piece = page.locator('.selection-frame');
			const pieceBounds = (await piece.boundingBox())!;
			const before = Number(await piece.getAttribute('x'));
			const count = await page.locator('.layer-item-row').count();
			await drag(pieceBounds.x + pieceBounds.width / 2, pieceBounds.y + pieceBounds.height / 2, Drag.X, Drag.Y);
			await expect.poll(async () => Number(await piece.getAttribute('x')))
				.toBeCloseTo(before + Drag.X / (Number(zoom) / 100), 0);
			await expect(page.locator('.layer-item-row')).toHaveCount(count);
			await expect(page.locator('.crop-selection-frame')).toHaveCount(0);
			await expect(piece).toHaveAttribute('width', String(Crop.Size));
			await expect(piece).toHaveAttribute('height', String(Crop.Size));
			const alpha = await page.locator('.annotation-canvas').evaluate((element, position) =>
				(element as HTMLCanvasElement).getContext('2d')!.getImageData(position.x, position.y, 1, 1).data[3],
				{ x: Crop.Left + 2, y: top + 2 });
			expect(alpha).toBe(0);
		});
	}
}
