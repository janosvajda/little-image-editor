import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

const Rectangle = { from: { x: 380, y: 180 }, to: { x: 540, y: 280 } } as const;
const Line = { from: { x: 380, y: 400 }, to: { x: 600, y: 450 } } as const;
const Stroke = { from: { x: 600, y: 500 }, to: { x: 760, y: 560 } } as const;
const MoveBy = { x: 30, y: 40 } as const;
const FRAME = '.selection-frame';
const ItemRow = '[data-panel="layers"] .layer-item-row';
const SELECT_TOOL = '[data-tool="select"]';

test('choosing a shape row with a shape tool shows it and the tool moves it', async ({ page }) => {
	await createDocument(page);
	await chooseShape(page, 'Rectangle');
	await drag(page, Rectangle.from, Rectangle.to);
	await chooseShape(page, 'Line');
	await drag(page, Line.from, Line.to);

	await page.locator(ItemRow, { hasText: 'Rectangle' }).locator('.layer-name').click();
	await expect(page.locator(SELECT_TOOL)).not.toHaveClass(/active/);
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x));

	const edge = { x: Rectangle.from.x, y: Rectangle.to.y - MoveBy.y };
	await drag(page, edge, { x: edge.x + MoveBy.x, y: edge.y + MoveBy.y });
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x + MoveBy.x));
	await expect(page.locator(FRAME)).toHaveAttribute('y', String(Rectangle.from.y + MoveBy.y));
	await expect(page.locator(ItemRow)).toHaveCount(2);
});

test('choosing a row the current tool cannot edit switches to Select', async ({ page }) => {
	await createDocument(page);
	await chooseShape(page, 'Rectangle');
	await drag(page, Rectangle.from, Rectangle.to);
	await chooseBrush(page);
	await drag(page, Stroke.from, Stroke.to);

	await page.locator(ItemRow, { hasText: 'Rectangle' }).locator('.layer-name').click();
	await expect(page.locator(SELECT_TOOL)).toHaveClass(/active/);
	await expect(page.locator(FRAME)).toHaveAttribute('x', String(Rectangle.from.x));
	await expect(page.locator(`${ItemRow}.active`)).toContainText('Rectangle');
});

async function createDocument(page: Page): Promise<void> {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
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

async function drag(page: Page, from: CanvasPoint, to: CanvasPoint): Promise<void> {
	const box = await page.locator('#overlay').boundingBox();
	if (!box) throw new Error('Canvas overlay is not visible.');
	await page.mouse.move(box.x + from.x, box.y + from.y);
	await page.mouse.down();
	await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
	await page.mouse.up();
}
