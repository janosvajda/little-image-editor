import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';

test('the regular Open command accepts and restores a .limg project', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(PROJECT_MIME_TYPE);
	await page.locator('#createImageButton').click();
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'open-through-file-menu.limg',
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
	const source = await page
		.waitForFunction(
			() => (window as Window & { projectSource?: string }).projectSource,
		)
		.then((handle) => handle.jsonValue());

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	const regularOpenInput = page.locator('#fileInput');
	await expect(regularOpenInput).toHaveAttribute('accept', /\.limg/);
	await regularOpenInput.setInputFiles({
		name: 'open-through-file-menu.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source as string),
	});

	await expect(page.locator('#canvasWrap')).toBeVisible();
	await expect(page.locator('#formatSelect')).toHaveValue(PROJECT_MIME_TYPE);
});
