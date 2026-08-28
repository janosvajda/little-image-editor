import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('layer lock presentation', () => {
	it('shows a persistent and accessible locked state', () => {
		const objects = new AnnotationDocument();
		objects.add({
			id: 'lockable-box',
			type: AnnotationObjectTypeId.Box,
			rect: { x: 2, y: 2, width: 10, height: 10 },
			color: '#000000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const controller = new LayersController(
			new CanvasDocument(
				document.querySelector<HTMLCanvasElement>('#canvas')!,
				document.querySelector<HTMLCanvasElement>('#overlay')!,
			),
			objects,
		);
		const row = () =>
			controller.panel.list.querySelector<HTMLElement>(
				'[data-object-id="lockable-box"]',
			)!;

		row().querySelector<HTMLButtonElement>('.layer-lock')!.click();

		expect(row().classList).toContain('locked');
		const lockedButton = row().querySelector<HTMLButtonElement>('.layer-lock')!;
		expect(lockedButton.textContent).toBe('🔒');
		expect(lockedButton.getAttribute('aria-pressed')).toBe('true');
		expect(lockedButton.getAttribute('aria-label')).toContain('Unlock');

		lockedButton.click();
		expect(row().classList).not.toContain('locked');
		expect(
			row().querySelector<HTMLButtonElement>('.layer-lock')!.textContent,
		).toBe('🔓');
	});
});
