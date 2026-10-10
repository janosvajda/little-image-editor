import { expect, it } from 'vitest';
import { acceptsTyping } from './domHelpers';

function input(type: string): HTMLInputElement {
	const field = document.createElement('input');
	field.type = type;
	return field;
}

it('treats text fields as typing, and sliders, check boxes and colour swatches as places where shortcuts still work', () => {
	for (const typing of [input('text'), input('number'), document.createElement('textarea'), document.createElement('select')])
		expect(acceptsTyping(typing)).toBe(true);
	for (const control of [input('range'), input('checkbox'), input('color'), document.createElement('button')])
		expect(acceptsTyping(control)).toBe(false);
	expect(acceptsTyping(null)).toBe(false);
});
