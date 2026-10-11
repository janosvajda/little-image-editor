import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { AssistantCommandKind } from '../../src/app/features/assistant/assistantCommandTypes';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openImageInVsCode, openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

/** A red 120 × 60 picture as SVG, small enough to place at its own size. */
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#ff0000"/></svg>';
const ItemRow = '[data-panel="layers"] .layer-item-row';

async function redAt(page: Page, x: number, y: number): Promise<boolean> {
	const [red, green, blue, alpha] = await page.evaluate(
		({ px, py }) => Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(px, py, 1, 1).data),
		{ px: x, py: y },
	);
	return red === 255 && green === 0 && blue === 0 && alpha === 255;
}

test('Place image… puts a picture on the open image as one selected item, centred', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await page.locator('#fileMenu summary').click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('menuitem', { name: 'Place image…' }).click();
	await (await chooser).setFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) });
	const [width, height] = (await page.locator('#dimensions').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
	await expect.poll(() => redAt(page, width / 2, height / 2)).toBe(true);
	expect(await redAt(page, width / 2 - 70, height / 2)).toBe(false);
	if (!(await page.locator('[data-panel="layers"]').isVisible())) {
		await page.locator('#toolbarPickerButton').click();
		await page.locator('[data-panel-toggle="layers"]').check();
		await page.keyboard.press('Escape');
	}
	await expect(page.locator(`${ItemRow}.active`)).toContainText('Pixels');
});

test('in VS Code the toolbar places a picture, and an assistant places one through the editor', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 700 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 600, height: 400 }, ColorPalette.White);
	const button = page.getByRole('button', { name: 'Place image' });
	await expect(button).toBeVisible();
	const chooser = page.waitForEvent('filechooser');
	await button.click();
	await (await chooser).setFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) });
	await expect.poll(() => redAt(page, 300, 200)).toBe(true);

	await sendToWebview(page, {
		type: HostMessageType.Command,
		requestId: 3,
		command: { kind: AssistantCommandKind.PlaceImage, fileName: 'logo.svg', contents: Buffer.from(LOGO).toString('base64'), at: { x: 10, y: 10 }, width: 60 },
	});
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).length).toBe(1);
	const [done] = await sentToHost(page, WebviewMessageType.CommandDone);
	expect(done).toMatchObject({ requestId: 3, result: { itemId: expect.any(String) } });
	await expect.poll(() => redAt(page, 40, 25)).toBe(true);
	expect(await redAt(page, 75, 25)).toBe(false);
});
