import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { vscodeEditorPage } from '../../../src/shells/vscode/editorPage';
import {
	type HostMessage,
	HostMessageType,
	type WebviewMessage,
} from '../../../src/shells/vscode/vscodeMessages';

/** Built by `npm run build:vscode`; served here as VS Code serves the extension's webview folder. */
const WEBVIEW_DIRECTORY = 'vscode-extension/webview';
const WEBVIEW_PATH = '/vscode-webview/';
const PAGE = 'editor.html';
const TEST_NONCE = 'test-nonce';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
};

export interface HostWindow extends Window {
	sentToHost: WebviewMessage[];
}

/** Opens the editor as VS Code shows it, with a stand-in for VS Code's webview API that records messages. */
export async function openVsCodeWebview(page: Page): Promise<void> {
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
	await page.goto(`${WEBVIEW_PATH}${PAGE}`);
}

/** Sends a plain image to the editor, as the extension does when a file is opened. */
export async function openImageInVsCode(
	page: Page,
	fileName: string,
	size: Readonly<{ width: number; height: number }>,
	color: string,
): Promise<void> {
	await page.evaluate(
		({ name, width, height, fill, openType }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d')!;
			context.fillStyle = fill;
			context.fillRect(0, 0, width, height);
			canvas.toBlob(async (blob) => {
				const contents = new Uint8Array(await blob!.arrayBuffer());
				window.postMessage({ type: openType, fileName: name, contents }, '*');
			});
		},
		{ name: fileName, ...size, fill: color, openType: HostMessageType.Open },
	);
	await page.locator('#canvasWrap').waitFor({ state: 'visible' });
}

/** Delivers a message without file contents to the editor, as the extension does. */
export async function sendToWebview(page: Page, message: Exclude<HostMessage, { contents: unknown }>): Promise<void> {
	await page.evaluate((data) => window.postMessage(data, '*'), message);
}

/** The messages of one type the editor has sent to the extension so far. */
export function sentToHost<Type extends WebviewMessage['type']>(
	page: Page,
	type: Type,
): Promise<Extract<WebviewMessage, { type: Type }>[]> {
	return page.evaluate(
		(messageType) => (window as unknown as HostWindow).sentToHost.filter((message) => message.type === messageType),
		type,
	) as Promise<Extract<WebviewMessage, { type: Type }>[]>;
}
