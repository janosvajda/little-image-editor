import { expect, type Page, test } from '@playwright/test';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
} from '../../src/app/features/assistant/assistantCommandTypes';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const RED = '#d62828';
const GREEN = '#2a9d48';
const SIZE = { width: 400, height: 300 } as const;

/** Sends a command as the extension does and returns the editor's answer. */
async function command(page: Page, requestId: number, assistantCommand: AssistantCommand): Promise<AssistantResult> {
	await sendToWebview(page, { type: HostMessageType.Command, requestId, command: assistantCommand });
	await expect
		.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).some((done) => done.requestId === requestId))
		.toBe(true);
	const done = (await sentToHost(page, WebviewMessageType.CommandDone)).find((answer) => answer.requestId === requestId)!;
	if ('error' in done) throw new Error(done.error);
	return done.result;
}

test('an assistant creates an image in VS Code and draws on two layers, which the user sees and can undo', async ({ page }) => {
	await openVsCodeWebview(page);
	await sendToWebview(page, {
		type: HostMessageType.Create,
		fileName: 'apple.png',
		image: { ...SIZE, background: '#ffffff', transparent: false },
	});
	// Made for the assistant, so no New image dialog asks for the size.
	await expect(page.locator('#dimensions')).toHaveText(`${SIZE.width} × ${SIZE.height} px`);
	await expect(page.locator('#newImageDialog')).toBeHidden();

	const circle = { kind: AssistantCommandKind.AddShape, shape: 'ellipse', fill: true, strokeWidth: 4, opacity: 1, rotation: 0 } as const;
	await command(page, 1, { kind: AssistantCommandKind.AddLayer, name: 'Circles' });
	await command(page, 2, { ...circle, color: RED, rect: { x: 20, y: 20, width: 80, height: 80 } });
	await command(page, 3, { ...circle, color: RED, rect: { x: 120, y: 20, width: 80, height: 80 } });
	await command(page, 4, { kind: AssistantCommandKind.AddLayer, name: 'Apple' });
	await command(page, 5, { ...circle, color: GREEN, rect: { x: 220, y: 120, width: 120, height: 110 } });

	const described = await command(page, 6, { kind: AssistantCommandKind.Describe });
	expect('document' in described && described.document.layers.map((layer) => [layer.name, layer.items.length])).toEqual([
		['Circles', 2],
		['Apple', 1],
	]);
	await expect(page.locator('.layer-row', { hasText: 'Circles' })).toHaveCount(1);
	await expect(page.locator('.layer-row', { hasText: 'Apple' })).toHaveCount(1);
	// The drawing is real: the picture shows the green apple shape.
	const green = await page.locator('#canvasWrap').evaluate(() =>
		Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(280, 175, 1, 1).data),
	);
	expect(green.slice(0, 3)).toEqual([0x2a, 0x9d, 0x48]);

	expect(await command(page, 7, { kind: AssistantCommandKind.Undo })).toEqual({ undone: true });
	const afterUndo = await command(page, 8, { kind: AssistantCommandKind.Describe });
	expect('document' in afterUndo && afterUndo.document.layers.map((layer) => layer.items.length)).toEqual([2, 0]);
	// A new image counts as unsaved in VS Code.
	expect((await sentToHost(page, WebviewMessageType.Changed)).length).toBeGreaterThan(0);
});
