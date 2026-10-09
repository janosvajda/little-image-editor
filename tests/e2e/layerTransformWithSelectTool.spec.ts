import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;
type CanvasBox = Readonly<{ x: number; y: number }>;

const Rectangle = { from: { x: 380, y: 180 }, to: { x: 540, y: 280 } } as const;
const RectangleCenter = { x: 460, y: 230 } as const;
const AboveTopEdge = { x: 460, y: 168 } as const;
const RightOfFrame = { x: 600, y: 230 } as const;
/** After a quarter turn the 160 × 100 frame spans x 410–510 around the same centre. */
const RightOfRotatedFrame = { x: 522, y: 230 } as const;
const MoveBy = { x: 30, y: 40 } as const;
const QUARTER_TURN = 90;
const SNAP_DEGREES = 15;
const FRAME = '.selection-frame';

test('paint tools show no transform controls and never move layers', async ({ page }) => {
	await createDocumentWithRectangle(page);
	await chooseBrush(page);
	await expect(page.locator('.selection-handle')).toHaveCount(0);
	await expect(page.locator(FRAME)).toHaveCount(0);

	await drag(page, RectangleCenter, { x: RectangleCenter.x + MoveBy.x, y: RectangleCenter.y });
	await selectTool(page);
	await page.mouse.click(...screen(await canvasBox(page), { x: Rectangle.from.x + 4, y: Rectangle.from.y + 4 }));
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x));
});

test('the select tool selects, moves and resizes a layer without extra handles', async ({ page }) => {
	await createDocumentWithRectangle(page);
	await selectTool(page);
	await page.mouse.click(...screen(await canvasBox(page), RectangleCenter));
	await expect(page.locator('.selection-handle')).toHaveCount(4);
	await expect(page.locator('.selection-move-handle')).toHaveCount(0);

	await drag(page, RectangleCenter, { x: RectangleCenter.x + MoveBy.x, y: RectangleCenter.y + MoveBy.y });
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x + MoveBy.x));
	await expect(page.locator(FRAME)).toHaveAttribute('y', String(Rectangle.from.y + MoveBy.y));

	const corner = { x: Rectangle.to.x + MoveBy.x, y: Rectangle.to.y + MoveBy.y };
	await drag(page, corner, { x: corner.x + MoveBy.x, y: corner.y });
	await expect(page.locator(FRAME)).toHaveAttribute(
		'width',
		String(Rectangle.to.x - Rectangle.from.x + MoveBy.x),
	);
});

test('dragging just outside the frame rotates, and Shift snaps the angle', async ({ page }) => {
	await createDocumentWithRectangle(page);
	await selectTool(page);
	await page.mouse.click(...screen(await canvasBox(page), RectangleCenter));
	await movePointer(page, AboveTopEdge);
	await expect(page.locator('#overlay')).toHaveCSS('cursor', /data:image\/svg\+xml/);

	await drag(page, AboveTopEdge, RightOfFrame);
	await expect.poll(() => frameRotation(page)).toBeCloseTo(QUARTER_TURN, 0);

	await page.keyboard.down('Shift');
	await drag(page, RightOfRotatedFrame, {
		x: RightOfRotatedFrame.x - 10,
		y: RightOfRotatedFrame.y + 34,
	});
	await page.keyboard.up('Shift');
	const snapped = await frameRotation(page);
	expect(snapped % SNAP_DEGREES).toBeCloseTo(0, 5);
	expect(snapped).toBeGreaterThan(QUARTER_TURN);
});

test('a click just outside the selected frame selects what is there instead', async ({ page }) => {
	await createDocumentWithRectangle(page);
	await selectTool(page);
	await page.mouse.click(...screen(await canvasBox(page), RectangleCenter));
	await page.mouse.click(...screen(await canvasBox(page), AboveTopEdge));
	await expect(page.locator(FRAME)).toHaveCount(0);
	await expect(page.locator('.layer-row.active')).toContainText('Image');
});

async function createDocumentWithRectangle(page: Page): Promise<void> {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await page.getByRole('button', { name: 'Shape tools: Rectangle' }).click();
	await page.locator('#fillInput').check();
	await page.locator('#colorInput').fill('#2050d0');
	await drag(page, Rectangle.from, Rectangle.to);
	await expect(page.locator('.layer-object-row')).toHaveCount(1);
}

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function selectTool(page: Page): Promise<void> {
	await page.locator('[data-tool="select"]').click();
}

async function canvasBox(page: Page): Promise<CanvasBox> {
	const box = await page.locator('#overlay').boundingBox();
	if (!box) throw new Error('Canvas overlay is not visible.');
	return box;
}

function screen(box: CanvasBox, point: CanvasPoint): [number, number] {
	return [box.x + point.x, box.y + point.y];
}

async function movePointer(page: Page, point: CanvasPoint): Promise<void> {
	await page.mouse.move(...screen(await canvasBox(page), point));
}

async function drag(page: Page, from: CanvasPoint, to: CanvasPoint): Promise<void> {
	const box = await canvasBox(page);
	await page.mouse.move(...screen(box, from));
	await page.mouse.down();
	await page.mouse.move(...screen(box, to), { steps: 8 });
	await page.mouse.up();
}

async function frameRotation(page: Page): Promise<number> {
	const transform = await page
		.locator(FRAME)
		.evaluate((frame) => frame.parentElement?.getAttribute('transform') ?? '');
	return Number(/rotate\(([-\d.e]+)/.exec(transform)?.[1] ?? Number.NaN);
}
