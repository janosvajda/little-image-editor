import { expect, test, type Page } from '@playwright/test';

const StrokeGesture = {
	from: { x: 220, y: 220 },
	to: { x: 520, y: 220 },
} as const;
const EXPECTED_OBJECT_COUNT = 1;

test('double-click selection keeps canvas, Layers, and delete on the same object', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await dragCanvas(page, StrokeGesture.from, StrokeGesture.to);

	await doubleClickCanvasPoint(page, {
		x: (StrokeGesture.from.x + StrokeGesture.to.x) / 2,
		y: StrokeGesture.from.y,
	});

	const objectRows = page.locator('.layer-object-row');
	await expect(objectRows).toHaveCount(EXPECTED_OBJECT_COUNT);
	const activeRow = page.locator('.layer-object-row.active');
	await expect(activeRow).toHaveCount(EXPECTED_OBJECT_COUNT);
	await expect(activeRow).toHaveAttribute('aria-selected', 'true');
	await activeRow
		.locator('.layer-delete')
		.evaluate((button: HTMLButtonElement) => button.click());
	await expect(objectRows).toHaveCount(0);
});

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
			for (const event of [
				{ type: 'pointerdown', point: start, buttons: 1 },
				{ type: 'pointermove', point: end, buttons: 1 },
				{ type: 'pointerup', point: end, buttons: 0 },
			])
				canvas.dispatchEvent(
					new PointerEvent(event.type, {
						bubbles: true,
						button: 0,
						buttons: event.buttons,
						pointerId: 81,
						clientX: event.point.x,
						clientY: event.point.y,
					}),
				);
		},
		{ from, to },
	);
}

async function doubleClickCanvasPoint(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate((overlay, canvasPoint) => {
		const canvas = overlay as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		const clientX = bounds.left + (canvasPoint.x * bounds.width) / canvas.width;
		const clientY = bounds.top + (canvasPoint.y * bounds.height) / canvas.height;
		for (let click = 0; click < 2; click += 1) {
			canvas.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					button: 0,
					buttons: 1,
					pointerId: 82,
					clientX,
					clientY,
				}),
			);
			canvas.dispatchEvent(
				new PointerEvent('pointerup', {
					bubbles: true,
					button: 0,
					buttons: 0,
					pointerId: 82,
					clientX,
					clientY,
				}),
			);
		}
		canvas.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				button: 0,
				clientX,
				clientY,
			}),
		);
	}, point);
}
