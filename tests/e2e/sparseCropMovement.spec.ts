import { expect, test } from '@playwright/test';

test('dragging blank space inside a cropped stroke moves its pixels instead of drawing another crop', async ({ page }) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await page.locator('[data-panel="tools"] .panel-close').click();
	const bounds = (await page.locator('#overlay').boundingBox())!;
	const drag = async (x: number, y: number, dx: number, dy: number) => {
		await page.mouse.move(bounds.x + x, bounds.y + y);
		await page.mouse.down();
		await page.mouse.move(bounds.x + x + dx, bounds.y + y + dy, { steps: 8 });
		await page.mouse.up();
	};
	await drag(300, 150, 0, 250);
	await page.keyboard.press('c');
	// A cut takes what is under its starting point, so it starts on the stroke.
	await drag(300, 220, 150, 100);
	await expect(page.locator('.layer-item-row.active')).toContainText('Pixels');
	const count = await page.locator('.layer-item-row').count();
	// This lies inside the selected rectangle, but away from the stroke's opaque pixels.
	await drag(360, 260, 100, 60);
	await expect(page.locator('.selection-frame')).toHaveAttribute('x', '400');
	await expect(page.locator('.selection-frame')).toHaveAttribute('y', '280');
	await expect(page.locator('.layer-item-row')).toHaveCount(count);
	await expect(page.locator('.crop-selection-frame')).toHaveCount(0);
	const alpha = await page.locator('.annotation-canvas').evaluate((element) => {
		const context = (element as HTMLCanvasElement).getContext('2d')!;
		return { source: context.getImageData(300, 270, 1, 1).data[3], destination: context.getImageData(400, 330, 1, 1).data[3] };
	});
	expect(alpha.source).toBe(0);
	expect(alpha.destination).toBeGreaterThan(0);
	// Move the same crop again from blank space, then undo and redo that move.
	await drag(460, 320, -50, 40);
	await expect(page.locator('.selection-frame')).toHaveAttribute('x', '350');
	await expect(page.locator('.selection-frame')).toHaveAttribute('y', '320');
	await expect(page.locator('.crop-selection-frame')).toHaveCount(0);
	await page.locator('#undoButton').click();
	await page.locator('#redoButton').click();
	await page.keyboard.press('v');
	// The first click selects the piece's layer; the second drills in to the piece.
	await page.mouse.click(bounds.x + 350, bounds.y + 370);
	await page.mouse.click(bounds.x + 350, bounds.y + 370);
	await expect(page.locator('.selection-frame')).toHaveAttribute('x', '350');
	await page.keyboard.press('c');
	// Crop a different remaining section of the original stroke.
	await drag(300, 150, 100, 50);
	await expect(page.locator('.layer-item-row')).toHaveCount(count + 1);
	await expect(page.locator('.selection-frame')).toHaveAttribute('y', '150');
	await drag(330, 175, 200, 0);
	await expect(page.locator('.selection-frame')).toHaveAttribute('x', '500');
	await expect(page.locator('.crop-selection-frame')).toHaveCount(0);

	await page.mouse.move(bounds.x + 600, bounds.y + 400);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 700, bounds.y + 470, { steps: 5 });
	await expect(page.locator('.selection-frame')).toHaveCount(0);
	await expect(page.locator('.crop-selection-frame')).toHaveCount(1);
	await page.mouse.up();
});
