import { expect, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { selectPageRegion } from '../../src/app/features/capture/browserPageCapture';

test('palette colours reach every theme, HTML default and standalone cursor', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('#startupSplash')).toHaveCount(0);
	const themes = {
		dark: { background: ColorPalette.Midnight, text: ColorPalette.GhostWhite },
		light: { background: ColorPalette.Cloud, text: ColorPalette.Ink },
		contrast: { background: ColorPalette.Black, text: ColorPalette.White },
	} as const;
	for (const [theme, colors] of Object.entries(themes)) {
		const actual = await page.evaluate(({ themeName, expected }) => {
			document.documentElement.dataset.theme = themeName;
			const css = getComputedStyle(document.body);
			const normalize = (color: string) => {
				const style = document.createElement('span').style;
				style.color = color;
				return style.color;
			};
			return { background: css.backgroundColor, text: css.color, expectedBackground: normalize(expected.background), expectedText: normalize(expected.text) };
		}, { themeName: theme, expected: colors });
		expect(actual.background).toBe(actual.expectedBackground);
		expect(actual.text).toBe(actual.expectedText);
	}
	await expect(page.locator('#newImageColor')).toHaveValue(ColorPalette.White);
	const response = await page.request.get('/assets/cursors/fillCursor.svg');
	expect(response.ok()).toBe(true);
	const cursor = await response.text();
	expect(cursor).not.toContain('{{ColorPalette.');
	expect(cursor).toContain(`fill="${ColorPalette.White}"`);
	expect(cursor).toContain(`stroke="${ColorPalette.MidnightBlue}"`);
	const imageLoaded = await page.evaluate(async () => {
		const image = new Image();
		image.src = '/assets/cursors/fillCursor.svg';
		await image.decode();
		return image.naturalWidth > 0;
	});
	expect(imageLoaded).toBe(true);
});

test('the injected region selector uses the supplied palette without module bindings', async ({ page }) => {
	await page.goto('/');
	const region = page.evaluate(selectPageRegion, ColorPalette);
	const instruction = page.getByText('Drag to select an area · Esc to cancel', { exact: true });
	await expect(instruction).toBeVisible();
	const appearance = await instruction.evaluate((element, palette) => {
		const overlay = element.parentElement!;
		const selection = overlay.firstElementChild as HTMLElement;
		const normalize = (color: string) => {
			const style = document.createElement('span').style;
			style.color = color;
			return style.color;
		};
		return {
			surface: getComputedStyle(element).backgroundColor,
			shade: getComputedStyle(overlay).backgroundColor,
			border: selection.style.borderColor,
			expectedSurface: normalize(palette.NavyCharcoal),
			expectedShade: normalize(palette.Black28Percent),
			expectedBorder: normalize(palette.White),
		};
	}, ColorPalette);
	expect(appearance.surface).toBe(appearance.expectedSurface);
	expect(appearance.shade).toBe(appearance.expectedShade);
	expect(appearance.border).toBe(appearance.expectedBorder);
	await page.keyboard.press('Escape');
	expect(await region).toBeNull();
	await expect(instruction).toHaveCount(0);
});
