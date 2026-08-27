import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';

test('a new .limg document saves and reopens its editable shape through primary Save', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page
		.locator('#newImageFormat')
		.selectOption({ label: 'Little Image Editor (.limg) — preserves layers' });
	await page.locator('#newImageName').fill('editable-project');
	await page.locator('#createImageButton').click();

	await page.locator('.palette-menu-trigger').nth(1).click();
	await page
		.getByRole('menu', { name: 'Shape tools' })
		.getByRole('menuitem', { name: 'Rectangle', exact: true })
		.click();
	await dragCanvas(page, { x: 350, y: 200 }, { x: 520, y: 320 });

	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'editable-project.limg',
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
	await page.locator('#quickSaveButton').click();
	const source = await page
		.waitForFunction(
			() =>
				(window as Window & { savedProjectSource?: string })
					.savedProjectSource,
		)
		.then((handle) => handle.jsonValue());
	const project = JSON.parse(source as string) as {
		document: { documentType: string };
		editableObjects: { state: { objects: Array<{ type: string }> } };
	};
	expect(project.document.documentType).toBe('project');
	expect(project.editableObjects.state.objects).toMatchObject([
		{ type: 'shape' },
	]);

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'editable-project.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source as string),
	});

	await expect(page.locator('#canvasWrap')).toBeVisible();
	await expect.poll(() => annotationAlphaCount(page)).toBeGreaterThan(0);
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="annotations"]').check();
	await page.locator('[data-annotation-tool="select"]').click();
	await page.locator('#overlay').click({ position: { x: 430, y: 260 } });
	await expect.poll(() => selectionHandleCount(page)).toBeGreaterThan(0);
});

async function dragCanvas(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error('The drawing canvas is not visible.');
	const size = await overlay.evaluate((canvas: HTMLCanvasElement) => ({
		width: canvas.width,
		height: canvas.height,
	}));
	const screenPoint = (point: Readonly<{ x: number; y: number }>) => ({
		x: bounds.x + (point.x * bounds.width) / size.width,
		y: bounds.y + (point.y * bounds.height) / size.height,
	});
	const start = screenPoint(from);
	const end = screenPoint(to);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y);
	await page.mouse.up();
}

function annotationAlphaCount(page: Page): Promise<number> {
	return page.locator('.annotation-canvas').evaluate((canvas: HTMLCanvasElement) => {
		const pixels = canvas
			.getContext('2d')!
			.getImageData(0, 0, canvas.width, canvas.height).data;
		let count = 0;
		for (let index = 3; index < pixels.length; index += 4)
			if (pixels[index] !== 0) count += 1;
		return count;
	});
}

function selectionHandleCount(page: Page): Promise<number> {
	return page.locator('.annotation-canvas').evaluate((canvas: HTMLCanvasElement) => {
		const pixels = canvas
			.getContext('2d')!
			.getImageData(0, 0, canvas.width, canvas.height).data;
		let bluePixels = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			if (
				pixels[index]! < 100 &&
				pixels[index + 1]! > 80 &&
				pixels[index + 2]! > 150
			)
				bluePixels += 1;
		}
		return bluePixels;
	});
}
