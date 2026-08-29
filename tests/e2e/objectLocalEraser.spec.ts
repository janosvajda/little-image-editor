import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE =
	'application/vnd.little-image-editor.project+json';
const StrokeGesture = {
	from: { x: 260, y: 240 },
	to: { x: 520, y: 360 },
} as const;
const EraserGesture = {
	from: { x: 370, y: 280 },
	to: { x: 420, y: 325 },
} as const;
const EXPECTED_OBJECT_COUNT = 1;
const ALPHA_CHANNEL_OFFSET = 3;
const ERASER_SIZE = '80';

test('eraser masks the selected object without creating a layer and survives project save', async ({
	page,
}) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(PROJECT_MIME_TYPE);
	await page.locator('#createImageButton').click();
	await chooseBrush(page);
	const initialStrokeSize = Number(await page.locator('#sizeInput').inputValue());
	await dragCanvas(page, StrokeGesture.from, StrokeGesture.to);
	const pixelsBefore = await annotationHash(page);

	await page.locator('[data-tool="eraser"]').click();
	await expect(page.locator('.selected-object-options')).toBeHidden();
	await page.locator('#sizeInput').fill(ERASER_SIZE);
	await page.locator('#sizeInput').dispatchEvent('change');
	await dragCanvas(page, EraserGesture.from, EraserGesture.to);

	expect(await annotationHash(page)).not.toBe(pixelsBefore);
	await page.locator('#undoButton').click();
	expect(await annotationHash(page)).toBe(pixelsBefore);
	await page.locator('#redoButton').click();
	expect(await annotationHash(page)).not.toBe(pixelsBefore);
	const erasedAlpha = await annotationAlphaAt(page, {
		x: (EraserGesture.from.x + EraserGesture.to.x) / 2,
		y: (EraserGesture.from.y + EraserGesture.to.y) / 2,
	});
	await chooseBrush(page);
	await dragCanvas(page, EraserGesture.to, EraserGesture.from);
	const repaintedAlpha = await annotationAlphaAt(page, {
		x: (EraserGesture.from.x + EraserGesture.to.x) / 2,
		y: (EraserGesture.from.y + EraserGesture.to.y) / 2,
	});
	expect(repaintedAlpha).toBeGreaterThan(erasedAlpha);

	await page.locator('#quickSaveButton').click();
	const project = JSON.parse(await savedProject(page)) as {
		editableObjects: {
			state: {
				objects: Array<{
					type: string;
					size?: number;
					pathStarts?: number[];
					points?: unknown[];
					erasures?: Array<{ strokePointLimit?: number }>;
				}>;
			};
		};
	};
	expect(project.editableObjects.state.objects).toHaveLength(
		EXPECTED_OBJECT_COUNT,
	);
	expect(project.editableObjects.state.objects[0]).toMatchObject({
		type: 'stroke',
		size: initialStrokeSize,
	});
	expect(project.editableObjects.state.objects[0]?.erasures).toHaveLength(1);
	expect(project.editableObjects.state.objects[0]?.pathStarts).toHaveLength(1);
	const savedStroke = project.editableObjects.state.objects[0]!;
	expect(savedStroke.erasures?.[0]?.strokePointLimit).toBeLessThan(
		savedStroke.points?.length ?? 0,
	);
});

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function dragCanvas(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, points) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			const screen = (point: Readonly<{ x: number; y: number }>) => ({
				x: bounds.left + (point.x * bounds.width) / canvas.width,
				y: bounds.top + (point.y * bounds.height) / canvas.height,
			});
			const start = screen(points.from);
			const end = screen(points.to);
			canvas.setPointerCapture = () => undefined;
			for (const event of [
				{ type: 'pointerdown', point: start, buttons: 1 },
				{ type: 'pointermove', point: end, buttons: 1 },
				{ type: 'pointerup', point: end, buttons: 0 },
			])
				canvas.dispatchEvent(
					new PointerEvent(event.type, {
						bubbles: true,
						button: 0,
						buttons: event.buttons,
						pointerId: 63,
						clientX: event.point.x,
						clientY: event.point.y,
					}),
				);
		},
		{ from, to },
	);
}

function annotationHash(page: Page): Promise<string> {
	return page
		.locator('.annotation-canvas')
		.evaluate(async (canvas: HTMLCanvasElement) => {
			const pixels = canvas
				.getContext('2d')!
				.getImageData(0, 0, canvas.width, canvas.height).data;
			const digest = await crypto.subtle.digest('SHA-256', pixels);
			return [...new Uint8Array(digest)]
				.map((value) => value.toString(16).padStart(2, '0'))
				.join('');
		});
}

function annotationAlphaAt(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<number> {
	return page
		.locator('.annotation-canvas')
		.evaluate(
			(canvas: HTMLCanvasElement, options) =>
				canvas
					.getContext('2d')!
					.getImageData(options.point.x, options.point.y, 1, 1).data[
						options.alphaChannelOffset
					] ?? 0,
			{ point, alphaChannelOffset: ALPHA_CHANNEL_OFFSET },
		);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'erased-object.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(
							window as Window & { savedProjectSource?: string }
						).savedProjectSource = await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
}

function savedProject(page: Page): Promise<string> {
	return page
		.waitForFunction(
			() =>
				(window as Window & { savedProjectSource?: string })
					.savedProjectSource,
		)
		.then((handle) => handle.jsonValue());
}
