import { Buffer } from 'node:buffer';
import { expect, type Page } from '@playwright/test';
import { ImageMimeType, type ImageFormat, type Point, type Tool } from '../../../src/app/core/document/appTypes';
import { ColorPalette } from '../../../src/app/core/document/colorPalette';
import { DRAWING_TOOL_DEFINITIONS } from '../../../src/app/features/drawing/drawingToolCatalog';
import { ProjectCodec } from '../../../src/app/features/projects/projectCodec';
import { type LittleImageProject, PROJECT_MIME_TYPE } from '../../../src/app/features/projects/projectTypes';

export const TestSurface = { width: 240, height: 180 } as const;
export const PointerPhase = { Press: 'pointerdown', Move: 'pointermove', Release: 'pointerup' } as const;
export interface CanvasPointerSample {
	readonly type: (typeof PointerPhase)[keyof typeof PointerPhase];
	readonly point: Point;
}

interface ProjectWriterWindow extends Window {
	testProjectSource?: string;
}

export async function openTestPhoto(page: Page, format: ImageFormat = ImageMimeType.Png, opacity = 1): Promise<void> {
	await page.goto('/');
	const encoded = await page.evaluate(({ width, height, colors, mimeType, alpha }) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d')!;
		context.globalAlpha = alpha;
		context.fillStyle = colors.Red;
		context.fillRect(0, 0, width, height);
		context.fillStyle = colors.RoyalBlue;
		context.fillRect(width / 2, 0, width / 2, height);
		return canvas.toDataURL(mimeType).split(',')[1]!;
	}, { ...TestSurface, colors: ColorPalette, mimeType: format, alpha: opacity });
	await page.locator('#fileInput').setInputFiles({ name: format === ImageMimeType.Jpeg ? 'photo.jpg' : 'photo.png', mimeType: format, buffer: Buffer.from(encoded, 'base64') });
	await expect(page.locator('#canvasWrap')).toBeVisible();
	await installTestProjectWriter(page);
}

export async function installTestProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'cut-and-move.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => { (window as ProjectWriterWindow).testProjectSource = await blob.text(); },
					close: async () => undefined,
				}),
			}),
		});
	});
}

export async function selectTool(page: Page, tool: Tool): Promise<void> {
	const shortcut = DRAWING_TOOL_DEFINITIONS.find((definition) => definition.id === tool)?.shortcut;
	if (!shortcut) throw new Error(`Tool ${tool} has no keyboard shortcut.`);
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await page.keyboard.press(shortcut);
}

export async function canvasPointers(page: Page, samples: readonly CanvasPointerSample[]): Promise<void> {
	await page.locator('#overlay').evaluate((element, events) => {
		const canvas = element as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		canvas.setPointerCapture = () => undefined;
		for (const { type, point } of events)
			canvas.dispatchEvent(new PointerEvent(type, {
				bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 79,
				clientX: bounds.left + point.x * bounds.width / canvas.width,
				clientY: bounds.top + point.y * bounds.height / canvas.height,
			}));
	}, samples);
}

export function canvasDrag(page: Page, from: Point, to: Point): Promise<void> {
	return canvasPointers(page, [{ type: PointerPhase.Press, point: from }, { type: PointerPhase.Move, point: to }, { type: PointerPhase.Release, point: to }]);
}

/** Real mouse input also verifies that the canvas is not obscured by another UI surface. */
export async function mouseCanvasDrag(page: Page, from: Point, to: Point): Promise<void> {
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('Canvas overlay is not visible.');
	const size = await overlay.evaluate((element) => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
	const screen = (point: Point) => ({ x: bounds.x + point.x * bounds.width / size.width, y: bounds.y + point.y * bounds.height / size.height });
	const start = screen(from), end = screen(to);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 5 });
	await page.mouse.up();
}

export function canvasPixel(page: Page, point: Point, selector = '#canvas'): Promise<number[]> {
	return page.locator(selector).evaluate((element, position) => Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(position.x, position.y, 1, 1).data), point);
}

export async function saveTestProject(page: Page): Promise<LittleImageProject> {
	await page.evaluate(() => { (window as ProjectWriterWindow).testProjectSource = undefined; });
	await page.locator('#fileMenu > summary').click();
	await page.locator('#saveProjectButton').click();
	const source = await page.waitForFunction(() => (window as ProjectWriterWindow).testProjectSource).then((handle) => handle.jsonValue());
	if (typeof source !== 'string') throw new Error('Project save produced no document.');
	return new ProjectCodec().parse(source);
}

export async function restoreTestProject(page: Page, project: LittleImageProject): Promise<void> {
	await page.locator('#projectFileInput').setInputFiles({ name: 'restored.limg', mimeType: PROJECT_MIME_TYPE, buffer: Buffer.from(JSON.stringify(project)) });
}

export async function showLayers(page: Page): Promise<void> {
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}
