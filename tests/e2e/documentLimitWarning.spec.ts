import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const WARNING_OBJECT_COUNT = 501;
const MARKER_OBJECT_TYPE = 'step';

test('large documents warn without blocking and persist per-document suppression', async ({
	page,
}) => {
	await page.goto('/');
	await installWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageDocumentType').selectOption('project');
	await page.locator('#newImageName').fill('large-project');
	await page.locator('#createImageButton').click();
	await page.locator('#quickSaveButton').click();
	const blank = await savedProject(page);
	const largeProject = withMarkers(blank, WARNING_OBJECT_COUNT);

	await closeAndOpen(page, largeProject);
	const warning = page.locator('#editableObjectLimitDialog');
	await expect(warning).toBeVisible();
	await expect(warning).toContainText(`${WARNING_OBJECT_COUNT} editable objects`);
	await expect(page.locator('.annotation-canvas')).toBeVisible();
	await warning
		.locator('[data-limit-action="suppress"]')
		.click();
	await expect(warning).toBeHidden();

	await page.locator('#quickSaveButton').click();
	const suppressedProject = await savedProject(page, blank);
	await closeAndOpen(page, suppressedProject);
	await expect(warning).toBeHidden();
});

async function installWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'large-project.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(
							window as Window & { savedProjectSource?: string }
						).savedProjectSource = await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
}

function savedProject(page: Page, previous = ''): Promise<string> {
	return page
		.waitForFunction(
			(oldValue) => {
				const value = (window as Window & { savedProjectSource?: string })
					.savedProjectSource;
				return value && value !== oldValue ? value : undefined;
			},
			previous,
		)
		.then((handle) => handle.jsonValue());
}

function withMarkers(source: string, count: number): string {
	const project = JSON.parse(source) as {
		editableObjects: {
			state: { objects: unknown[]; nextStep: number };
			history: Array<{ objects: unknown[]; nextStep: number }>;
			historyIndex: number;
		};
	};
	const objects = Array.from({ length: count }, (_, index) => ({
		id: `marker-${index}`,
		type: MARKER_OBJECT_TYPE,
		at: { x: 10 + (index % 40) * 18, y: 10 + Math.floor(index / 40) * 18 },
		value: index + 1,
		color: '#0066ff',
		size: 12,
	}));
	const state = { objects, nextStep: count + 1 };
	project.editableObjects = {
		state,
		history: [structuredClone(state)],
		historyIndex: 0,
	};
	return JSON.stringify(project);
}

async function closeAndOpen(page: Page, source: string): Promise<void> {
	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'large-project.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
}
