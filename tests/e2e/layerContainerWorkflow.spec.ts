import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

/** Inside the canvas area that the default Tools and Layers panels leave visible. */
const Rectangle = { from: { x: 300, y: 100 }, to: { x: 420, y: 170 } } as const;
const Line = { from: { x: 300, y: 250 }, to: { x: 560, y: 290 } } as const;
const FirstStroke = { from: { x: 300, y: 420 }, to: { x: 560, y: 470 } } as const;
const SecondStroke = { from: { x: 320, y: 340 }, to: { x: 560, y: 340 } } as const;
const OnSecondStroke = { x: 440, y: 340 } as const;
const OnLine = { x: 430, y: 270 } as const;
const MoveBy = { x: 0, y: 40 } as const;
const GrowBy = { x: 40, y: 20 } as const;
/** Inside the band just outside a frame where a drag rotates. */
const ROTATION_BAND_OFFSET = 12;
const RED = '#e02020';
const RED_PIXEL = [224, 32, 32, 255] as const;
const FRAME = '.selection-frame';
const LAYERS = '[data-panel="layers"]';
const LIST_ROWS = `${LAYERS} .layer-list > .layer-row`;

test('a layer lists its items, and each item is selected, recoloured and moved on its own', async ({ page }) => {
	await createDocument(page);
	await chooseShape(page, 'Rectangle');
	await drag(page, Rectangle.from, Rectangle.to);
	await chooseShape(page, 'Line');
	await drag(page, Line.from, Line.to);
	await chooseBrush(page);
	await drag(page, FirstStroke.from, FirstStroke.to);
	await drag(page, SecondStroke.from, SecondStroke.to);

	await expect(page.locator(`${LIST_ROWS} .layer-name`)).toHaveText([
		/^Layer 1\s*4 items$/,
		'Brush stroke',
		'Brush stroke',
		'Line',
		'Rectangle',
		'Image',
	]);

	await page.locator('[data-panel="tools"] [data-tool="select"]').click();
	await page.mouse.click(...screen(await canvasBox(page), OnSecondStroke));
	await expect(page.locator(`${LAYERS} .layer-item-row.active`)).toHaveCount(1);
	await page.getByLabel('Selected object color').fill(RED);
	await expect.poll(() => annotationPixel(page, OnSecondStroke)).toEqual(RED_PIXEL);

	const frameY = Number(await page.locator(FRAME).getAttribute('y'));
	await drag(page, OnSecondStroke, { x: OnSecondStroke.x + MoveBy.x, y: OnSecondStroke.y + MoveBy.y });
	await expect(page.locator(FRAME)).toHaveAttribute('y', String(frameY + MoveBy.y));
	await expect(page.locator(`${LAYERS} .layer-item-row`)).toHaveCount(4);

	await page.mouse.click(...screen(await canvasBox(page), OnLine));
	await expect(page.locator(`${LAYERS} .layer-item-row.active`)).toContainText('Line');
});

test('a whole layer moves with its items, and new layers collect new items', async ({ page }) => {
	await createDocument(page);
	await chooseShape(page, 'Rectangle');
	await drag(page, Rectangle.from, Rectangle.to);
	await chooseShape(page, 'Line');
	await drag(page, Line.from, Line.to);

	await page.locator('[data-panel="tools"] [data-tool="select"]').click();
	await page.locator(`${LAYERS} .layer-object-row .layer-name`).click();
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x));
	await drag(page, OnLine, { x: OnLine.x + MoveBy.x, y: OnLine.y + MoveBy.y });
	await expect(page.locator(FRAME)).toHaveAttribute('y', String(Rectangle.from.y + MoveBy.y));

	await page.locator(`${LAYERS} .layer-new-paint`).click();
	await chooseBrush(page);
	await drag(page, FirstStroke.from, FirstStroke.to);
	await expect(page.locator(`${LIST_ROWS} .layer-name`)).toHaveText([
		/^Layer 2\s*1 item$/,
		'Brush stroke',
		/^Layer 1\s*2 items$/,
		'Line',
		'Rectangle',
		'Image',
	]);

	await page.locator(`${LAYERS} .layer-merge-down`).click();
	await expect(page.locator(`${LIST_ROWS} .layer-name`)).toHaveText([
		/^Layer 1\s*3 items$/,
		'Brush stroke',
		'Line',
		'Rectangle',
		'Image',
	]);
	await page.locator('#undoButton').click();
	await expect(page.locator(`${LAYERS} .layer-object-row`)).toHaveCount(2);

	await page.locator(`${LAYERS} .layer-object-row`).first().locator('.layer-expand').click();
	await expect(page.locator(`${LIST_ROWS} .layer-name`)).toHaveText([
		/^Layer 2\s*1 item$/,
		/^Layer 1\s*2 items$/,
		'Line',
		'Rectangle',
		'Image',
	]);
});

test('the Select tool alone moves, resizes and rotates a whole layer on the canvas', async ({ page }) => {
	await createDocument(page);
	await chooseBrush(page);
	await drag(page, FirstStroke.from, FirstStroke.to);
	await drag(page, SecondStroke.from, SecondStroke.to);
	await page.locator('[data-panel="tools"] [data-tool="select"]').click();
	const layerFrame = page.locator(`.selection-layer-frame ${FRAME}`);
	await expect(layerFrame).toHaveCount(1);

	const before = await frameBox(page);
	await drag(page, OnSecondStroke, { x: OnSecondStroke.x + MoveBy.x, y: OnSecondStroke.y + MoveBy.y });
	await expect.poll(async () => (await frameBox(page)).y).toBeCloseTo(before.y + MoveBy.y, 0);

	const moved = await frameBox(page);
	const corner = { x: moved.x + moved.width, y: moved.y + moved.height };
	await drag(page, corner, { x: corner.x + GrowBy.x, y: corner.y + GrowBy.y });
	await expect.poll(async () => (await frameBox(page)).width).toBeCloseTo(moved.width + GrowBy.x, 0);

	const grown = await frameBox(page);
	const aboveTop = { x: grown.x + grown.width / 2, y: grown.y - ROTATION_BAND_OFFSET };
	await drag(page, aboveTop, { x: grown.x + grown.width + ROTATION_BAND_OFFSET, y: grown.y + grown.height / 2 });
	await expect(layerFrame.locator('xpath=..')).toHaveAttribute('transform', /rotate\((?!0 )/);
	await expect(page.locator(`${LAYERS} .layer-item-row.active`)).toHaveCount(0);
});

async function frameBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
	return page.locator(`.selection-layer-frame ${FRAME}`).evaluate((frame) => ({
		x: Number(frame.getAttribute('x')),
		y: Number(frame.getAttribute('y')),
		width: Number(frame.getAttribute('width')),
		height: Number(frame.getAttribute('height')),
	}));
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

async function chooseShape(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'Choose shape tools' }).click();
	await page.getByRole('menu', { name: 'Shape tools' }).getByRole('menuitem', { name, exact: true }).click();
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
	await page.mouse.move(...screen(box, to), { steps: 8 });
	await page.mouse.up();
}

function annotationPixel(page: Page, point: CanvasPoint): Promise<number[]> {
	return page
		.locator('.annotation-canvas')
		.evaluate(
			(canvas, at) => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(at.x, at.y, 1, 1).data),
			point,
		);
}
