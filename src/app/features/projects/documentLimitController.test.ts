import { describe, expect, it } from 'vitest';
import {
	DocumentLimitStateKey,
	EditorLimit,
	type DocumentPerformanceWarningState,
} from '../../core/document/editorLimits';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from '../annotations/annotationTypes';
import { DocumentLimitController } from './documentLimitController';

function objects(count: number): AnnotationObject[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `step-${index}`,
		type: AnnotationObjectTypeId.Step,
		at: { x: index, y: index },
		value: index,
		color: '#000000',
		size: 10,
	}));
}

describe('DocumentLimitController', () => {
	it('warns once per threshold crossing, never blocks editing, and persists suppression', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const editable = new AnnotationDocument();
		const limits = new DocumentLimitController(model, editable);
		model.create({
			name: 'large-document',
			width: 10,
			height: 10,
			transparent: true,
			background: '#ffffff',
		});

		editable.restore({
			objects: objects(EditorLimit.EditableObjectWarning + 1),
			nextStep: 1,
		});
		expect(limits.dialog.open).toBe(true);
		expect(editable.state.objects).toHaveLength(
			EditorLimit.EditableObjectWarning + 1,
		);
		limits.dialog
			.querySelector<HTMLButtonElement>('[data-limit-action="continue"]')!
			.click();
		expect(limits.dialog.open).toBe(false);

		editable.restore({
			objects: objects(EditorLimit.EditableObjectWarning),
			nextStep: 1,
		});
		editable.restore({
			objects: objects(EditorLimit.EditableObjectWarning + 1),
			nextStep: 1,
		});
		expect(limits.dialog.open).toBe(true);
		limits.dialog
			.querySelector<HTMLButtonElement>('[data-limit-action="suppress"]')!
			.click();
		expect(
			model.toolbarState<DocumentPerformanceWarningState>(
				DocumentLimitStateKey.PerformanceWarning,
			),
		).toEqual({ suppressEditableObjectWarning: true });

		editable.restore({
			objects: objects(EditorLimit.EditableObjectWarning),
			nextStep: 1,
		});
		editable.restore({
			objects: objects(EditorLimit.EditableObjectWarning + 1),
			nextStep: 1,
		});
		expect(limits.dialog.open).toBe(false);
	});
});
