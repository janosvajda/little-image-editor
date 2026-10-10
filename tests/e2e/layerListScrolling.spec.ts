import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

const LAYER_COUNT = 12;
const COLUMNS = 4;
const Grid = { left: 300, top: 120, column: 70, row: 120 } as const;
const STROKE_LENGTH = { x: 40, y: 60 } as const;
const WHEEL_DISTANCE = 2_000;
const SHORT_VIEWPORT = { width: 1_400, height: 800 } as const;
const LAYERS = '[data-panel="layers"]';

test.use({ viewport: SHORT_VIEWPORT });

test('only the layer list scrolls, and a canvas selection scrolls its row into view', async ({ page }) => {
	await createDocument(page);
	await chooseBrush(page);
	for (let index = 0; index < LAYER_COUNT; index += 1) {
		if (index > 0) await page.locator(`${LAYERS} .layer-new-paint`).click();
		const from = strokeStart(index);
		await drag(page, from, { x: from.x + STROKE_LENGTH.x, y: from.y + STROKE_LENGTH.y });
	}
	const panel = page.locator(LAYERS);
	const list = panel.locator('.layer-list');
	await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

	await list.hover();
	await page.mouse.wheel(0, WHEEL_DISTANCE);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
	await expect(panel.locator('.layer-new-paint')).toBeInViewport();

	await list.evaluate((element) => {
		element.scrollTop = 0;
	});
	await page.locator('[data-panel="tools"] [data-tool="select"]').click();
	const bottomLayerStroke = strokeStart(0);
	await page.mouse.click(...screen(await canvasBox(page), {
		x: bottomLayerStroke.x + STROKE_LENGTH.x / 2,
		y: bottomLayerStroke.y + STROKE_LENGTH.y / 2,
	}));
	const selectedRow = panel.locator('.layer-object-row.active');
	await expect(selectedRow).toContainText('Layer 1');
	await expect.poll(() => rowInsideList(page)).toBe(true);
});

function strokeStart(index: number): CanvasPoint {
	return {
		x: Grid.left + (index % COLUMNS) * Grid.column,
		y: Grid.top + Math.floor(index / COLUMNS) * Grid.row,
	};
}

function rowInsideList(page: Page): Promise<boolean> {
	return page.locator(`${LAYERS} .layer-list`).evaluate((list) => {
		const row = list.querySelector('.layer-object-row.active');
		if (!row) return false;
		const rowBox = row.getBoundingClientRect();
		const listBox = list.getBoundingClientRect();
		return rowBox.top >= listBox.top && rowBox.bottom <= listBox.bottom;
	});
}

async function createDocument(page: Page): Promise<void> {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	if (await page.locator(LAYERS).isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function canvasBox(page: Page): Promise<CanvasPoint> {
	const box = await page.locator('#overlay').boundingBox();
	if (!box) throw new Error('Canvas overlay is not visible.');
	return box;
}

function screen(box: CanvasPoint, point: CanvasPoint): [number, number] {
	return [box.x + point.x, box.y + point.y];
}

async function drag(page: Page, from: CanvasPoint, to: CanvasPoint): Promise<void> {
	const box = await canvasBox(page);
	await page.mouse.move(...screen(box, from));
	await page.mouse.down();
	await page.mouse.move(...screen(box, to), { steps: 4 });
	await page.mouse.up();
}
