import { expect, test, type Page } from '@playwright/test';

const Gesture = {
	Start: { x: 180, y: 180 },
	End: { x: 360, y: 220 },
	Move: { x: 80, y: 60 },
} as const;

test('paint-mode double-click does not displace a moved stroke', async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await installProjectWriter(page);
	await createProject(page);
	await chooseBrush(page);
	await drag(page, Gesture.Start, Gesture.End);
	await page.locator('[data-panel="tools"] [data-tool="select"]').click();
	await drag(page, midpoint(Gesture.Start, Gesture.End), {
		x: midpoint(Gesture.Start, Gesture.End).x + Gesture.Move.x,
		y: midpoint(Gesture.Start, Gesture.End).y + Gesture.Move.y,
	});
	const before = await saveStroke(page);

	const movedEndpoint = {
		x: Gesture.End.x + Gesture.Move.x,
		y: Gesture.End.y + Gesture.Move.y,
	};
	await doubleClickCanvas(page, movedEndpoint);
	const after = await saveStroke(page);

	expect(after.objectCount).toBe(1);
	expect(after.stroke).toEqual(before.stroke);
	await expect(page.locator('[data-panel="layers"] .layer-object-row')).toHaveCount(
		1,
	);
});

async function createProject(page: Page): Promise<void> {
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('moved-double-click');
	await page.locator('#createImageButton').click();
}

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function doubleClickCanvas(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, canvasPoint) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			canvas.setPointerCapture = () => undefined;
			const clientPoint = (canvasPoint: Readonly<{ x: number; y: number }>) => ({
				x: bounds.left + (canvasPoint.x * bounds.width) / canvas.width,
				y: bounds.top + (canvasPoint.y * bounds.height) / canvas.height,
			});
			const point = clientPoint(canvasPoint);
			canvas.dispatchEvent(
				new MouseEvent('dblclick', {
					bubbles: true,
					button: 0,
					clientX: point.x,
					clientY: point.y,
				}),
			);
		},
		point,
	);
}

async function drag(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, gesture) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			canvas.setPointerCapture = () => undefined;
			for (const [type, point, buttons] of [
				['pointerdown', gesture.from, 1],
				['pointermove', gesture.to, 1],
				['pointerup', gesture.to, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						clientX: bounds.left + (point.x * bounds.width) / canvas.width,
						clientY: bounds.top + (point.y * bounds.height) / canvas.height,
						pointerId: 130,
					}),
				);
		},
		{ from, to },
	);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'moved-double-click.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(window as Window & { savedProject?: string }).savedProject =
							await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
}

async function saveStroke(page: Page): Promise<{
	readonly objectCount: number;
	readonly stroke: unknown;
}> {
	await page.locator('#quickSaveButton').click();
	const source = await page
		.waitForFunction(
			() => (window as Window & { savedProject?: string }).savedProject,
		)
		.then((handle) => handle.jsonValue());
	const project = JSON.parse(source) as {
		editableObjects: { state: { objects: readonly unknown[] } };
	};
	return {
		objectCount: project.editableObjects.state.objects.length,
		stroke: project.editableObjects.state.objects[0],
	};
}

function midpoint(
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): { x: number; y: number } {
	return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}
