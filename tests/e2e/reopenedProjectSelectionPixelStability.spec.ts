import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';

test('selecting a reopened paint layer does not change its rendered pixels', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(PROJECT_MIME_TYPE);
	await page.locator('#newImageWidth').fill('400');
	await page.locator('#newImageHeight').fill('300');
	await page.locator('#createImageButton').click();
	await page.keyboard.press('m');
	await setPaintStyle(page, '#d32020', 40);
	await draw(page, { x: 80, y: 100 }, { x: 250, y: 100 });
	await setPaintStyle(page, '#d32020', 6);
	await draw(page, { x: 80, y: 150 }, { x: 250, y: 150 });
	await page.locator('[data-tool="select"]').click();
	await dispatchCanvasClick(page, { x: 150, y: 100 });
	const southEast = await selectionHandleCenter(page, 2);
	await dispatchCanvasDrag(
		page,
		southEast,
		{ x: southEast.x + 70, y: southEast.y + 60 },
	);
	const transformedCenter = await selectionFrameCenter(page);

	const source = await saveProjectSource(page);
	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#fileInput').setInputFiles({
		name: 'pixel-stability.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();

	const before = await annotationPixels(page);
	await page.locator('[data-tool="select"]').click();
	await dispatchCanvasPointer(page, 'pointerdown', transformedCenter);
	await expect(page.locator('.selection-overlay .selection-frame')).toBeVisible();
	const duringSelection = await annotationPixels(page);
	await dispatchCanvasPointer(page, 'pointerup', transformedCenter);
	const afterSelection = await annotationPixels(page);

	expect(duringSelection).toEqual(before);
	expect(afterSelection).toEqual(before);
});

async function setPaintStyle(
	page: Page,
	color: string,
	size: number,
): Promise<void> {
	await page.locator('#colorInput').fill(color);
	await page.locator('#sizeInput').fill(String(size));
}

function selectionHandleCenter(
	page: Page,
	index: number,
): Promise<Readonly<{ x: number; y: number }>> {
	return page.locator('.selection-handle').nth(index).evaluate((handle) => {
		const rect = handle as SVGRectElement;
		return {
			x: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
			y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
		};
	});
}

function selectionFrameCenter(
	page: Page,
): Promise<Readonly<{ x: number; y: number }>> {
	return page.locator('.selection-frame').evaluate((frame) => {
		const rect = frame as SVGRectElement;
		return {
			x: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
			y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
		};
	});
}

async function draw(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(canvas, gesture) => {
			const bounds = canvas.getBoundingClientRect();
			const event = (type: string, point: Readonly<{ x: number; y: number }>) =>
				new PointerEvent(type, {
					bubbles: true,
					clientX: bounds.left + (point.x * bounds.width) / canvas.width,
					clientY: bounds.top + (point.y * bounds.height) / canvas.height,
					pointerId: 1,
					pointerType: 'mouse',
					pressure: 0.5,
				});
			canvas.dispatchEvent(event('pointerdown', gesture.from));
			for (let step = 1; step <= 8; step += 1)
				canvas.dispatchEvent(
					event('pointermove', {
						x: gesture.from.x + ((gesture.to.x - gesture.from.x) * step) / 8,
						y: gesture.from.y + ((gesture.to.y - gesture.from.y) * step) / 8,
					}),
				);
			canvas.dispatchEvent(event('pointerup', gesture.to));
		},
		{ from, to },
	);
}

async function saveProjectSource(page: Page): Promise<string> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'pixel-stability.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(
							window as Window & { projectSource?: string }
						).projectSource = await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
	await page.locator('#quickSaveButton').click();
	return page
		.waitForFunction(
			() => (window as Window & { projectSource?: string }).projectSource,
		)
		.then(async (handle) => (await handle.jsonValue()) as string);
}

function dispatchCanvasClick(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	return page.locator('#overlay').evaluate((canvas, canvasPoint) => {
		const bounds = canvas.getBoundingClientRect();
		const clientX = bounds.left + (canvasPoint.x * bounds.width) / canvas.width;
		const clientY = bounds.top + (canvasPoint.y * bounds.height) / canvas.height;
		const eventOptions = {
			bubbles: true,
			clientX,
			clientY,
			pointerId: 1,
			pointerType: 'mouse',
		};
		canvas.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
		canvas.dispatchEvent(new PointerEvent('pointerup', eventOptions));
	}, point);
}

function dispatchCanvasPointer(
	page: Page,
	type: 'pointerdown' | 'pointerup',
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	return page.locator('#overlay').evaluate(
		(canvas, pointer) => {
			const bounds = canvas.getBoundingClientRect();
			canvas.dispatchEvent(
				new PointerEvent(pointer.type, {
					bubbles: true,
					clientX:
						bounds.left + (pointer.point.x * bounds.width) / canvas.width,
					clientY:
						bounds.top + (pointer.point.y * bounds.height) / canvas.height,
					pointerId: 1,
					pointerType: 'mouse',
				}),
			);
		},
		{ type, point },
	);
}

function dispatchCanvasDrag(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	return page.locator('#overlay').evaluate(
		(canvas, gesture) => {
			const bounds = canvas.getBoundingClientRect();
			const event = (type: string, point: Readonly<{ x: number; y: number }>) =>
				new PointerEvent(type, {
					bubbles: true,
					clientX: bounds.left + (point.x * bounds.width) / canvas.width,
					clientY: bounds.top + (point.y * bounds.height) / canvas.height,
					pointerId: 1,
					pointerType: 'mouse',
				});
			canvas.dispatchEvent(event('pointerdown', gesture.from));
			canvas.dispatchEvent(event('pointermove', gesture.to));
			canvas.dispatchEvent(event('pointerup', gesture.to));
		},
		{ from, to },
	);
}

function annotationPixels(page: Page): Promise<string> {
	return page
		.locator('.annotation-canvas')
		.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));
}
