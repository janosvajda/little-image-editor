import { expect, test, type Page } from '@playwright/test';

const Gesture = {
	Start: { x: 160, y: 160 },
	End: { x: 360, y: 220 },
	MoveBy: { x: 80, y: 60 },
} as const;

test('Layers Edit activates Select and moves the chosen retained object', async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('layer-edit-selection');
	await page.locator('#createImageButton').click();
	await chooseBrush(page);
	await drag(page, Gesture.Start, Gesture.End);
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	const edit = page
		.locator('[data-panel="layers"] .layer-object-row')
		.getByRole('button', { name: /Edit Paint layer/ });
	await edit.click();
	await expect(page.locator('[data-tool="select"]')).toHaveClass(/active/);

	const before = {
		x: Gesture.Start.x,
		y: Gesture.Start.y,
		width: Gesture.End.x - Gesture.Start.x,
		height: Gesture.End.y - Gesture.Start.y,
	};
	const center = {
		x: before.x + before.width / 2,
		y: before.y + before.height / 2,
	};
	await drag(page, center, {
		x: center.x + Gesture.MoveBy.x,
		y: center.y + Gesture.MoveBy.y,
	});
	await page.locator('#quickSaveButton').click();
	const after = await savedStrokeRect(page);
	expect(after.x).toBeGreaterThan(before.x + Gesture.MoveBy.x / 2);
	expect(after.y).toBeGreaterThan(before.y + Gesture.MoveBy.y / 2);
});

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'layer-edit-selection.limg',
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

async function savedStrokeRect(
	page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
	const source = await page
		.waitForFunction(
			() => (window as Window & { savedProject?: string }).savedProject,
		)
		.then((handle) => handle.jsonValue());
	const project = JSON.parse(source) as {
		editableObjects: {
			state: {
				objects: Array<{
					type: string;
					rect: { x: number; y: number; width: number; height: number };
				}>;
			};
		};
	};
	return project.editableObjects.state.objects.find(
		(object) => object.type === 'stroke',
	)!.rect;
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
						pointerId: 97,
						clientX: bounds.left + (point.x * bounds.width) / canvas.width,
						clientY: bounds.top + (point.y * bounds.height) / canvas.height,
					}),
				);
		},
		{ from, to },
	);
}
