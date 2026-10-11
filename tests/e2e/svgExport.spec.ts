import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { SVG_MIME_TYPE } from '../../src/app/core/document/svgFormat';
import { type AssistantCommand, AssistantCommandKind, type AssistantResult } from '../../src/app/features/assistant/assistantCommandTypes';
import { parseDrawScript } from '../../src/app/features/assistant/drawScript';
import { drawMermaidDiagram } from '../../src/app/features/diagrams/diagramDrawing';
import { HostMessageType, receivedFileBytes, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openImageInVsCode, openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const Size = { width: 600, height: 400 } as const;
/** Colour channels may differ by this much in total before a pixel counts as different: anti-aliasing differs a little. */
const CHANNEL_TOLERANCE = 60;
/** At most this share of pixels may differ between the editor and the SVG drawn by the browser. */
const MAX_DIFFERENT_SHARE = 0.005;
const SCENE = `layer Shapes
rect 20,20 160x90 #333333 outline 3 fill linear(0deg,#ff6600,#ffee00)
ellipse 200,20 120x90 #1d4ed8 outline 2 fill radial(#ffffff,#2563eb)
star 340,20 90x90 #b42318 rotate 15
path "M30 200 C 90 120 160 280 230 200 S 330 140 380 200" #12ab34 width 5 head arrow
arrow 400,140 560,140 560,230 #626977 width 3 dashed head triangle tail filledDiamond
text 30,330 #17191e size 32 "Hello SVG"`;
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" rx="8" fill="#925cff"/></svg>';

/** Runs commands the way an assistant does, returning the editor's result. */
function commands(page: Page): (command: AssistantCommand) => Promise<AssistantResult | undefined> {
	let requestId = 0;
	return async (command) => {
		requestId += 1;
		const id = requestId;
		await sendToWebview(page, { type: HostMessageType.Command, requestId: id, command });
		await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).some((done) => done.requestId === id)).toBe(true);
		return (await sentToHost(page, WebviewMessageType.CommandDone)).find((done) => done.requestId === id)!.result;
	};
}

async function drawScene(page: Page): Promise<(command: AssistantCommand) => Promise<AssistantResult | undefined>> {
	await page.setViewportSize({ width: 1200, height: 800 });
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'scene.png', Size, ColorPalette.Cloud);
	const run = commands(page);
	await run({ kind: AssistantCommandKind.Batch, commands: parseDrawScript(SCENE).commands });
	await run({ kind: AssistantCommandKind.Batch, commands: drawMermaidDiagram('flowchart LR\n  a[Web] --> b[(DB)]', { x: 380, y: 270 }).commands });
	await run({ kind: AssistantCommandKind.PlaceImage, fileName: 'logo.svg', contents: Buffer.from(LOGO).toString('base64'), at: { x: 260, y: 300 } });
	return run;
}

/** The share of pixels where the browser's drawing of the SVG differs from the editor's own. */
function differentShare(page: Page, markup: string): Promise<number> {
	return page.evaluate(
		async ({ svg, width, height, tolerance }) => {
			const surface = () => {
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				return canvas.getContext('2d')!;
			};
			const editor = surface();
			editor.drawImage(document.querySelector<HTMLCanvasElement>('#canvas')!, 0, 0);
			editor.drawImage(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!, 0, 0);
			const image = new Image();
			image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
			await image.decode();
			const exported = surface();
			exported.drawImage(image, 0, 0);
			const a = editor.getImageData(0, 0, width, height).data;
			const b = exported.getImageData(0, 0, width, height).data;
			let different = 0;
			for (let index = 0; index < a.length; index += 4) {
				const distance = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(a[index + channel]! - b[index + channel]!), 0);
				if (distance > tolerance) different += 1;
			}
			return different / (width * height);
		},
		{ svg: markup, ...Size, tolerance: CHANNEL_TOLERANCE },
	);
}

test('an assistant gets a clean SVG that the browser draws the same as the editor', async ({ page }) => {
	const run = await drawScene(page);
	const result = await run({ kind: AssistantCommandKind.ExportSvg });
	expect(result).toMatchObject({ svg: { ...Size, markup: expect.stringContaining('<svg') } });
	const { markup } = (result as Extract<AssistantResult, { svg: unknown }>).svg;
	expect(markup).toContain('<g id="layer-Shapes"');
	expect(markup).toContain('<linearGradient');
	expect(markup).toContain('<radialGradient');
	expect(markup).toContain('>Hello SVG</text>');
	expect(markup).not.toContain('<metadata');
	expect(await differentShare(page, markup)).toBeLessThan(MAX_DIFFERENT_SHARE);
});

test('the VS Code Export dialog writes an SVG file without changing the document', async ({ page }) => {
	const run = await drawScene(page);
	const before = await run({ kind: AssistantCommandKind.Describe });
	await page.getByRole('button', { name: 'Export image', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export image', exact: true });
	await dialog.getByRole('combobox', { name: 'Export file format' }).selectOption(SVG_MIME_TYPE);
	await expect(dialog).toContainText('vectors');
	await dialog.getByRole('button', { name: 'Export SVG…' }).click();
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.PickSaveTarget)).length).toBe(1);
	const [picker] = await sentToHost(page, WebviewMessageType.PickSaveTarget);
	expect(picker).toMatchObject({ suggestedName: 'scene.svg', filters: [{ description: 'SVG image', extensions: ['svg'] }] });
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: picker!.requestId, value: { targetId: 'vector-copy', name: 'scene.svg' } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	const markup = new TextDecoder().decode(receivedFileBytes(write!.contents));
	expect(markup).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400"/);
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: true });
	await expect(dialog).toBeHidden();
	expect(await run({ kind: AssistantCommandKind.Describe })).toEqual(before);
	expect(await sentToHost(page, WebviewMessageType.Saved)).toHaveLength(0);
});
