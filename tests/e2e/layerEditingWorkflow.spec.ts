import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const PROJECT_FORMAT_VERSION = 1;
const RECOVERY_SETTLE_MS = 500;
const Color = {
	Red: '#ff0000',
	Blue: '#0000ff',
	RedPixel: [255, 0, 0, 255],
	BluePixel: [0, 0, 255, 255],
	BlackPixel: [0, 0, 0, 255],
} as const;
const Stroke = {
	First: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
	Second: [{ x: 100, y: 200 }, { x: 300, y: 200 }],
	Third: [{ x: 100, y: 300 }, { x: 300, y: 300 }],
} as const satisfies Record<string, readonly [CanvasPoint, CanvasPoint]>;
const LayerRow = '[data-panel="layers"] .layer-object-row';

test('a layer row activates its layer without changing the tool', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await newPaintLayer(page);
	await paint(page, Stroke.Second);
	await expect(page.locator(LayerRow)).toHaveText([/Paint layer 2/, /Paint layer 1/]);

	await page.locator(LayerRow, { hasText: 'Paint layer 1' }).locator('.layer-name').click();
	await expect(page.locator('[data-tool="select"]')).not.toHaveClass(/active/);
	await paint(page, Stroke.Third);

	await expect(page.locator(LayerRow)).toHaveCount(2);
	await expect(page.locator(`${LayerRow}.active`)).toContainText('Paint layer 1');
});

test('layer names stay with their layers when the stack is reordered', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await newPaintLayer(page);
	await paint(page, Stroke.Second);
	await page
		.locator(LayerRow, { hasText: 'Paint layer 1' })
		.getByRole('button', { name: /Move .* forward/ })
		.click();
	await expect(page.locator(LayerRow)).toHaveText([/Paint layer 1/, /Paint layer 2/]);
});

test('a new paint layer is created directly above the active layer', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await newPaintLayer(page);
	await paint(page, Stroke.Second);
	await page.locator(LayerRow, { hasText: 'Paint layer 1' }).locator('.layer-name').click();
	await newPaintLayer(page);
	await expect(page.locator(LayerRow)).toHaveText([
		/Paint layer 2/,
		/Paint layer 3/,
		/Paint layer 1/,
	]);
});

test('rename, opacity and blend mode survive a reload and a .limg round trip', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await setActiveLayerAppearance(page, 'Sky', '50', 'multiply');
	await expect(page.locator(`${LayerRow}.active`)).toContainText('Sky');
	await expect(page.locator(`${LayerRow}.active .layer-appearance`)).toHaveText(
		'50% · Multiply',
	);

	await page.waitForTimeout(RECOVERY_SETTLE_MS);
	await page.reload();
	await showLayersPanel(page);
	await expectActiveLayerAppearance(page, 'Sky', '50', 'multiply');

	await installProjectWriter(page);
	await page.locator('#quickSaveButton').click();
	const source = await savedProject(page);
	const project = JSON.parse(source) as {
		version: number;
		editableObjects: {
			state: {
				objects: ReadonlyArray<{
					name?: string;
					layerOpacity?: number;
					blendMode?: string;
				}>;
			};
		};
	};
	expect(project.version).toBe(PROJECT_FORMAT_VERSION);
	expect(project.editableObjects.state.objects[0]).toMatchObject({
		name: 'Sky',
		layerOpacity: 0.5,
		blendMode: 'multiply',
	});

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'layers.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await showLayersPanel(page);
	await page.locator(LayerRow, { hasText: 'Sky' }).locator('.layer-name').click();
	await expectActiveLayerAppearance(page, 'Sky', '50', 'multiply');
});

test('a multiply layer blends with the image beneath it', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page, Color.Blue);
	await paint(page, Stroke.First);
	const center = { x: 200, y: 100 };
	expect(await annotationPixel(page, center)).toEqual(Color.BluePixel);

	await setActiveLayerAppearance(page, null, '100', 'multiply');
	await expect.poll(() => annotationPixel(page, center)).toEqual(Color.BlackPixel);
	await expect(page.locator('#canvas')).toHaveCSS('opacity', '0');

	await setActiveLayerAppearance(page, null, '100', 'normal');
	await expect.poll(() => annotationPixel(page, center)).toEqual(Color.BluePixel);
	await expect(page.locator('#canvas')).toHaveCSS('opacity', '1');
});

test('duplicate and merge down are single undoable steps', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await page.locator('[data-panel="layers"] .layer-duplicate').click();
	await expect(page.locator(LayerRow)).toHaveText([/Paint layer 1 copy/, /Paint layer 1/]);

	await page.locator('[data-panel="layers"] .layer-merge-down').click();
	await expect(page.locator(LayerRow)).toHaveCount(1);
	await expect(page.locator(`${LayerRow}.active`)).toContainText('Paint layer 1');

	await page.locator('#undoButton').click();
	await expect(page.locator(LayerRow)).toHaveCount(2);
	await page.locator('#undoButton').click();
	await expect(page.locator(LayerRow)).toHaveCount(1);
});

test('merging the bottom layer writes it into the image as one step', async ({ page }) => {
	await createProject(page, Color.Red);
	await chooseBrush(page, Color.Blue);
	await paint(page, Stroke.First);
	await page.locator('[data-panel="layers"] .layer-merge-down').click();
	await expect(page.locator(LayerRow)).toHaveCount(0);
	expect(await imagePixel(page, { x: 200, y: 100 })).toEqual(Color.BluePixel);

	await page.locator('#undoButton').click();
	await expect(page.locator(LayerRow)).toHaveCount(1);
	expect(await imagePixel(page, { x: 200, y: 100 })).toEqual(Color.RedPixel);
});

test('undo steps back through image and layer edits in the order they were made', async ({
	page,
}) => {
	await createProject(page, Color.Red);
	await chooseBrush(page);
	await paint(page, Stroke.First);
	await page.locator('[data-panel="layers"] .layer-row', { hasText: 'Image' }).locator('.layer-name').click();
	await page.locator('[data-tool="eraser"]').click();
	await paint(page, Stroke.Third);
	const erased = { x: 200, y: 300 };
	expect(await imagePixel(page, erased)).not.toEqual(Color.RedPixel);

	await page.locator('#undoButton').click();
	expect(await imagePixel(page, erased)).toEqual(Color.RedPixel);
	await expect(page.locator(LayerRow)).toHaveCount(1);
	await expect(page.locator('#undoButton')).toBeEnabled();
	await page.locator('#undoButton').click();
	await expect(page.locator(LayerRow)).toHaveCount(0);

	await page.locator('#redoButton').click();
	await expect(page.locator(LayerRow)).toHaveCount(1);
	await page.locator('#redoButton').click();
	expect(await imagePixel(page, erased)).not.toEqual(Color.RedPixel);
});

async function createProject(page: Page, background: string): Promise<void> {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(PROJECT_MIME_TYPE);
	await page.locator('#newImageName').fill('layers');
	await page.locator('#newImageColor').fill(background);
	await page.locator('#createImageButton').click();
	await showLayersPanel(page);
}

async function showLayersPanel(page: Page): Promise<void> {
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

async function chooseBrush(page: Page, color: string = Color.Blue): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
	await page.locator('#colorInput').fill(color);
}

async function newPaintLayer(page: Page): Promise<void> {
	await page.locator('[data-panel="layers"] .layer-new-paint').click();
}

async function setActiveLayerAppearance(
	page: Page,
	name: string | null,
	opacityPercent: string,
	blendMode: string,
): Promise<void> {
	const properties = page.locator('[data-panel="layers"] .layer-properties');
	if (name !== null) {
		await properties.locator('.layer-name-input').fill(name);
		await properties.locator('.layer-name-input').press('Enter');
	}
	await properties.locator('.layer-opacity').fill(opacityPercent);
	await properties.locator('.layer-blend-mode').selectOption(blendMode);
}

async function expectActiveLayerAppearance(
	page: Page,
	name: string,
	opacityPercent: string,
	blendMode: string,
): Promise<void> {
	const properties = page.locator('[data-panel="layers"] .layer-properties');
	await expect(properties.locator('.layer-name-input')).toHaveValue(name);
	await expect(properties.locator('.layer-opacity')).toHaveValue(opacityPercent);
	await expect(properties.locator('.layer-blend-mode')).toHaveValue(blendMode);
}

async function paint(
	page: Page,
	[from, to]: readonly [CanvasPoint, CanvasPoint],
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, gesture) => {
			const canvas = overlay as HTMLCanvasElement;
			canvas.setPointerCapture = () => undefined;
			const bounds = canvas.getBoundingClientRect();
			for (const [type, point, buttons] of [
				['pointerdown', gesture.from, 1],
				['pointermove', gesture.to, 1],
				['pointerup', gesture.to, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 1,
						clientX: bounds.left + (point.x * bounds.width) / canvas.width,
						clientY: bounds.top + (point.y * bounds.height) / canvas.height,
					}),
				);
		},
		{ from, to },
	);
}

async function annotationPixel(page: Page, point: CanvasPoint): Promise<number[]> {
	return canvasPixel(page, '.annotation-canvas', point);
}

async function imagePixel(page: Page, point: CanvasPoint): Promise<number[]> {
	return canvasPixel(page, '#canvas', point);
}

async function canvasPixel(
	page: Page,
	selector: string,
	point: CanvasPoint,
): Promise<number[]> {
	return page.locator(selector).evaluate(
		(canvas, position) => [
			...(canvas as HTMLCanvasElement)
				.getContext('2d')!
				.getImageData(position.x, position.y, 1, 1).data,
		],
		point,
	);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'layers.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(window as Window & { savedProject?: string }).savedProject =
							await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
}

async function savedProject(page: Page): Promise<string> {
	return page
		.waitForFunction(() => (window as Window & { savedProject?: string }).savedProject)
		.then((handle) => handle.jsonValue() as Promise<string>);
}
