import { expect, test } from '@playwright/test';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const SAVE_REQUEST_ID = 3;
/** Every JPEG file starts with these bytes. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

test('a new untitled file in VS Code starts a new image that saves in the format of the name it is saved as', async ({ page }) => {
	await openVsCodeWebview(page);
	await expect.poll(() => sentToHost(page, WebviewMessageType.Ready)).toHaveLength(1);

	await sendToWebview(page, { type: HostMessageType.Create, fileName: 'Untitled-1.png' });
	await expect(page.locator('#newImageDialog')).toBeVisible();
	await expect(page.locator('#newImageName')).toHaveValue('Untitled-1');
	await page.locator('#createImageButton').click();
	await expect(page.locator('#canvasWrap')).toBeVisible();
	// A new image is unsaved, so VS Code marks it and asks before closing it.
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Changed)).length).toBeGreaterThan(0);

	// VS Code asks where to save an untitled file; the chosen name decides the format.
	await sendToWebview(page, { type: HostMessageType.Save, requestId: SAVE_REQUEST_ID, fileName: 'sketch.jpg' });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	expect(write?.targetId).toBe('document');
	expect([...(write?.contents ?? []).slice(0, JPEG_SIGNATURE.length)]).toEqual(JPEG_SIGNATURE);
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: true });
	await expect.poll(() => sentToHost(page, WebviewMessageType.Saved)).toEqual([
		{ type: WebviewMessageType.Saved, requestId: SAVE_REQUEST_ID },
	]);
});
