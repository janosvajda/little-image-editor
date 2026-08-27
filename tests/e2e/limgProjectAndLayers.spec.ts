import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { seedBrowserCapture } from './support/browserCapture';

const PROJECT_FORMAT_IDENTIFIER = 'little-image-editor-project';
const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';

test('.limg saves and restores an editable layered project', async ({
	page,
}) => {
	await page.goto('/');
	await seedBrowserCapture(page, 'layered-project-source');
	await page.goto('/?capture=layered-project-source');

	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	const layers = page.locator('[data-panel="layers"]');
	await expect(layers).toBeVisible();
	await expect(layers.locator('.layer-row')).toHaveCount(2);

	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'project.limg',
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
	await page.locator('#fileMenu > summary').click();
	await page.locator('#saveProjectButton').click();
	const projectSource = await page
		.waitForFunction(
			() => (window as Window & { savedProject?: string }).savedProject,
		)
		.then((handle) => handle.jsonValue());
	const project = JSON.parse(projectSource as string) as {
		format: string;
		document: { layerState: { layers: unknown[] } };
	};
	expect(project.format).toBe(PROJECT_FORMAT_IDENTIFIER);
	expect(project.document.layerState.layers).toHaveLength(2);

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await expect(page.locator('#canvasWrap')).toBeHidden();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'restored.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(projectSource as string),
	});

	await expect(page.locator('#canvasWrap')).toBeVisible();
	await expect(layers.locator('.layer-row')).toHaveCount(2);
});
