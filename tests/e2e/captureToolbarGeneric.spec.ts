import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

const CAPTURE = '[data-panel="annotations"]';
const TOOLS = '[data-panel="tools"]';
const LAYERS = '[data-panel="layers"]';
const AUTO_OPEN_URL = '/?mode=annotate';
const WIDE_VIEWPORT = { width: 1_600, height: 950 } as const;
/** Inside the canvas area that the docked toolbars leave visible. */
const Highlight = { from: { x: 640, y: 120 }, to: { x: 760, y: 170 } } as const;
const MarkerAt = { x: 700, y: 260 } as const;
const MoveBy = { x: -30, y: 40 } as const;

test.use({ viewport: WIDE_VIEWPORT });

test('the capture toolbar opens on its own and uses the shared tools', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto(AUTO_OPEN_URL);
	await expect(page.locator(CAPTURE)).toBeVisible();
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await showLayers(page);

	await page.locator(`${CAPTURE} [data-tool="highlight"]`).click();
	await expect(page.locator(`${TOOLS} .palette-group-button.active`)).toHaveAttribute(
		'aria-label',
		'Markup tools: Highlight',
	);
	await drag(page, Highlight.from, Highlight.to);
	await page.locator(`${CAPTURE} [data-tool="step"]`).click();
	await page.mouse.click(...screen(await canvasBox(page), MarkerAt));
	await expect(page.locator(`${LAYERS} .layer-item-row .layer-name`)).toHaveText([
		'Number marker 1',
		'Highlight',
	]);

	await page.locator(`${CAPTURE} [data-tool="select"]`).click();
	await expect(page.locator(`${TOOLS} [data-tool="select"]`)).toHaveClass(/active/);
	const layerFrame = page.locator('.selection-layer-frame .selection-frame');
	await expect(layerFrame).toHaveCount(1);
	const before = Number(await layerFrame.getAttribute('x'));
	await drag(page, MarkerAt, { x: MarkerAt.x + MoveBy.x, y: MarkerAt.y + MoveBy.y });
	await expect(layerFrame).toHaveAttribute('x', String(before + MoveBy.x));
});

async function showLayers(page: Page): Promise<void> {
	if (await page.locator(LAYERS).isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
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
	await page.mouse.move(...screen(box, to), { steps: 6 });
	await page.mouse.up();
}
