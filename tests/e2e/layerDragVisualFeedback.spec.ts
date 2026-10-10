import { expect, test, type Page } from '@playwright/test';

const StrokeCount = 2;

test('layer dragging clearly identifies the source, preview, and destination', async ({
	page,
}) => {
	await openProjectWithStrokes(page);
	const rows = page.locator('[data-panel="layers"] .layer-object-row');
	const source = rows.first();
	const destination = rows.last();
	const handle = source.locator('.layer-drag-handle');
	const handleBounds = await handle.boundingBox();
	const downPointer = {
		clientX: handleBounds!.x + handleBounds!.width / 2,
		clientY: handleBounds!.y + handleBounds!.height / 2,
		pointerId: 81,
	};

	await handle.evaluate((element) => {
		(element as HTMLButtonElement).setPointerCapture = () => undefined;
	});
	await dispatchPointer(handle, 'pointerdown', downPointer);
	await expect(source).toHaveClass(/dragging-source/);
	await expect(page.locator('.layer-drag-preview')).toHaveText('Moving Layer 2');
	const destinationBounds = await destination.boundingBox();
	const dragPointer = {
		clientX: destinationBounds!.x + destinationBounds!.width / 2,
		clientY: destinationBounds!.y + destinationBounds!.height / 2,
		pointerId: downPointer.pointerId,
	};
	const hitObjectId = await page.evaluate(
		({ clientX, clientY }) =>
			document
				.elementFromPoint(clientX, clientY)
				?.closest<HTMLElement>('.layer-object-row')?.dataset.contentLayerId,
		dragPointer,
	);
	expect(hitObjectId).toBe(await destination.getAttribute('data-content-layer-id'));
	await dispatchPointer(handle, 'pointermove', dragPointer);

	await expect(destination).toHaveClass(/drag-target/);

	await dispatchPointer(handle, 'pointerup', dragPointer);
	await expect(page.locator('.layer-drag-preview')).toHaveCount(0);
	await expect(page.locator('.dragging-source')).toHaveCount(0);
	await expect(page.locator('.drag-target')).toHaveCount(0);
});

async function openProjectWithStrokes(page: Page): Promise<void> {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('layer-drag-feedback');
	await page.locator('#createImageButton').click();
	await page.locator('#toolbarPickerButton').click();
	await page.getByLabel('Layers', { exact: true }).check();
	await page.keyboard.press('Escape');
	for (let index = 0; index < StrokeCount; index += 1) {
		await page.locator('[data-panel="layers"] .layer-new-paint').click();
		await drawStroke(page, 40 + index * 80, 80);
	}
}

async function dispatchPointer(
	handle: ReturnType<Page['locator']>,
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	pointer: Readonly<{ clientX: number; clientY: number; pointerId: number }>,
): Promise<void> {
	await handle.evaluate(
		(element, eventInit) =>
			element.dispatchEvent(
				new PointerEvent(eventInit.type, {
					bubbles: true,
					buttons: eventInit.type === 'pointerup' ? 0 : 1,
					clientX: eventInit.clientX,
					clientY: eventInit.clientY,
					pointerId: eventInit.pointerId,
				}),
			),
		{ ...pointer, type },
	);
}

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
						pointerId: 73,
						clientX: bounds.left + point.x + offset,
						clientY: bounds.top + point.y,
					}),
				);
		},
		{ x, y },
	);
}
