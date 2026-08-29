import { expect, test, type Page } from '@playwright/test';

const ProjectMimeType = 'application/vnd.little-image-editor.project+json';

test('painting across existing pixels stays in one paint layer until explicitly split', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(ProjectMimeType);
	await page.locator('#createImageButton').click();
	await chooseBrush(page);

	await dragCanvas(page, { x: 220, y: 220 }, { x: 420, y: 320 });
	await dragCanvas(page, { x: 280, y: 250 }, { x: 360, y: 290 });

	await page.locator('#toolbarPickerButton').click();
	const layersToggle = page.locator('[data-panel-toggle="layers"]');
	if (!(await layersToggle.isChecked())) await layersToggle.check();
	await expect(page.locator('[data-panel="layers"] .layer-object-row')).toHaveCount(
		1,
	);
	await page.getByRole('button', { name: /New paint layer/ }).click();
	await chooseBrush(page);
	await dragCanvas(page, { x: 460, y: 260 }, { x: 520, y: 340 });
	await expect(page.locator('[data-panel="layers"] .layer-object-row')).toHaveCount(
		2,
	);
});

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function dragCanvas(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, points) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			const screen = (point: Readonly<{ x: number; y: number }>) => ({
				x: bounds.left + (point.x * bounds.width) / canvas.width,
				y: bounds.top + (point.y * bounds.height) / canvas.height,
			});
			const start = screen(points.from);
			const end = screen(points.to);
			canvas.setPointerCapture = () => undefined;
			for (const [type, point, buttons] of [
				['pointerdown', start, 1],
				['pointermove', end, 1],
				['pointerup', end, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 73,
						clientX: point.x,
						clientY: point.y,
					}),
				);
		},
		{ from, to },
	);
}
