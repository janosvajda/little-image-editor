import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { HostMessageType, receivedFileBytes, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openImageInVsCode, openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

/** A picture's type and size as the browser decodes it. */
function decoded(page: Page, bytes: number[], type: string): Promise<{ width: number; height: number }> {
	return page.evaluate(async ({ data, mimeType }) => {
		const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: mimeType }));
		return { width: bitmap.width, height: bitmap.height };
	}, { data: bytes, mimeType: type });
}

test('File → Export opens the Export dialog, where a JPEG\'s quality, size and background are chosen', async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 900 });
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageTransparent').check();
	await page.locator('#createImageButton').click();
	await page.evaluate(() => {
		const host = window as Window & { exported?: { type: string; bytes: number[] } };
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async ({ suggestedName }: { suggestedName: string }) => ({
				name: suggestedName,
				createWritable: async () => ({ write: async (blob: Blob) => void (host.exported = { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] }), close: async () => undefined }),
			}),
		});
	});
	await page.locator('#fileMenu summary').click();
	await page.getByRole('menuitem', { name: 'Export…' }).click();
	const dialog = page.getByRole('dialog', { name: 'Export image' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Keep the transparent background')).toBeVisible();
	await expect(dialog.getByLabel('Export quality')).toBeHidden();

	await dialog.getByLabel('Export file format').selectOption('image/jpeg');
	await expect(dialog.getByLabel('Export quality')).toBeVisible();
	await expect(dialog.getByLabel('Export background colour')).toBeVisible();
	await expect(dialog.getByLabel('Keep the transparent background')).toBeHidden();
	await dialog.getByLabel('Export quality').fill('40');
	await expect(dialog.locator('#exportImageQualityValue')).toHaveText('40%');
	await dialog.getByLabel('Export size').selectOption({ label: '50% · 400 × 300 px' });
	await expect(dialog.locator('#exportImageEstimate')).toContainText('Estimated file size:');
	await page.screenshot({ path: 'test-results/export-dialog/jpeg.png' });

	await dialog.getByRole('button', { name: 'Export JPEG…' }).click();
	await expect(dialog).toBeHidden();
	const exported = await page.waitForFunction(() => (window as Window & { exported?: { type: string; bytes: number[] } }).exported).then((handle) => handle.jsonValue() as Promise<{ type: string; bytes: number[] }>);
	expect(exported!.type).toBe('image/jpeg');
	expect(await decoded(page, exported!.bytes, exported!.type)).toEqual({ width: 400, height: 300 });

	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.locator('#fileMenu summary').click();
	await page.getByRole('menuitem', { name: 'Export…' }).click();
	await dialog.getByLabel('Export file format').selectOption('image/svg+xml');
	await expect(dialog.getByLabel('Include the image layer')).toBeVisible();
	await page.screenshot({ path: 'test-results/export-dialog/svg-dark.png' });
});

test('in VS Code the Export dialog writes a WebP over a chosen background at the chosen size', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 300, height: 200 }, ColorPalette.White);
	await page.getByRole('button', { name: 'Export image', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export image', exact: true });
	await dialog.getByLabel('Export file format').selectOption('image/webp');
	await dialog.getByLabel('Keep the transparent background').uncheck();
	await expect(dialog.getByLabel('Export background colour')).toBeVisible();
	await dialog.getByLabel('Export size').selectOption({ label: '200% · 600 × 400 px' });
	await dialog.getByRole('button', { name: 'Export WebP…' }).click();
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.PickSaveTarget)).length).toBe(1);
	const [picker] = await sentToHost(page, WebviewMessageType.PickSaveTarget);
	expect(picker).toMatchObject({ suggestedName: 'board.webp' });
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: picker!.requestId, value: { targetId: 'copy', name: 'board.webp' } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	expect(await decoded(page, [...receivedFileBytes(write!.contents)], 'image/webp')).toEqual({ width: 600, height: 400 });
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: true });
	await expect(dialog).toBeHidden();
});
