import { describe, expect, it } from 'vitest';
import { AnnotationDocument } from './annotationDocument';
import { AnnotationObjectTypeId } from './annotationTypes';

describe('annotation clear history', () => {
	it('clears retained objects and selection through one undoable commit', () => {
		const annotations = new AnnotationDocument();
		annotations.add({
			id: 'step',
			type: AnnotationObjectTypeId.Step,
			at: { x: 20, y: 20 },
			value: 1,
			color: '#123456',
			size: 20,
		});

		annotations.clear();
		expect(annotations.state.objects).toHaveLength(0);
		expect(annotations.selected).toBeNull();
		expect(annotations.canUndo).toBe(true);

		annotations.undo();
		expect(annotations.state.objects).toHaveLength(1);
	});
});
