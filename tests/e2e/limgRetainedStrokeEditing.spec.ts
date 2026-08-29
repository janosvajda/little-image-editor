import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const Gesture = {
	Start: { x: 380, y: 280 },
	End: { x: 560, y: 360 },
	Move: { x: 70, y: 45 },
} as const;

test('a .limg brush stroke remains selectable, movable, saved, and editable after reopen', async ({
	page,
}) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('editable-brush-stroke');
	await page.locator('#createImageButton').click();
	await chooseBrush(page);
	await dragCanvas(page, Gesture.Start, Gesture.End);
	await page.locator('#quickSaveButton').click();
	const original = lastStroke(await savedProject(page));

	await page.locator('[data-tool="select"]').click();
	const midpoint = {
		x: (Gesture.Start.x + Gesture.End.x) / 2,
		y: (Gesture.Start.y + Gesture.End.y) / 2,
	};
	await dragCanvas(page, midpoint, {
		x: midpoint.x + Gesture.Move.x,
		y: midpoint.y + Gesture.Move.y,
	});
	await page.evaluate(() => {
		delete (window as Window & { savedProjectSource?: string })
			.savedProjectSource;
	});
	await page.locator('#quickSaveButton').click();
	const source = await savedProject(page);
	const stroke = lastStroke(source);

	expect(stroke.type).toBe('stroke');
	expect(stroke.points).toEqual(original.points);
	expect(stroke.rect.x).toBeGreaterThan(original.rect.x);
	expect(stroke.rect.y).toBeGreaterThan(original.rect.y);
	await dragCanvas(page, { x: 760, y: 560 }, { x: 760, y: 560 });
	const beforeReopen = await canvasHash(page);

	await closeAndOpen(page, source);
	expect(await canvasHash(page)).toBe(beforeReopen);
	await page.locator('#toolbarPickerButton').click();
	const layersToggle = page.locator('[data-panel-toggle="layers"]');
	if (!(await layersToggle.isChecked())) await layersToggle.check();
	const restoredStrokeLayer = page.locator(
		'[data-panel="layers"] .layer-object-row',
	);
	await expect(restoredStrokeLayer).toHaveCount(1);
	await expect(
		restoredStrokeLayer.getByRole('button', { name: /Edit Paint layer/ }),
	).toBeEnabled();
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
			canvas.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					button: 0,
					buttons: 1,
					pointerId: 31,
					clientX: start.x,
					clientY: start.y,
				}),
			);
			canvas.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					button: 0,
					buttons: 1,
					pointerId: 31,
					clientX: end.x,
					clientY: end.y,
				}),
			);
			canvas.dispatchEvent(
				new PointerEvent('pointerup', {
					bubbles: true,
					button: 0,
					buttons: 0,
					pointerId: 31,
					clientX: end.x,
					clientY: end.y,
				}),
			);
		},
		{ from, to },
	);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'editable-brush-stroke.limg',
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

function lastStroke(source: string): {
	type: string;
	points: Array<{ x: number; y: number }>;
	rect: { x: number; y: number; width: number; height: number };
} {
	const project = JSON.parse(source) as {
		editableObjects: {
			state: {
				objects: Array<{
					type: string;
					points?: Array<{ x: number; y: number }>;
					rect: { x: number; y: number; width: number; height: number };
				}>;
			};
		};
	};
	const stroke = project.editableObjects.state.objects.at(-1)!;
	return { type: stroke.type, points: stroke.points ?? [], rect: stroke.rect };
}

async function closeAndOpen(page: Page, source: string): Promise<void> {
	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'editable-brush-stroke.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
}

function canvasHash(page: Page): Promise<string> {
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
