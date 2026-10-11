import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { SVG_MIME_TYPE } from '../../src/app/core/document/svgFormat';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

const ORANGE = [255, 102, 0];

/** The item canvas's colour at a point on the image, as red, green, blue and alpha. */
function pixel(page: Page, x: number, y: number): Promise<number[]> {
	return page.evaluate(({ px, py }) => Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(px, py, 1, 1).data), { px: x, py: y });
}

async function drawRectangle(page: Page, from: readonly [number, number], to: readonly [number, number]): Promise<DOMRect> {
	await page.keyboard.press('r');
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(box.x + from[0], box.y + from[1]);
	await page.mouse.down();
	await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
	await page.mouse.up();
	await page.keyboard.press('v');
	await page.mouse.click(box.x + (from[0] + to[0]) / 2, box.y + from[1]);
	return box as DOMRect;
}

test('a pattern fill, a shadow, a polyline and a clip, saved as SVG and opened again the same', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 820 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(SVG_MIME_TYPE);
	await page.locator('#newImageTransparent').check();
	await page.locator('#createImageButton').click();
	const box = await drawRectangle(page, [330, 120], [560, 300]);

	// Stripes: the pattern's colour and its background take turns across the shape.
	await page.getByRole('group', { name: 'Selected object style' }).getByRole('button', { name: 'Outline and fill' }).click();
	await page.getByLabel('Selected object fill style').selectOption('stripes');
	await page.getByLabel('Selected object fill colour').fill('#ff6600');
	const row = await Promise.all(Array.from({ length: 12 }, (_, step) => pixel(page, 400 + step, 200)));
	expect(row.some((colour) => colour.slice(0, 3).join() === ORANGE.join())).toBe(true);
	expect(row.some((colour) => colour.slice(0, 3).join() === '255,255,255')).toBe(true);

	// A shadow falls below and to the right, where nothing was drawn before.
	expect((await pixel(page, 563, 303))[3]).toBe(0);
	await page.locator('.object-effects-button').click();
	await page.getByLabel('Selected object shadow', { exact: true }).check();
	await expect.poll(async () => (await pixel(page, 563, 303))[3]).toBeGreaterThan(0);
	await page.keyboard.press('Escape');

	// A closed polyline above the shape becomes its clip.
	await page.keyboard.press('j');
	await page.getByRole('group', { name: 'Shape style' }).getByRole('button', { name: 'Outline', exact: true }).click();
	for (const [x, y] of [[360, 100], [600, 200], [380, 330], [360, 100]] as const) await page.mouse.click(box.x + x, box.y + y);
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 445, box.y + 200);
	await page.getByRole('button', { name: 'Clip', exact: true }).click();
	await expect.poll(async () => (await pixel(page, 340, 290))[3]).toBe(0);
	expect((await pixel(page, 420, 200))[3]).toBe(255);
	await page.screenshot({ path: 'test-results/svg-tools/clipped.png' });

	await page.evaluate(() => {
		const host = window as Window & { savedSvg?: string };
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({ name: 'looks.svg', createWritable: async () => ({ write: async (blob: Blob) => void (host.savedSvg = await blob.text()), close: async () => undefined }) }),
		});
	});
	await page.locator('#quickSaveButton').click();
	const markup = await page.waitForFunction(() => (window as Window & { savedSvg?: string }).savedSvg).then((handle) => handle.jsonValue() as Promise<string>);
	for (const part of ['<pattern', 'data-pattern="stripes"', '<feDropShadow', '<clipPath']) expect(markup).toContain(part);

	await page.locator('#fileInput').setInputFiles({ name: 'looks.svg', mimeType: SVG_MIME_TYPE, buffer: Buffer.from(markup) });
	await expect.poll(async () => (await pixel(page, 340, 290))[3]).toBe(0);
	expect((await pixel(page, 563, 250))[3]).toBeGreaterThan(0);
	// The first press picks the opened file's layer, the next its item.
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 420, box.y + 200);
	await page.mouse.click(box.x + 420, box.y + 200);
	await expect(page.getByLabel('Selected object fill style')).toBeVisible();
	await expect(page.getByLabel('Selected object fill style')).toHaveValue('stripes');
	await expect(page.getByRole('button', { name: 'Release clip' })).toBeVisible();
});

test('in VS Code the effects drop down from the top bar beside the clip action', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 700 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 700, height: 500 }, ColorPalette.White);
	await drawRectangle(page, [300, 150], [500, 300]);
	const bar = page.locator('.topbar .selected-object-options');
	const effects = bar.locator('.object-effects-button');
	await expect(effects).toBeVisible();
	await effects.click();
	const panel = bar.locator('.object-effects-panel');
	await expect(panel).toBeVisible();
	// It drops down over the picture, wholly below the bar, not cut off by it.
	const { y, height } = (await panel.boundingBox())!;
	const barBottom = (await page.locator('.topbar').boundingBox())!;
	expect(y).toBeGreaterThanOrEqual(barBottom.y + barBottom.height);
	expect(y + height).toBeLessThan(700);
	await expect(panel.getByLabel('Selected object shadow', { exact: true })).toBeInViewport();
	await page.getByLabel('Selected object blur').fill('8');
	await page.screenshot({ path: 'test-results/svg-tools/vscode-effects.png' });
	await page.mouse.click(10, 690);
	await expect(panel).toBeHidden();
});
