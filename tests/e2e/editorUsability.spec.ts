import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import type { Point } from '../../src/app/core/document/appTypes';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { AnnotationObjectTypeId } from '../../src/app/features/annotations/annotationTypes';
import { ProjectCodec } from '../../src/app/features/projects/projectCodec';
import { type LittleImageProject, PROJECT_MIME_TYPE } from '../../src/app/features/projects/projectTypes';

const Surface = { width: 600, height: 400 } as const;
const PhotoColor = ColorPalette.CoalGray;
const ChosenColor = { Paint: ColorPalette.JadeGreen, Number: ColorPalette.RubyRed } as const;
const Frame = { from: { x: 150, y: 120 }, to: { x: 250, y: 200 } } as const;
const PointerId = 75;

interface SavedProjectWindow extends Window {
	usabilityProject?: string;
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await openPhoto(page);
});

test('selection frames and resize handles stay visible on dark and light photos in every theme', async ({ page }) => {
	await selectShortcut(page, 'r');
	await drag(page, Frame.from, Frame.to);
	await selectShortcut(page, 'v');
	await page.locator('[data-panel="tools"] .panel-close').click();
	const overlay = page.locator('.selection-overlay');
	const handle = overlay.locator('.selection-handle').first();
	await expect(handle).toBeVisible();
	const expectedColors = await page.evaluate((palette) => {
		const style = document.createElement('span').style;
		style.color = palette.White;
		const white = style.color;
		style.color = palette.Black;
		return { white, black: style.color };
	}, ColorPalette);
	for (const theme of ['dark', 'light', 'contrast']) {
		await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
		const appearance = await overlay.evaluate((element) => {
			const styleOf = (selector: string) => getComputedStyle(element.querySelector(selector)!);
			return {
				underlay: styleOf('.selection-frame-contrast').stroke,
				fill: styleOf('.selection-handle').fill,
				border: styleOf('.selection-handle').stroke,
				strokeScaling: styleOf('.selection-handle').vectorEffect,
			};
		});
		expect(appearance.underlay).toBe(expectedColors.white);
		expect(appearance.fill).not.toBe(expectedColors.black);
		expect(appearance.border).toBe(expectedColors.white);
		expect(appearance.strokeScaling).toBe('non-scaling-stroke');
	}
	const original = await handle.boundingBox();
	await page.locator('#zoomSelect').selectOption('300');
	const zoomed = await handle.boundingBox();
	expect(zoomed?.width).toBeCloseTo(original?.width ?? 0, 0);
	await page.locator('#zoomSelect').selectOption('100');
	await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
	const screenshot = await page.screenshot({ path: '/tmp/little-image-editor-selection-dark.png' });
	const handleBounds = await handle.boundingBox();
	if (!handleBounds) throw new Error('Selection handle has no screen bounds.');
	const fill = await handle.evaluate((element) => getComputedStyle(element).fill);
	const renderedHandle = await screenshotPixel(page, screenshot, {
		x: Math.floor(handleBounds.x + handleBounds.width / 2),
		y: Math.floor(handleBounds.y + handleBounds.height / 2),
	});
	expect(renderedHandle.slice(0, 3)).toEqual(fill.match(/\d+/g)!.map(Number));
	await page.locator('#canvas').evaluate((element, color) => {
		const canvas = element as HTMLCanvasElement;
		canvas.getContext('2d')!.fillStyle = color;
		canvas.getContext('2d')!.fillRect(0, 0, canvas.width, canvas.height);
	}, ColorPalette.White);
	await expect(handle).toBeVisible();
	await page.evaluate(() => document.documentElement.dataset.theme = 'light');
	await page.screenshot({ path: '/tmp/little-image-editor-selection-light.png' });
});

test('the capture toolbar starts numbers red and remembers independent colours in .limg', async ({ page }) => {
	await installProjectWriter(page);
	await page.locator('#colorInput').fill(ChosenColor.Paint);
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="annotations"]').check();
	await page.keyboard.press('Escape');
	await page.locator('[data-panel="annotations"]').getByRole('button', { name: 'Number', exact: true }).click();
	await drag(page, { x: 80, y: 80 });
	const initial = await saveProject(page);
	expect(initial.editableObjects.state.objects[0]).toMatchObject({ type: AnnotationObjectTypeId.Step, color: ColorPalette.Red });
	await page.getByLabel('Selected object color', { exact: true }).fill(ChosenColor.Number);
	await selectShortcut(page, 'p');
	await expect(page.locator('#colorInput')).toHaveValue(ChosenColor.Paint);
	await drag(page, { x: 320, y: 80 }, { x: 360, y: 80 });
	const project = await saveProject(page);
	await page.locator('#projectFileInput').setInputFiles({ name: 'colours.limg', mimeType: PROJECT_MIME_TYPE, buffer: Buffer.from(JSON.stringify(project)) });
	await selectShortcut(page, 'n');
	await expect(page.locator('#colorInput')).toHaveValue(ChosenColor.Number);
	await selectShortcut(page, 'p');
	await expect(page.locator('#colorInput')).toHaveValue(ChosenColor.Paint);
});

test('an explicit selected-object colour is retained when Pencil creates the next object', async ({ page }) => {
	await installProjectWriter(page);
	await selectShortcut(page, 'r');
	await drag(page, Frame.from, Frame.to);
	await page.getByLabel('Selected object color', { exact: true }).fill(ChosenColor.Paint);
	await selectShortcut(page, 'p');
	await expect(page.locator('#colorInput')).toHaveValue(ChosenColor.Paint);
	await drag(page, { x: 320, y: 80 }, { x: 360, y: 80 });
	await selectShortcut(page, 'e');
	await selectShortcut(page, 'p');
	await drag(page, { x: 320, y: 260 }, { x: 360, y: 260 });
	const project = await saveProject(page);
	const strokes = project.editableObjects.state.objects.filter((item) => item.type === AnnotationObjectTypeId.Stroke);
	expect(strokes).toHaveLength(2);
	for (const stroke of strokes) expect(stroke.color).toBe(ChosenColor.Paint);
});

test('erasing a photo after adding objects needs no layer-list selection and survives undo and project save', async ({ page }) => {
	await installProjectWriter(page);
	await selectShortcut(page, 'r');
	await drag(page, Frame.from, Frame.to);
	const before = await saveProject(page);
	await selectShortcut(page, 'e');
	await drag(page, { x: 400, y: 280 }, { x: 450, y: 280 });
	expect(await imagePixel(page, { x: 425, y: 280 })).toEqual([255, 255, 255, 255]);
	await page.locator('#undoButton').click();
	expect(await imagePixel(page, { x: 425, y: 280 })).toEqual([24, 24, 24, 255]);
	await page.locator('#redoButton').click();
	expect(await imagePixel(page, { x: 425, y: 280 })).toEqual([255, 255, 255, 255]);
	const after = await saveProject(page);
	expect(after.editableObjects.state).toEqual(before.editableObjects.state);
	await page.locator('#projectFileInput').setInputFiles({ name: 'erased.limg', mimeType: PROJECT_MIME_TYPE, buffer: Buffer.from(JSON.stringify(after)) });
	expect(await imagePixel(page, { x: 425, y: 280 })).toEqual([255, 255, 255, 255]);
});

async function openPhoto(page: Page): Promise<void> {
	const encoded = await page.evaluate(({ width, height, color }) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d')!;
		context.fillStyle = color;
		context.fillRect(0, 0, width, height);
		return canvas.toDataURL('image/png').split(',')[1]!;
	}, { ...Surface, color: PhotoColor });
	await page.locator('#fileInput').setInputFiles({ name: 'dark-photo.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
	await expect(page.locator('#canvasWrap')).toBeVisible();
}

async function selectShortcut(page: Page, shortcut: string): Promise<void> {
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await page.keyboard.press(shortcut);
}

async function drag(page: Page, from: Point, to: Point = from): Promise<void> {
	await page.locator('#overlay').evaluate((element, gesture) => {
		const canvas = element as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		canvas.setPointerCapture = () => undefined;
		for (const [type, point, buttons] of [['pointerdown', gesture.from, 1], ['pointermove', gesture.to, 1], ['pointerup', gesture.to, 0]] as const)
			canvas.dispatchEvent(new PointerEvent(type, {
				bubbles: true, button: 0, buttons, pointerId: gesture.pointerId,
				clientX: bounds.left + point.x * bounds.width / canvas.width,
				clientY: bounds.top + point.y * bounds.height / canvas.height,
			}));
	}, { from, to, pointerId: PointerId });
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'usability.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => (window as SavedProjectWindow).usabilityProject = await blob.text(),
					close: async () => undefined,
				}),
			}),
		});
	});
}

async function saveProject(page: Page): Promise<LittleImageProject> {
	await page.evaluate(() => (window as SavedProjectWindow).usabilityProject = undefined);
	await page.locator('#fileMenu > summary').click();
	await page.locator('#saveProjectButton').click();
	const source = await page.waitForFunction(() => (window as SavedProjectWindow).usabilityProject).then((handle) => handle.jsonValue());
	if (typeof source !== 'string') throw new Error('Project save produced no document.');
	return new ProjectCodec().parse(source);
}

function screenshotPixel(page: Page, screenshot: Buffer, point: Point): Promise<number[]> {
	return page.evaluate(async ({ encoded, position }) => {
		const image = new Image();
		image.src = `data:image/png;base64,${encoded}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		return Array.from(context.getImageData(position.x, position.y, 1, 1).data);
	}, { encoded: screenshot.toString('base64'), position: point });
}

function imagePixel(page: Page, point: Point): Promise<number[]> {
	return page.locator('#canvas').evaluate((element, position) => Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(position.x, position.y, 1, 1).data), point);
}
