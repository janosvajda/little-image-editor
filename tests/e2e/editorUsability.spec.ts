import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import type { Point } from '../../src/app/core/document/appTypes';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { AnnotationObjectTypeId } from '../../src/app/features/annotations/annotationTypes';

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
