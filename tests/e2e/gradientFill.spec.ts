import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

const ORANGE = '#ff6600';
const YELLOW = '#ffee00';

async function gradientRectangle(page: Page): Promise<{ x: number; y: number }> {
	await page.keyboard.press('r');
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(box.x + 320, box.y + 150);
	await page.mouse.down();
	await page.mouse.move(box.x + 560, box.y + 330, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 440, box.y + 150);
	await page.getByRole('group', { name: 'Selected object style' }).getByRole('button', { name: 'Outline and fill' }).click();
	await page.getByLabel('Selected object fill style').selectOption('linear');
	await page.getByLabel('Selected object fill colour').fill(ORANGE);
	await page.getByLabel('Selected object fill end colour').fill(YELLOW);
	return box;
}

/** The item canvas's colour at a point, as red, green and blue. */
function colour(page: Page, x: number, y: number): Promise<number[]> {
	return page.evaluate(
		({ px, py }) => Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(px, py, 1, 1).data).slice(0, 3),
		{ px: x, py: y },
	);
}

test('a rectangle filled with a linear gradient runs from its first colour to its last, and its end point can be dragged', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 800 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const box = await gradientRectangle(page);
	// Orange on the left, yellow on the right: the same red, rising green.
	await expect.poll(async () => (await colour(page, 550, 240))[1]!).toBeGreaterThan(200);
	const left = await colour(page, 330, 240);
	const right = await colour(page, 550, 240);
	expect(left[0]).toBe(255);
	expect(left[1]).toBeLessThan(140);
	expect(right[0]).toBe(255);
	// Dragging the end point from the right side near the left one squeezes the gradient there: the middle turns yellow.
	const middle = await colour(page, 440, 240);
	expect(middle[1]).toBeLessThan(right[1]! - 20);
	await page.mouse.move(box.x + 560, box.y + 240);
	await page.mouse.down();
	await page.mouse.move(box.x + 340, box.y + 240, { steps: 6 });
	await page.mouse.up();
	await expect.poll(async () => (await colour(page, 440, 240))[1]!).toBeGreaterThanOrEqual(right[1]! - 2);
});

test('in VS Code the gradient controls sit in the top bar beside Fill', async ({ page }) => {
	await page.setViewportSize({ width: 1150, height: 600 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 700, height: 450 }, ColorPalette.White);
	await gradientRectangle(page);
	const bar = page.locator('.topbar .selected-object-options');
	await expect(bar.getByLabel('Selected object fill style')).toHaveValue('linear');
	await expect(bar.getByLabel('Selected object fill end colour')).toHaveValue(YELLOW);
});
