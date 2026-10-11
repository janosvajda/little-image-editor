import { describe, expect, it } from 'vitest';
import { ColorPickerGuard } from './colorPickerGuard';

function press(target: Element): boolean {
	const click = new MouseEvent('click', { bubbles: true, cancelable: true });
	target.dispatchEvent(click);
	return click.defaultPrevented;
}

describe('a colour opens only from its swatch', () => {
	it('so a press on its word or its row, which closes an open picker, does not open it again', () => {
		document.body.innerHTML = '<label id="row"><span id="word">Line</span><input id="colour" type="color"></label><label id="size">Size <input type="range"></label>';
		new ColorPickerGuard();
		const swatch = document.querySelector<HTMLInputElement>('#colour')!;
		expect(press(document.querySelector('#word')!)).toBe(true);
		expect(press(document.querySelector('#row')!)).toBe(true);
		// The swatch itself still opens, and other labels still work as labels.
		expect(press(swatch)).toBe(false);
		expect(press(document.querySelector('#size')!)).toBe(false);
		expect(press(document.body)).toBe(false);
	});
});
