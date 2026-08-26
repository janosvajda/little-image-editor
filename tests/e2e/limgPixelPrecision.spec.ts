import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const SHAPES = [
	'line',
	'arrow',
	'rectangle',
	'roundedRectangle',
	'ellipse',
	'triangle',
	'diamond',
	'star',
] as const;
const RECT_OBJECTS = ['box', 'highlight', 'blur', 'redact'] as const;

test('every editable object renders pixel-identically after save, reopen, resave, and reopen', async ({
	page,
}) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageDocumentType').selectOption('project');
	await page.locator('#newImageName').fill('pixel-precise-project');
	await page.locator('#createImageButton').click();
	await page.locator('#quickSaveButton').click();
	const blankSource = await savedProject(page);
	const populatedSource = populateEveryObject(blankSource);

	await closeAndOpen(page, populatedSource);
	const firstRasterHash = await canvasHash(page, '#canvas');
	const firstObjectHash = await canvasHash(page, '.annotation-canvas');
	expect(firstObjectHash).not.toBe(firstRasterHash);

	await page.locator('#quickSaveButton').click();
	const resavedSource = await savedProject(page, populatedSource);
	await closeAndOpen(page, resavedSource);

	expect(await canvasHash(page, '#canvas')).toBe(firstRasterHash);
	expect(await canvasHash(page, '.annotation-canvas')).toBe(firstObjectHash);
});

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'pixel-precise-project.limg',
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

function populateEveryObject(source: string): string {
	const project = JSON.parse(source) as {
		editableObjects: {
			state: { objects: unknown[]; nextStep: number };
			history: Array<{ objects: unknown[]; nextStep: number }>;
			historyIndex: number;
		};
	};
	const rect = (index: number) => ({
		x: 30 + (index % 5) * 130,
		y: 30 + Math.floor(index / 5) * 140,
		width: 90,
		height: 70,
	});
	const objects: unknown[] = [
		{
			id: 'annotation-arrow',
			type: 'arrow',
			from: { x: 20, y: 500 },
			to: { x: 150, y: 550 },
			color: '#ff0000',
			width: 4,
		},
		{
			id: 'annotation-step',
			type: 'step',
			at: { x: 220, y: 520 },
			value: 1,
			color: '#0066ff',
			size: 36,
		},
		{
			id: 'annotation-text',
			type: 'text',
			at: { x: 280, y: 500 },
			text: 'Editable text',
			color: '#222222',
			size: 24,
			rect: { x: 280, y: 500, width: 180, height: 50 },
		},
		...RECT_OBJECTS.map((type, index) => ({
			id: `annotation-${type}`,
			type,
			rect: rect(index),
			color: type === 'highlight' ? '#ffff00' : '#880000',
			width: 4,
			opacity: 0.45,
			blur: 8,
			rotation: index * 4,
		})),
		...SHAPES.map((shape, index) => ({
			id: `shape-${shape}`,
			type: 'shape',
			shape,
			rect: rect(index + RECT_OBJECTS.length),
			rotation: index * 3,
			color: '#008855',
			width: 5,
			opacity: 0.8,
			fill: index % 2 === 0,
		})),
	];
	const state = { objects, nextStep: 2 };
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
		name: 'pixel-precise-project.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
}

function canvasHash(page: Page, selector: string): Promise<string> {
	return page.locator(selector).evaluate(async (canvas: HTMLCanvasElement) => {
		const pixels = canvas
			.getContext('2d')!
			.getImageData(0, 0, canvas.width, canvas.height).data;
		const digest = await crypto.subtle.digest('SHA-256', pixels);
		return [...new Uint8Array(digest)]
			.map((value) => value.toString(16).padStart(2, '0'))
			.join('');
	});
}
