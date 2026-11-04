import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const FIXTURE = 'tests/fixtures/animation/motion-linear.anim.json';
const SAVE_REQUEST_ID = 5;
const GIF_SIGNATURE = 'GIF89a';
const Stage = { width: 200, height: 120, fps: 12 } as const;

/** Draws by dragging across the canvas, relative to its top-left corner. */
async function drag(page: Page, from: readonly [number, number], to: readonly [number, number]): Promise<void> {
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(box.x + from[0], box.y + from[1]);
	await page.mouse.down();
	await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
	await page.mouse.up();
}

function cell(page: Page, frame: number) {
	return page.locator(`.timeline-row .timeline-cell[data-frame="${frame}"]`);
}

test('an animation is made, tweened, saved as an animation file, opened again and exported as a GIF', async ({ page }) => {
	page.on('dialog', (dialog) => void (dialog.type() === 'prompt' ? dialog.accept(dialog.defaultValue()) : dialog.accept()));
	await page.goto('/');
	// Without the browser's file pickers, saving downloads the file, as in browsers that have none.
	await page.evaluate(() => {
		Reflect.deleteProperty(window, 'showSaveFilePicker');
		Reflect.deleteProperty(window, 'showOpenFilePicker');
	});
	await expect(page.locator('.timeline-dock')).toBeHidden();

	await page.locator('#fileMenu > summary').click();
	await page.locator('#newAnimationButton').click();
	await expect(page.locator('#newImageTitle')).toHaveText('New animation');
	await page.locator('#newImageWidth').fill(String(Stage.width));
	await page.locator('#newImageHeight').fill(String(Stage.height));
	await page.locator('#newAnimationFps').fill(String(Stage.fps));
	await page.locator('#createImageButton').click();
	await expect(page.locator('.timeline-dock')).toBeVisible();
	await expect(page.locator('.timeline-row')).toHaveCount(1);
	// Floating toolbars stay above the timeline.
	const toolsBottom = await page.locator('[data-panel="tools"]').evaluate((panel) => panel.getBoundingClientRect().bottom);
	const timelineTop = await page.locator('.timeline-dock').evaluate((dock) => dock.getBoundingClientRect().top);
	expect(toolsBottom).toBeLessThanOrEqual(timelineTop);
	await page.locator('[data-panel]').evaluateAll((panels) => panels.forEach((panel) => ((panel as HTMLElement).style.display = 'none')));

	// Three steps, with nothing to know beforehand: draw, click a later frame, move the drawing.
	const guide = page.locator('.timeline-guide');
	await expect(guide).toContainText('Draw something');
	await page.keyboard.press('o');
	await drag(page, [10, 40], [50, 80]);
	await expect(cell(page, 0)).toHaveAttribute('data-kind', 'keyframe');
	await expect(guide).toContainText('click a later frame');
	await cell(page, Stage.fps - 1).click();
	await expect(guide).toContainText('The frames in between are made for you');
	await page.keyboard.press('v');
	// Dragged by its middle, where its pivot is: a plain drag moves the drawing, only Alt moves the pivot.
	await drag(page, [30, 60], [170, 60]);
	await expect(page.locator('.timeline-row .timeline-cell[data-tween="tweened"]')).toHaveCount(Stage.fps - 1);
	await expect(guide).toContainText('Press Play');
	await cell(page, 0).click();
	await expect(page.locator('.timeline-action[data-command="insertKeyframe"]')).toBeDisabled();

	const saving = page.waitForEvent('download');
	await page.keyboard.press('Control+s');
	const saved = await saving;
	expect(saved.suggestedFilename()).toBe('untitled.anim.json');
	const text = await readFile((await saved.path())!, 'utf8');
	const file = JSON.parse(text) as { format: string; stage: { fps: number; frames: number }; timeline: { layers: { keyframes: { frame: number }[] }[] } };
	expect(file.format).toBe('little-animation');
	expect(file.stage).toMatchObject({ fps: Stage.fps, frames: Stage.fps });
	expect(file.timeline.layers[0]!.keyframes.map(({ frame }) => frame)).toEqual([0, Stage.fps - 1]);

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await expect(page.locator('.timeline-dock')).toBeHidden();
	await page.locator('#fileInput').setInputFiles({ name: 'bounce.anim.json', mimeType: 'application/json', buffer: Buffer.from(text) });
	await expect(page.locator('.timeline-dock')).toBeVisible();
	await expect(page.locator('.timeline-row .timeline-cell[data-tween="tweened"]')).toHaveCount(Stage.fps - 1);

	await page.locator('#fileMenu > summary').click();
	await page.locator('#exportButton').click();
	await expect(page.locator('#exportImageFormat')).toHaveValue('image/gif');
	const exporting = page.waitForEvent('download');
	await page.locator('#confirmExportImageButton').click();
	const gif = await readFile((await (await exporting).path())!);
	expect(gif.subarray(0, GIF_SIGNATURE.length).toString()).toBe(GIF_SIGNATURE);
	const frames = await page.evaluate(async (base64) => {
		const decoder = new ImageDecoder({ data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)), type: 'image/gif' });
		await decoder.tracks.ready;
		return decoder.tracks.selectedTrack!.frameCount;
	}, gif.toString('base64'));
	expect(frames).toBe(Stage.fps);
});

test('a new image has no timeline', async ({ page }) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('image/png');
	await expect(page.locator('#newAnimationFps')).toBeHidden();
	await page.locator('#createImageButton').click();
	await expect(page.locator('#canvasWrap')).toBeVisible();
	await expect(page.locator('.timeline-dock')).toBeHidden();
});

test('in VS Code, an animation file opens with its timeline and saves as an animation file', async ({ page }) => {
	await openVsCodeWebview(page);
	await expect.poll(() => sentToHost(page, WebviewMessageType.Ready)).toHaveLength(1);
	const contents = [...(await readFile(FIXTURE))];
	await page.evaluate(
		({ bytes, openType }) => window.postMessage({ type: openType, fileName: 'motion-linear.anim.json', contents: new Uint8Array(bytes) }, '*'),
		{ bytes: contents, openType: HostMessageType.Open },
	);
	await expect(page.locator('.timeline-dock')).toBeVisible();
	await expect(page.locator('#dimensions')).toHaveText('200 × 100 px');
	await expect(page.locator('.timeline-row .timeline-cell[data-tween="tweened"]')).toHaveCount(10);

	await sendToWebview(page, { type: HostMessageType.Save, requestId: SAVE_REQUEST_ID });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	const written = JSON.parse(Buffer.from(write!.contents).toString('utf8')) as { format: string; stage: { width: number; frames: number } };
	expect(written.format).toBe('little-animation');
	expect(written.stage).toMatchObject({ width: 200, frames: 11 });
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: true });
	await expect.poll(() => sentToHost(page, WebviewMessageType.Saved)).toEqual([{ type: WebviewMessageType.Saved, requestId: SAVE_REQUEST_ID }]);
});

test('in VS Code, a new untitled animation file asks for a new animation', async ({ page }) => {
	await openVsCodeWebview(page);
	await expect.poll(() => sentToHost(page, WebviewMessageType.Ready)).toHaveLength(1);
	await sendToWebview(page, { type: HostMessageType.Create, fileName: 'Untitled.anim.json' });
	await expect(page.locator('#newImageDialog')).toBeVisible();
	await expect(page.locator('#newImageTitle')).toHaveText('New animation');
	await expect(page.locator('#newAnimationFps')).toBeVisible();
	await page.locator('#createImageButton').click();
	await expect(page.locator('.timeline-dock')).toBeVisible();
	await expect(page.locator('.timeline-row')).toHaveCount(1);
});
