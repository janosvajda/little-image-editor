import { expect, test, type Page } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import type { CaptureSourceMetadata } from '../../src/app/core/document/browserCapture';
import { ImageMimeType, ShapeToolId } from '../../src/app/core/document/appTypes';
import { CAPTURE_METADATA_KEY } from '../../src/app/features/capture/browserCaptureImporter';
import { seedBrowserCapture } from './support/browserCapture';
import { mouseCanvasDrag, installTestProjectWriter, restoreTestProject, saveTestProject } from './support/editorWorkflow';

const Source: CaptureSourceMetadata = { url: 'https://application.example/checkout?mode=test', capturedAt: '2026-10-10T10:00:00Z', userAgent: 'QA browser / OS', viewport: { width: 80, height: 80 } };
const Issue = { title: 'Checkout fails', ticket: 'https://tracker.example/browse/QA-123', steps: '1. Open checkout\n2. Submit the order', expected: 'The order completes.\nA confirmation appears.', actual: 'The request fails.' } as const;
const Panel = '[data-panel="annotations"]';

interface ClipboardTestWindow extends Window {
	qaClipboardText?: string;
	qaClipboardPixel?: number[];
}

test.use({ viewport: { width: 1600, height: 1050 } });
test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await seedBrowserCapture(page, 'qa-report', Source);
	await page.goto('/?capture=qa-report&mode=annotate');
	await expect(page.locator(`${Panel} .panel-header > span`)).toHaveText('QA Reporting');
	await expect(page.locator('#canvasWrap')).toBeVisible();
	await installTestProjectWriter(page);
	await installClipboard(page);
});

test('shows a larger QA form, automatic source metadata and Markdown copy feedback', async ({ page }) => {
	const panel = page.locator(Panel);
	await expect(panel.locator('input[type="checkbox"]')).toHaveCount(0);
	await expect(panel.getByLabel('Source page', { exact: true })).toHaveText(Source.url);
	expect((await panel.boundingBox())!.width).toBeGreaterThan(400);
	await fillIssue(page);
	const report = panel.getByLabel('Editable Markdown report');
	const markdown = await report.inputValue();
	expect(markdown).toContain(`# ${Issue.title}\n`);
	expect(markdown).toContain(`Issue ticket: <${Issue.ticket}>`);
	expect(markdown).toContain(`## Steps to reproduce\n\n${Issue.steps}`);
	expect(markdown).toContain(`## Expected behaviour\n\n${Issue.expected}`);
	expect(markdown).toContain(`- Source page: <${Source.url}>`);
	expect(markdown).toContain(`- Browser / OS (user agent): ${Source.userAgent}`);
	expect(markdown).not.toContain(page.url());
	await panel.getByRole('button', { name: 'Copy report', exact: true }).click();
	await expect(panel.locator('.annotation-feedback')).toHaveText('Report copied as Markdown.');
	expect(await page.evaluate(() => (window as ClipboardTestWindow).qaClipboardText)).toBe(markdown);
	await report.scrollIntoViewIfNeeded();
	await page.screenshot({ path: '/tmp/little-image-editor-qa-reporting-desktop.png' });
});

test('saves every issue field, capture source and manual Markdown with .limg', async ({ page }) => {
	await fillIssue(page);
	const report = page.getByLabel('Editable Markdown report');
	const custom = `${await report.inputValue()}\n## Notes\nInvestigate the timeout.\n`;
	await report.fill(custom);
	const project = await saveTestProject(page);
	expect(project.document.toolbarStates[CAPTURE_METADATA_KEY]).toEqual(Source);
	await page.reload();
	await restoreTestProject(page, project);
	await expect(page.locator('#annotationIssueTitle')).toHaveValue(Issue.title);
	await expect(page.locator('#annotationTicketUrl')).toHaveValue(Issue.ticket);
	await expect(page.locator('#annotationSteps')).toHaveValue(Issue.steps);
	await expect(page.locator('#annotationExpected')).toHaveValue(Issue.expected);
	await expect(page.locator('#annotationActual')).toHaveValue(Issue.actual);
	await expect(report).toHaveValue(custom);
	await page.locator('#annotationActual').fill('Updated observation');
	await expect(report).toHaveValue(/## Actual behaviour\n\nUpdated observation/);
});

test('draws through the shared tool system and copies the annotated composited screenshot', async ({ page }) => {
	await page.locator(`${Panel} [data-tool="${ShapeToolId.Rectangle}"]`).click();
	await expect(page.locator('[data-panel="tools"] .palette-group-button.active')).toHaveAttribute('aria-label', 'Shape tools: Rectangle');
	const qaBounds = (await page.locator(Panel).boundingBox())!;
	const toolsBounds = (await page.locator('[data-panel="tools"]').boundingBox())!;
	expect(qaBounds.x >= toolsBounds.x + toolsBounds.width || toolsBounds.x >= qaBounds.x + qaBounds.width || qaBounds.y >= toolsBounds.y + toolsBounds.height || toolsBounds.y >= qaBounds.y + qaBounds.height, JSON.stringify({ qaBounds, toolsBounds, workspace: await page.locator('.workspace').evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth })) })).toBe(true);
	await page.locator('#colorInput').fill(ColorPalette.Black);
	await page.locator('#fillInput').check();
	await page.locator('#focusButton').click();
	await expect(page.locator('body')).toHaveClass(/focus-mode/);
	await mouseCanvasDrag(page, { x: 20, y: 20 }, { x: 55, y: 55 });
	await page.locator('#exitFocusButton').click();
	await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
	const project = await saveTestProject(page);
	expect(project.editableObjects.state.layers).toHaveLength(1);
	expect(project.editableObjects.state.objects).toHaveLength(1);
	await page.locator(Panel).getByRole('button', { name: 'Copy annotated screenshot', exact: true }).click();
	await expect(page.locator(`${Panel} .annotation-feedback`)).toHaveText('Annotated screenshot copied.');
	expect(await page.evaluate(() => (window as ClipboardTestWindow).qaClipboardPixel)).toEqual([0, 0, 0, 255]);
});

test('shows clipboard failures and rejects invalid ticket links', async ({ page }) => {
	await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
	await page.locator(Panel).getByRole('button', { name: 'Copy report', exact: true }).click();
	await expect(page.locator(`${Panel} .annotation-feedback.error`)).toHaveText('Could not copy the report. Check clipboard permission.');
	await page.locator('#annotationTicketUrl').fill('invalid-ticket');
	await page.locator(Panel).getByRole('button', { name: 'Copy report', exact: true }).click();
	await expect(page.locator(`${Panel} .annotation-feedback.error`)).toHaveText('Enter a valid issue ticket URL, or leave it empty.');
});

test('keeps fields and copy actions reachable on a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await fillIssue(page);
	const panel = page.locator(Panel);
	const bounds = (await panel.boundingBox())!;
	expect(bounds.width).toBeGreaterThan(300);
	expect(bounds.x).toBeGreaterThanOrEqual(0);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
	await panel.getByRole('button', { name: 'Copy report', exact: true }).click();
	await expect(panel.locator('.annotation-feedback')).toHaveText('Report copied as Markdown.');
	await page.screenshot({ path: '/tmp/little-image-editor-qa-reporting-mobile.png' });
});

async function fillIssue(page: Page): Promise<void> {
	await page.locator('#annotationIssueTitle').fill(Issue.title);
	await page.locator('#annotationTicketUrl').fill(Issue.ticket);
	await page.locator('#annotationSteps').fill(Issue.steps);
	await page.locator('#annotationExpected').fill(Issue.expected);
	await page.locator('#annotationActual').fill(Issue.actual);
}

async function installClipboard(page: Page): Promise<void> {
	await page.evaluate((mimeType) => {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
			writeText: async (text: string) => { (window as ClipboardTestWindow).qaClipboardText = text; },
			write: async (items: ClipboardItem[]) => {
				const image = await createImageBitmap(await items[0]!.getType(mimeType));
				const canvas = document.createElement('canvas');
				canvas.width = image.width; canvas.height = image.height;
				const context = canvas.getContext('2d')!;
				context.drawImage(image, 0, 0);
				(window as ClipboardTestWindow).qaClipboardPixel = Array.from(context.getImageData(35, 35, 1, 1).data);
				image.close();
			},
		} });
	}, ImageMimeType.Png);
}
