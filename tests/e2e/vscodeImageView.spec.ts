import { expect, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openImageInVsCode, openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const VIEW_REQUEST_ID = 5;
const IMAGE = { width: 400, height: 200 } as const;
const MAX_SIZE = 100;
/** Every PNG file starts with these bytes. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

test('the VS Code editor hands an assistant a picture of the whole image, scaled to the asked size', async ({ page }) => {
	await openVsCodeWebview(page);
	await sendToWebview(page, { type: HostMessageType.View, requestId: VIEW_REQUEST_ID, maxSize: MAX_SIZE });
	// Before an image is open there is nothing to show, and the editor says so.
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Viewed)).length).toBe(1);
	expect(await sentToHost(page, WebviewMessageType.Viewed)).toEqual([
		{ type: WebviewMessageType.Viewed, requestId: VIEW_REQUEST_ID, error: 'No image is open in the editor.' },
	]);

	await openImageInVsCode(page, 'diagram.png', IMAGE, ColorPalette.Azure);
	await sendToWebview(page, { type: HostMessageType.View, requestId: VIEW_REQUEST_ID + 1, maxSize: MAX_SIZE });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Viewed)).length).toBe(2);
	const viewed = (await sentToHost(page, WebviewMessageType.Viewed))[1]!;
	if (!('image' in viewed)) throw new Error(viewed.error);
	expect(viewed.requestId).toBe(VIEW_REQUEST_ID + 1);
	expect(viewed.image).toMatchObject({ width: MAX_SIZE, height: MAX_SIZE / 2, imageWidth: IMAGE.width, imageHeight: IMAGE.height });
	expect([...viewed.image.contents.slice(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
});
