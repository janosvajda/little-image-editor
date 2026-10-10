import { expect, type Locator, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { type HostWindow, openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

/** About the size of an editor tab beside VS Code's sidebar. */
const EDITOR_TAB = { width: 980, height: 640 } as const;
const SCREENSHOT_DIRECTORY = 'test-results/docked-layout';
/** Larger than the tab, so it opens zoomed out to fit. */
const IMAGE = { width: 1600, height: 1000 } as const;
const CENTRE_TOLERANCE = 2;

test.use({ viewport: EDITOR_TAB });

async function box(locator: Locator) {
	return (await locator.boundingBox())!;
}

test('in VS Code the image fills the tab, tool settings sit in the top row and toolbars open from icons', async ({ page }) => {
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'diagram.png', IMAGE, ColorPalette.Azure);
	await expect(page.locator('html')).toHaveAttribute('data-workspace-layout', 'docked');

	// VS Code opens and saves the file, so the editor's own file buttons are left out.
	for (const id of ['#quickNewButton', '#quickOpenButton', '#quickSaveButton', '#quickCloseImageButton'])
		await expect(page.locator(id)).toBeHidden();
	await expect(page.locator('.topbar .dock-options-bar #sizeInput')).toBeVisible();
	await expect(page.locator('#statusBar #zoomSelect')).toBeVisible();

	const strip = page.locator('.dock-tool-strip');
	const workspace = page.locator('.workspace');
	const sidePanel = page.locator('.dock-side-panel');
	const rail = page.locator('.dock-rail');
	await expect(sidePanel).toBeHidden();
	const [stripBox, fullWorkspace, railBox] = await Promise.all([box(strip), box(workspace), box(rail)]);
	expect(fullWorkspace.x).toBeCloseTo(stripBox.x + stripBox.width, 0);
	expect(fullWorkspace.x + fullWorkspace.width).toBeCloseTo(railBox.x, 0);

	// The whole image is in view and in the middle of the canvas area.
	await expect.poll(() => page.locator('#zoomSelect').inputValue()).not.toBe('100');
	const [image, area] = await Promise.all([box(page.locator('.canvas-viewport')), box(page.locator('#canvasWrap'))]);
	expect(image.width).toBeLessThanOrEqual(area.width);
	expect(image.height).toBeLessThanOrEqual(area.height);
	const centre = (part: { x: number; y: number; width: number; height: number }) => ({
		x: part.x + part.width / 2,
		y: part.y + part.height / 2,
	});
	expect(Math.abs(centre(image).x - centre(area).x)).toBeLessThanOrEqual(CENTRE_TOLERANCE);
	expect(Math.abs(centre(image).y - centre(area).y)).toBeLessThanOrEqual(CENTRE_TOLERANCE);
	await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/canvas.png` });

	const layersIcon = rail.getByRole('button', { name: 'Layers & Objects' });
	await layersIcon.click();
	await expect(page.locator('[data-panel="layers"]')).toBeVisible();
	const [narrowWorkspace, panelBox] = await Promise.all([box(workspace), box(sidePanel)]);
	expect(narrowWorkspace.width).toBeLessThan(fullWorkspace.width);
	expect(narrowWorkspace.x + narrowWorkspace.width).toBeLessThanOrEqual(panelBox.x);
	expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(railBox.x + 1);
	await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/layers.png` });

	// The open toolbar is handed to VS Code to remember; a second click hides it again.
	const stored = await page.evaluate(
		(type) => (window as unknown as HostWindow).sentToHost.filter((message) => message.type === type),
		WebviewMessageType.StorePreference,
	);
	expect(stored.at(-1)).toEqual({ type: WebviewMessageType.StorePreference, key: 'little-editor.docked-panel', value: 'layers' });
	await layersIcon.click();
	await expect(sidePanel).toBeHidden();
	expect((await box(workspace)).width).toBeCloseTo(fullWorkspace.width, 0);
});
