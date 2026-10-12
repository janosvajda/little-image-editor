import { expect, type Page, test } from '@playwright/test';
import { SVG_MIME_TYPE } from '../../src/app/core/document/svgFormat';
import { AssistantCommandKind, type AssistantResult } from '../../src/app/features/assistant/assistantCommandTypes';
import { HostMessageType, receivedFileBytes, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

/**
 * An SVG as a design tool writes it: layers as labelled groups, a class from
 * its style sheet, a gradient, a curve, centred text, a blurred part, a
 * greyed part no item can be, and a script that must never run.
 */
const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 200 100">
  <style>.sky { fill: #0000ff }</style>
  <defs>
    <linearGradient id="sun"><stop offset="0" stop-color="#ffff00"/><stop offset="1" stop-color="#ffff00"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="1"/></filter>
    <filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <g inkscape:label="Background"><rect class="sky" width="200" height="100"/></g>
  <g inkscape:label="Shapes">
    <rect x="20" y="20" width="40" height="40" fill="#ff0000"/>
    <circle cx="150" cy="40" r="20" fill="url(#sun)"/>
    <path d="M10 90 C 60 60 140 120 190 80" fill="none" stroke="#00ff00" stroke-width="4"/>
  </g>
  <g inkscape:label="Notes">
    <text x="100" y="20" font-size="12" text-anchor="middle" fill="#ffffff">Hello</text>
    <rect x="170" y="70" width="20" height="20" fill="#ffffff" filter="url(#blur)"/>
    <circle cx="10" cy="10" r="6" fill="#ff0000" filter="url(#grey)"/>
  </g>
  <script>window.svgScriptRan = true</script>
</svg>`;
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const LAYERS = '[data-panel="layers"]';

/** A pixel of what the editor shows: the image with its layers above it. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
	return page.evaluate(
		({ px, py }) => {
			const image = document.querySelector<HTMLCanvasElement>('#canvas')!;
			const composite = document.createElement('canvas');
			composite.width = image.width;
			composite.height = image.height;
			const context = composite.getContext('2d')!;
			context.drawImage(image, 0, 0);
			context.drawImage(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!, 0, 0);
			return Array.from(context.getImageData(px, py, 1, 1).data).slice(0, 3);
		},
		{ px: x, py: y },
	);
}

async function showLayers(page: Page): Promise<void> {
	if (await page.locator(LAYERS).isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

/** A save picker that hands back a file keeping what is written into it. */
async function savingInto(page: Page, name: string): Promise<void> {
	await page.evaluate((fileName) => {
		const host = window as Window & { suggestedSave?: string; savedSvg?: string[] };
		host.savedSvg = [];
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async ({ suggestedName }: { suggestedName: string }) => {
				host.suggestedSave = suggestedName;
				return { name: fileName, createWritable: async () => ({ write: async (blob: Blob) => void host.savedSvg!.push(await blob.text()), close: async () => undefined }) };
			},
		});
	}, name);
}

const savedSvg = (page: Page) => page.evaluate(() => (window as Window & { savedSvg?: string[] }).savedSvg ?? []);

test('a new SVG image is drawn on, saved as SVG and opened again with the same items', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(SVG_MIME_TYPE);
	await expect(page.locator('#newImageFileTypeWarning')).toContainText('editable vectors');
	await page.getByLabel('Image name').fill('poster');
	await page.locator('#createImageButton').click();
	await page.keyboard.press('r');
	const box = (await page.locator('#overlay').boundingBox())!;
	// Clear of the Tools panel, which sits over the image's left side.
	await page.mouse.move(box.x + 400, box.y + 150);
	await page.mouse.down();
	await page.mouse.move(box.x + 650, box.y + 350, { steps: 6 });
	await page.mouse.up();

	await savingInto(page, 'poster.svg');
	await page.locator('#quickSaveButton').click();
	await expect.poll(async () => (await savedSvg(page)).length).toBe(1);
	expect(await page.evaluate(() => (window as Window & { suggestedSave?: string }).suggestedSave)).toBe('poster.svg');
	const [markup] = await savedSvg(page);
	expect(markup).toContain('<rect');

	await page.locator('#fileInput').setInputFiles({ name: 'poster.svg', mimeType: SVG_MIME_TYPE, buffer: Buffer.from(markup!) });
	await showLayers(page);
	await expect(page.locator(`${LAYERS} .layer-item-row`)).toHaveCount(1);
	await expect(page.locator(`${LAYERS} .layer-item-row .layer-name`)).toHaveText(/Rectangle/);
});
