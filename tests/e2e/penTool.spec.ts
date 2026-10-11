import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

const ItemRow = '[data-panel="layers"] .layer-item-row';

async function drawTriangle(page: Page): Promise<void> {
	const box = (await page.locator('#overlay').boundingBox())!;
	for (const [x, y] of [[300, 300], [400, 150], [500, 300]] as const) await page.mouse.click(box.x + x, box.y + y);
	await page.keyboard.press('Enter');
}

async function showLayers(page: Page): Promise<void> {
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

test('the Pen in the Shape tools draws one path, Escape drops one under way, and a double-click edits its points', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await showLayers(page);
	await page.getByRole('button', { name: 'Choose shape tools' }).click();
	await page.getByRole('menu', { name: 'Shape tools' }).getByRole('menuitem', { name: 'Pen', exact: true }).click();
	await expect(page.locator('#lineHeadSelect')).toHaveValue('none');
	await drawTriangle(page);
	await expect(page.locator(ItemRow)).toHaveCount(1);
	await expect(page.locator(ItemRow)).toContainText('Path');

	const box = (await page.locator('#overlay').boundingBox())!;
	await page.keyboard.press('y');
	await page.mouse.click(box.x + 600, box.y + 100);
	await page.mouse.click(box.x + 650, box.y + 150);
	await page.keyboard.press('Escape');
	await expect(page.locator(ItemRow)).toHaveCount(1);

	const inked = (x: number, y: number) =>
		page.evaluate(({ px, py }) => document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(px, py, 1, 1).data[3]!, { px: x, py: y });
	expect(await inked(400, 85)).toBe(0);
	await page.keyboard.press('v');
	await page.mouse.dblclick(box.x + 350, box.y + 225);
	await page.mouse.move(box.x + 400, box.y + 150);
	await page.mouse.down();
	await page.mouse.move(box.x + 400, box.y + 80, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.press('Escape');
	// The moved node takes the path's top up with it, as one undo step.
	await expect.poll(() => inked(400, 85)).toBeGreaterThan(0);
	await page.keyboard.press('Control+z');
	await expect.poll(() => inked(400, 85)).toBe(0);
	await expect(page.locator(ItemRow)).toHaveCount(1);
	await page.locator('#canvasWrap').screenshot({ path: 'test-results/pen/edited-path.png' });
});

test('in VS Code the Pen is in the docked tool strip\'s shape menu and draws a path', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 700 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 700, height: 500 }, ColorPalette.White);
	await page.keyboard.press('y');
	await drawTriangle(page);
	const layers = page.locator('.dock-rail button').first();
	await layers.click();
	await expect(page.locator(ItemRow, { hasText: 'Path' })).toHaveCount(1);
});
