import { expect, test, type Page } from '@playwright/test';

const PerformanceFixture = {
	StrokeCount: 5,
	PointsPerStroke: 200,
	FrameInterval: 5,
	MaximumVectorSegments: 2_000,
	MaximumDrawingDurationMs: 4_000,
} as const;

test('five complex strokes draw incrementally without rebuilding previous strokes', async ({
	page,
}) => {
	await page.goto('/');
	await createImage(page);
	await chooseBrush(page);

	const result = await page.locator('#overlay').evaluate(
		async (overlay, fixture) => {
			const canvas = overlay as HTMLCanvasElement;
			canvas.setPointerCapture = () => undefined;
			const contextPrototype = CanvasRenderingContext2D.prototype;
			const originalLineTo = contextPrototype.lineTo;
			let lineSegments = 0;
			contextPrototype.lineTo = function (x: number, y: number): void {
				lineSegments += 1;
				originalLineTo.call(this, x, y);
			};
			const nextFrame = () =>
				new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const dispatch = (
				type: string,
				x: number,
				y: number,
				pointerId: number,
			) =>
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons: type === 'pointerup' ? 0 : 1,
						pointerId,
						clientX: x,
						clientY: y,
					}),
				);
			const startedAt = performance.now();
			try {
				for (let stroke = 0; stroke < fixture.StrokeCount; stroke += 1) {
					const pointerId = stroke + 1;
					const startX = 100 + stroke * 110;
					const startY = 140 + (stroke % 2) * 180;
					dispatch('pointerdown', startX, startY, pointerId);
					for (let point = 1; point <= fixture.PointsPerStroke; point += 1) {
						dispatch(
							'pointermove',
							startX + (point % 100),
							startY + Math.sin(point / 5) * 70,
							pointerId,
						);
						if (point % fixture.FrameInterval === 0) await nextFrame();
					}
					dispatch('pointerup', startX + 100, startY, pointerId);
					await nextFrame();
				}
				return {
					duration: performance.now() - startedAt,
					lineSegments,
				};
			} finally {
				contextPrototype.lineTo = originalLineTo;
			}
		},
		PerformanceFixture,
	);

	expect(result.lineSegments).toBeLessThan(
		PerformanceFixture.MaximumVectorSegments,
	);
	expect(result.duration).toBeLessThan(
		PerformanceFixture.MaximumDrawingDurationMs,
	);
});

async function createImage(page: Page): Promise<void> {
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageName').fill('complex-stroke-performance');
	await page.locator('#createImageButton').click();
}

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}
