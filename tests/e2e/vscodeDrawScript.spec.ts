import { expect, type Page, test } from '@playwright/test';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
} from '../../src/app/features/assistant/assistantCommandTypes';
import { parseDrawScript } from '../../src/app/features/assistant/drawScript';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const SCRIPT = `image fruit.png 400x300 #ffffff
layer Circles
circle 20,20 80 #3a86ff
circle 300,20 80 #ffbe0b
layer Apple
ellipse 150,120 100x120 #2a9d48
text 20,250 #000000 size 24 "Fruit"`;

async function command(page: Page, requestId: number, assistantCommand: AssistantCommand): Promise<AssistantResult> {
	await sendToWebview(page, { type: HostMessageType.Command, requestId, command: assistantCommand });
	await expect
		.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).some((done) => done.requestId === requestId))
		.toBe(true);
	const done = (await sentToHost(page, WebviewMessageType.CommandDone)).find((answer) => answer.requestId === requestId)!;
	if ('error' in done) throw new Error(done.error);
	return done.result;
}

test('one drawing script becomes a whole picture in the editor, which one undo removes', async ({ page }) => {
	const script = parseDrawScript(SCRIPT);
	await openVsCodeWebview(page);
	await sendToWebview(page, { type: HostMessageType.Create, fileName: script.image!.name, image: script.image!.spec });
	await expect(page.locator('#dimensions')).toHaveText('400 × 300 px');

	expect(await command(page, 1, { kind: AssistantCommandKind.Batch, commands: script.commands })).toEqual({
		batch: { layers: ['Circles', 'Apple'], items: 4 },
	});
	await expect(page.locator('.layer-row', { hasText: 'Circles' })).toHaveCount(1);
	const green = await page.evaluate(() =>
		Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(200, 180, 1, 1).data),
	);
	expect(green.slice(0, 3)).toEqual([0x2a, 0x9d, 0x48]);

	expect(await command(page, 2, { kind: AssistantCommandKind.Undo })).toEqual({ undone: true });
	const described = await command(page, 3, { kind: AssistantCommandKind.Describe });
	expect('document' in described && described.document.layers).toEqual([]);
});
