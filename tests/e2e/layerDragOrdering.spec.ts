import { expect, test, type Page } from '@playwright/test';

const ObjectCount = 3;

test('dragging a layer row changes the real object stacking order', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('drag-layers');
	await page.locator('#createImageButton').click();
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
	for (let index = 0; index < ObjectCount; index += 1) {
		await page.locator('[data-panel="layers"] .layer-new-paint').click();
		await drawStroke(page, 40 + index * 80, 80);
	}
	const rows = page.locator('[data-panel="layers"] .layer-object-row');
	await expect(rows).toHaveCount(ObjectCount);
	const beforeIds = await rows.evaluateAll((elements) =>
		elements.map((element) => (element as HTMLElement).dataset.objectId),
	);

	const handleBounds = await rows.first().locator('.layer-drag-handle').boundingBox();
	const targetBounds = await rows.last().boundingBox();
	await page.mouse.move(
		handleBounds!.x + handleBounds!.width / 2,
		handleBounds!.y + handleBounds!.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		targetBounds!.x + targetBounds!.width / 2,
		targetBounds!.y + targetBounds!.height / 2,
		{ steps: 6 },
	);
	await page.mouse.up();

	await expect
		.poll(() =>
			rows.evaluateAll((elements) =>
				elements.map((element) => (element as HTMLElement).dataset.objectId),
			),
		)
		.toEqual([beforeIds[1], beforeIds[2], beforeIds[0]]);
});

async function drawStroke(page: Page, x: number, y: number): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, point) => {
			const canvas = overlay as HTMLCanvasElement;
			canvas.setPointerCapture = () => undefined;
			const bounds = canvas.getBoundingClientRect();
			for (const [type, offset, buttons] of [
				['pointerdown', 0, 1],
				['pointermove', 30, 1],
				['pointerup', 30, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 72,
						clientX: bounds.left + point.x + offset,
						clientY: bounds.top + point.y,
					}),
				);
		},
		{ x, y },
	);
}
