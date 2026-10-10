import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

/** Inside the canvas area that the default Tools and Layers panels leave visible. */
const Strokes = [
	[{ x: 300, y: 120 }, { x: 420, y: 200 }, { x: 560, y: 140 }],
	[{ x: 320, y: 260 }, { x: 440, y: 180 }, { x: 560, y: 300 }],
	[{ x: 300, y: 380 }, { x: 430, y: 300 }, { x: 560, y: 420 }],
] as const;
const MoveBy = { x: 37, y: 23 } as const;
const MOVE_STEPS = 6;
const LAYERS = '[data-panel="layers"]';
const HALF_OPACITY_PERCENT = '50';

for (const opacity of [null, HALF_OPACITY_PERCENT])
	test(`a dragged layer${opacity ? ' with its own opacity' : ''} previews exactly as it is finally drawn`, async ({ page }) => {
		await createDocument(page);
		await chooseBrush(page);
		for (const [index, stroke] of Strokes.entries()) {
			if (index > 0) await page.locator(`${LAYERS} .layer-new-paint`).click();
			await drawPath(page, stroke);
		}
		await page.locator('[data-panel="tools"] [data-tool="select"]').click();
		await page.locator(`${LAYERS} .layer-object-row .layer-name`).nth(1).click();
		if (opacity) await page.locator(`${LAYERS} .layer-opacity`).fill(opacity);

		const grab = Strokes[1][1];
		const box = await canvasBox(page);
		await page.mouse.move(box.x + grab.x, box.y + grab.y);
		await page.mouse.down();
		await page.mouse.move(box.x + grab.x + MoveBy.x, box.y + grab.y + MoveBy.y, { steps: MOVE_STEPS });
		const duringDrag = await annotationPixels(page);
		await page.mouse.up();
		const afterRelease = await annotationPixels(page);

		expect(duringDrag).toBe(afterRelease);
		await expect(page.locator(`${LAYERS} .layer-object-row`)).toHaveCount(Strokes.length);
	});

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

async function drawPath(page: Page, points: readonly CanvasPoint[]): Promise<void> {
	const box = await canvasBox(page);
	const [first, ...rest] = points;
	if (!first) return;
	await page.mouse.move(box.x + first.x, box.y + first.y);
	await page.mouse.down();
	for (const point of rest) await page.mouse.move(box.x + point.x, box.y + point.y, { steps: MOVE_STEPS });
	await page.mouse.up();
}

/** Every pixel of the layer canvas, after the next frame has been drawn. */
function annotationPixels(page: Page): Promise<string> {
	return page.locator('.annotation-canvas').evaluate(async (canvas) => {
		await new Promise((resolve) => requestAnimationFrame(resolve));
		return (canvas as HTMLCanvasElement).toDataURL('image/png');
	});
}
