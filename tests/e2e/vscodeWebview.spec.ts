import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { vscodeEditorPage } from '../../src/shells/vscode/editorPage';
import {
	type HostMessage,
	HostMessageType,
	type WebviewMessage,
	WebviewMessageType,
} from '../../src/shells/vscode/vscodeMessages';

/** Built by `npm run build:vscode`; served here as VS Code serves the extension's webview folder. */
const WEBVIEW_DIRECTORY = 'vscode-extension/webview';
const WEBVIEW_PATH = '/vscode-webview/';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
};
const Surface = { width: 120, height: 80 } as const;
const SAVE_REQUEST_ID = 7;
const PAGE = 'editor.html';
const TEST_NONCE = 'test-nonce';

interface HostWindow extends Window {
	sentToHost: WebviewMessage[];
}

test.beforeEach(async ({ page }) => {
	await page.route(`**${WEBVIEW_PATH}**`, async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.slice(WEBVIEW_PATH.length);
		if (path === PAGE) {
			const source = await readFile(join(WEBVIEW_DIRECTORY, PAGE), 'utf8');
			await route.fulfill({
				contentType: CONTENT_TYPES['.html'],
				body: vscodeEditorPage(source, {
					baseUrl: `${url.origin}${WEBVIEW_PATH}`,
					resourceSource: url.origin,
					nonce: TEST_NONCE,
					preferences: {},
				}),
			});
			return;
		}
		await route.fulfill({
			body: await readFile(join(WEBVIEW_DIRECTORY, path)),
			contentType: CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
		});
	});
	await page.addInitScript(() => {
		const host = window as unknown as HostWindow;
		host.sentToHost = [];
		Object.assign(window, {
			acquireVsCodeApi: () => ({ postMessage: (message: WebviewMessage) => host.sentToHost.push(message) }),
		});
	});
});

test('the VS Code webview opens the host file, reports edits and saves back into it', async ({ page }) => {
	await page.goto(`${WEBVIEW_PATH}${PAGE}`);
	await expect.poll(() => sent(page, WebviewMessageType.Ready)).toHaveLength(1);
	await expect(page.locator('html')).toHaveAttribute('data-host', 'vscode');

	await send(page, { type: HostMessageType.Open, fileName: 'diagram.png', contents: await pngBytes(page) });
	await expect(page.locator('#dimensions')).toHaveText(`${Surface.width} × ${Surface.height} px`);
	expect(await sent(page, WebviewMessageType.Changed)).toHaveLength(0);

	await page.keyboard.press('b');
	await paintStroke(page);
	await expect.poll(async () => (await sent(page, WebviewMessageType.Changed)).length).toBeGreaterThan(0);

	await send(page, { type: HostMessageType.Save, requestId: SAVE_REQUEST_ID });
	// Saving a PNG with layers asks the host to confirm flattening them.
	const [confirm] = await waitFor(page, WebviewMessageType.Confirm);
	await send(page, { type: HostMessageType.Reply, requestId: requestIdOf(confirm), value: true });
	const [write] = await waitFor(page, WebviewMessageType.Write);
	expect(write).toMatchObject({ type: WebviewMessageType.Write, targetId: 'document' });
	await send(page, { type: HostMessageType.Reply, requestId: requestIdOf(write), value: true });
	await expect.poll(() => sent(page, WebviewMessageType.Saved)).toEqual([
		{ type: WebviewMessageType.Saved, requestId: SAVE_REQUEST_ID },
	]);
});

/** Drawn on the canvas directly: the small test image lies under the docked Tools toolbar. */
async function paintStroke(page: Page): Promise<void> {
	await page.locator('#overlay').evaluate((overlay) => {
		const bounds = overlay.getBoundingClientRect();
		for (const [type, offset, buttons] of [
			['pointerdown', 10, 1],
			['pointermove', 50, 1],
			['pointerup', 50, 0],
		] as const)
			overlay.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					button: 0,
					buttons,
					pointerId: 1,
					clientX: bounds.left + offset,
					clientY: bounds.top + offset,
				}),
			);
	});
}

async function pngBytes(page: Page): Promise<Uint8Array<ArrayBuffer>> {
	const encoded = await page.evaluate(({ width, height, color }) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d')!;
		context.fillStyle = color;
		context.fillRect(0, 0, width, height);
		return canvas.toDataURL('image/png').split(',')[1]!;
	}, { ...Surface, color: ColorPalette.White });
	return new Uint8Array(Buffer.from(encoded, 'base64'));
}

/** Delivers a message as the extension would; typed arrays are cloned like VS Code does. */
async function send(page: Page, message: HostMessage): Promise<void> {
	const serializable = 'contents' in message ? { ...message, contents: [...message.contents] } : message;
	await page.evaluate((data) => {
		const message = 'contents' in data ? { ...data, contents: new Uint8Array(data.contents as number[]) } : data;
		window.postMessage(message, '*');
	}, serializable);
}

function sent(page: Page, type: WebviewMessage['type']): Promise<WebviewMessage[]> {
	return page.evaluate(
		(messageType) => (window as unknown as HostWindow).sentToHost
			.filter((message) => message.type === messageType)
			.map((message) => ('contents' in message ? { ...message, contents: [] } : message)),
		type,
	) as Promise<WebviewMessage[]>;
}

async function waitFor(page: Page, type: WebviewMessage['type']): Promise<WebviewMessage[]> {
	await expect.poll(async () => (await sent(page, type)).length).toBeGreaterThan(0);
	return sent(page, type);
}

function requestIdOf(message: WebviewMessage | undefined): number {
	if (!message || !('requestId' in message)) throw new Error('The webview sent no request.');
	return message.requestId;
}
