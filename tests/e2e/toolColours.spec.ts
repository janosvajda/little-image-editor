import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

/** The item canvas's colour at a point on the image. */
function pixel(page: Page, x: number, y: number): Promise<number[]> {
	return page.evaluate(({ px, py }) => Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(px, py, 1, 1).data).slice(0, 3), { px: x, py: y });
}

async function setColour(page: Page, selector: string, value: string): Promise<void> {
	await page.locator(selector).evaluate((input: HTMLInputElement, colour) => {
		input.value = colour;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
}

/** A Picker press: a click picks the line colour, an Alt/Option-click the fill colour. */
async function pick(page: Page, box: { x: number; y: number }, x: number, y: number, altKey = false): Promise<void> {
	await page.locator('#overlay').dispatchEvent('pointerdown', { clientX: box.x + x, clientY: box.y + y, pointerId: 1, altKey });
}

async function drawSquare(page: Page, box: { x: number; y: number }, x: number): Promise<void> {
	await page.mouse.move(box.x + x, box.y + 150);
	await page.mouse.down();
	await page.mouse.move(box.x + x + 150, box.y + 300, { steps: 4 });
	await page.mouse.up();
}

test('two colours for every tool: the picker picks the line colour, or the fill with Alt, shapes draw in their style, and the colours swap and reset', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 820 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const colours = page.getByRole('group', { name: 'Colours' });
	const line = page.getByRole('group', { name: 'Colours' }).getByLabel('Line colour', { exact: true });
	const fill = page.getByRole('group', { name: 'Colours' }).getByLabel('Fill colour', { exact: true });
	// The style in view: the tools' own, or a just-drawn shape's, which share the same buttons.
	const style = page.locator('.shape-style:visible');
	const box = (await page.locator('#overlay').boundingBox())!;

	// Shapes in each style: outline and fill in two colours, and fill only.
	await page.keyboard.press('r');
	await expect(colours).toBeVisible();
	await expect(style).toBeVisible();
	await setColour(page, '#colorInput', '#0000ff');
	await setColour(page, '#fillColorInput', '#ff0000');
	await style.getByRole('button', { name: 'Outline and fill' }).click();
	await drawSquare(page, box, 300);
	expect(await pixel(page, 375, 225)).toEqual([255, 0, 0]);
	expect(await pixel(page, 300, 225)).toEqual([0, 0, 255]);
	await setColour(page, '#fillColorInput', '#00ff00');
	await style.getByRole('button', { name: 'Fill', exact: true }).click();
	await drawSquare(page, box, 560);
	expect(await pixel(page, 635, 225)).toEqual([0, 255, 0]);
	expect(await pixel(page, 561, 225)).toEqual([0, 255, 0]);

	// The brush paints with the line colour and has no style to choose.
	await page.keyboard.press('b');
	await expect(colours).toBeVisible();
	await expect(page.locator('.shape-style:visible')).toHaveCount(0);

	// Nothing selected, so the colours shown are the tools' own.
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 100, box.y + 500);
	await page.mouse.click(box.x + 100, box.y + 500);

	// A click picks the line colour, an Alt/Option-click the fill colour.
	await page.keyboard.press('i');
	await expect(colours).toBeVisible();
	await pick(page, box, 375, 225);
	await expect(line).toHaveValue('#ff0000');
	await pick(page, box, 635, 225, true);
	await expect(fill).toHaveValue('#00ff00');
	await expect(line).toHaveValue('#ff0000');

	// Swap and reset, from the buttons and from the keyboard; a second swap swaps back.
	await colours.getByRole('button', { name: /Swap line and fill colours/ }).click();
	await expect(line).toHaveValue('#00ff00');
	await expect(fill).toHaveValue('#ff0000');
	await page.keyboard.press('Shift+X');
	await expect(line).toHaveValue('#ff0000');
	await expect(fill).toHaveValue('#00ff00');
	await page.keyboard.press('d');
	await expect(line).toHaveValue('#000000');
	await expect(fill).toHaveValue('#ffffff');
	await page.screenshot({ path: 'test-results/tool-colours/tools.png' });
});

test('a selected shape gets its own titled section with its colours and style, and leaves the tools\' colours as they are', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 820 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.keyboard.press('r');
	await setColour(page, '#colorInput', '#0000ff');
	await drawSquare(page, box, 300);
	// With nothing selected, the style chosen is the tools' own.
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 100, box.y + 500);
	await page.mouse.click(box.x + 100, box.y + 500);
	await page.keyboard.press('r');
	await setColour(page, '#fillColorInput', '#00ff00');
	await page.getByRole('group', { name: 'Shape style' }).getByRole('button', { name: 'Fill', exact: true }).click();
	await drawSquare(page, box, 560);

	// Select the outlined square: its style is shown, and choosing a fill fills it with the fill colour.
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 375, box.y + 150);
	if (!(await page.locator('.selected-object-options').isVisible())) await page.mouse.click(box.x + 375, box.y + 150);
	const objectStyle = page.getByRole('group', { name: 'Selected object style' });
	await expect(objectStyle.getByRole('button', { name: 'Outline', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await objectStyle.getByRole('button', { name: 'Outline and fill' }).click();
	expect(await pixel(page, 375, 225)).toEqual([0, 255, 0]);
	expect(await pixel(page, 300, 225)).toEqual([0, 0, 255]);

	await expect(page.locator('.selected-object-title')).toHaveText('Rectangle');
	await expect(page.getByLabel('Selected object fill colour')).toHaveValue('#00ff00');
	// Selecting it left the tools' colours alone.
	const tools = page.getByRole('group', { name: 'Colours' });
	await expect(tools).toBeVisible();
	await expect(tools.getByLabel('Line colour', { exact: true })).toHaveValue('#0000ff');
	await expect(tools.getByLabel('Fill colour', { exact: true })).toHaveValue('#00ff00');

	// The picker sets the tools' line colour and does not recolour the shape.
	await page.keyboard.press('i');
	await pick(page, box, 375, 225);
	await expect(tools.getByLabel('Line colour', { exact: true })).toHaveValue('#00ff00');
	expect(await pixel(page, 300, 225)).toEqual([0, 0, 255]);
	expect(await pixel(page, 375, 225)).toEqual([0, 255, 0]);
	await page.screenshot({ path: 'test-results/tool-colours/selected.png' });
});

test('in VS Code the colours and the style sit in the top bar, as pictures named by their tooltips', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 700 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 500, height: 300 }, ColorPalette.White);
	await page.keyboard.press('r');
	const bar = page.locator('.topbar');
	const colours = bar.getByRole('group', { name: 'Colours' });
	await expect(colours).toBeVisible();
	await expect(colours.getByRole('button', { name: /Swap line and fill colours/ })).toBeVisible();
	await expect(colours.getByRole('button', { name: /Reset colours/ })).toBeVisible();
	const style = bar.getByRole('group', { name: 'Shape style' });
	await expect(style.getByRole('button', { name: 'Outline and fill' })).toBeVisible();
	await expect(style.getByText('Outline and fill')).toBeHidden();
	await page.screenshot({ path: 'test-results/tool-colours/vscode.png' });
});

test('the colours are always one row of two swatches in the same place, whatever is selected and whichever tool is in use', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 820 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	const box = (await page.locator('#overlay').boundingBox())!;
	const drag = async (from: readonly [number, number], to: readonly [number, number]) => {
		await page.mouse.move(box.x + from[0], box.y + from[1]);
		await page.mouse.down();
		await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
		await page.mouse.up();
	};
	await page.keyboard.press('r');
	await drag([350, 100], [500, 200]);
	await page.keyboard.press('b');
	await drag([350, 300], [550, 350]);
	const rows = page.locator('[data-panel="tools"] .tool-colors:visible');
	const expectOneRow = async () => {
		await expect(rows).toHaveCount(1);
		await expect(rows.locator('input[type="color"]')).toHaveCount(2);
		await expect(rows.locator('input[type="color"]').nth(1)).toBeEnabled();
		await expect(rows.getByRole('button')).toHaveCount(2);
	};
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 700, box.y + 500);
	await page.mouse.click(box.x + 700, box.y + 500);
	await expectOneRow();
	// A first press selects the layer, the next the shape.
	await page.mouse.click(box.x + 425, box.y + 100);
	await expectOneRow();
	await page.mouse.click(box.x + 425, box.y + 100);
	await expectOneRow();
	// A brush stroke has no fill of its own, yet the tools' colours stay as they are.
	await page.mouse.click(box.x + 450, box.y + 325);
	await page.mouse.click(box.x + 450, box.y + 325);
	await expectOneRow();
	await expect(page.locator('.selected-object-title')).toHaveText('Brush stroke');
	await page.keyboard.press('i');
	await expectOneRow();
	await page.keyboard.press('b');
	await expectOneRow();
});
