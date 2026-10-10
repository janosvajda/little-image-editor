import { expect, it } from 'vitest';
import { MEASUREMENT_UNITS } from '../../core/document/measurementUnits';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CanvasViewportController } from './canvasViewportController';

it('the ruler corner switches the rulers to the next unit and back around to the first', () => {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	const viewport = new CanvasViewportController(model);
	model.create({ name: 'measured', width: 200, height: 100, transparent: true, background: '#fff' });
	const corner = document.querySelector<HTMLElement>('.ruler-corner')!;
	for (const unit of [...MEASUREMENT_UNITS.slice(1), MEASUREMENT_UNITS[0]]) {
		corner.click();
		expect(viewport.unit).toBe(unit);
		expect(corner.textContent).toBe(unit);
	}
});
