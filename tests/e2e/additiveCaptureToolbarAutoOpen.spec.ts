import { expect, type Locator, test } from '@playwright/test';
import { seedBrowserCapture } from './support/browserCapture';
import { QA_REPORTING_TITLE } from '../../src/app/features/annotations/bugReportMetadata';

const LAYOUT_STORAGE_KEY = 'little-editor.panel-layout.v2';
const POSITION_TOLERANCE = 2;
const PREFERRED_ANNOTATION_POSITION = { x: 40, y: 0 } as const;
const TOOLS_POSITION = { x: 40, y: 0 } as const;
const EFFECTS_POSITION = { x: 900, y: 0 } as const;

interface PanelPosition {
	readonly x: number;
	readonly y: number;
}

function expectPositionNear(
	actual: PanelPosition,
	expected: PanelPosition,
): void {
	expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(
		POSITION_TOLERANCE,
	);
	expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(
		POSITION_TOLERANCE,
	);
}

test('Capture & annotate additively opens with collision-safe preferred positioning', async ({
	page,
}) => {
	await page.goto('/');
	await page.evaluate(
		({ storageKey, annotationPosition, toolsPosition, effectsPosition }) => {
			const state = (
				position: Readonly<{ x: number; y: number }>,
				visible: boolean,
			) => ({ ...position, visible, collapsed: false, positioned: true });
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					annotations: state(annotationPosition, false),
					tools: state(toolsPosition, true),
					effects: state(effectsPosition, true),
				}),
			);
		},
		{
			storageKey: LAYOUT_STORAGE_KEY,
			annotationPosition: PREFERRED_ANNOTATION_POSITION,
			toolsPosition: TOOLS_POSITION,
			effectsPosition: EFFECTS_POSITION,
		},
	);
	await seedBrowserCapture(page, 'additive-capture');
	await page.goto('/?capture=additive-capture&mode=annotate');

	const annotations = page.locator('[data-panel="annotations"]');
	const tools = page.locator('[data-panel="tools"]');
	const effects = page.locator('[data-panel="effects"]');
	await expect(annotations).toBeVisible();
	await expect(tools).toBeVisible();
	await expect(effects).toBeVisible();
	expectPositionNear(await positionOf(tools), TOOLS_POSITION);
	expectPositionNear(await positionOf(effects), EFFECTS_POSITION);
	expect(await positionOf(annotations)).not.toEqual(
		PREFERRED_ANNOTATION_POSITION,
	);

	await annotations
		.getByRole('button', { name: `Close ${QA_REPORTING_TITLE}` })
		.click();
	await tools.getByRole('button', { name: 'Close Tools' }).click();
	await seedBrowserCapture(page, 'preferred-position-capture');
	await page.goto('/?capture=preferred-position-capture&mode=annotate');

	await expect(annotations).toBeVisible();
	await expect(tools).toBeHidden();
	await expect(effects).toBeVisible();
	expectPositionNear(
		await positionOf(annotations),
		PREFERRED_ANNOTATION_POSITION,
	);
});

function positionOf(locator: Locator): Promise<PanelPosition> {
	return locator.evaluate((panel) => ({
		x: (panel as HTMLElement).offsetLeft,
		y: (panel as HTMLElement).offsetTop,
	}));
}
