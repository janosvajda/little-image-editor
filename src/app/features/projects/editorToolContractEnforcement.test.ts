import { describe, expect, it } from 'vitest';
import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
} from '../../core/document/appTypes';
import { AnnotationToolId } from '../annotations/annotationTypes';
import { EffectId } from '../effects/imageFilterHelpers';
import {
	ADJUSTMENT_DOCUMENT_CONTRACT,
	ANNOTATION_TOOL_DOCUMENT_CONTRACT,
	DRAWING_TOOL_DOCUMENT_CONTRACT,
	EFFECT_TOOL_DOCUMENT_CONTRACT,
	EditableObjectKind,
	EditorToolImpact,
	TRANSFORM_DOCUMENT_CONTRACT,
} from './editorToolContract';

describe('editor tool document enforcement contract', () => {
	it('requires every paint, shape, fill, annotation, effect, and adjustment to be editable', () => {
		const editableRegistrations = [
			...Object.values(PaintToolId).map(
				(tool) => DRAWING_TOOL_DOCUMENT_CONTRACT[tool],
			),
			...Object.values(ShapeToolId).map(
				(tool) => DRAWING_TOOL_DOCUMENT_CONTRACT[tool],
			),
			DRAWING_TOOL_DOCUMENT_CONTRACT[UtilityToolId.Fill],
			...Object.values(AnnotationToolId)
				.filter(
					(tool) =>
						tool !== AnnotationToolId.Select &&
						tool !== AnnotationToolId.Crop,
				)
				.map((tool) => ANNOTATION_TOOL_DOCUMENT_CONTRACT[tool]),
			...Object.values(EFFECT_TOOL_DOCUMENT_CONTRACT),
			...Object.values(ADJUSTMENT_DOCUMENT_CONTRACT),
		];

		expect(editableRegistrations).not.toHaveLength(0);
		for (const registration of editableRegistrations)
			expect(registration.impact).toBe(EditorToolImpact.EditableObject);
	});

	it('excludes navigation from the document and classifies geometry changes as operations', () => {
		for (const tool of [
			UtilityToolId.Select,
			UtilityToolId.Picker,
			UtilityToolId.Zoom,
		] as const)
			expect(DRAWING_TOOL_DOCUMENT_CONTRACT).not.toHaveProperty(tool);

		expect(DRAWING_TOOL_DOCUMENT_CONTRACT[UtilityToolId.Crop].impact).toBe(
			EditorToolImpact.DocumentOperation,
		);
		for (const registration of Object.values(TRANSFORM_DOCUMENT_CONTRACT))
			expect(registration.impact).toBe(
				EditorToolImpact.DocumentOperation,
			);
	});

	it('assigns semantic object kinds instead of accepting raster-history as compatibility', () => {
		expect(DRAWING_TOOL_DOCUMENT_CONTRACT[PaintToolId.Brush]).toEqual({
			impact: EditorToolImpact.EditableObject,
			objectKind: EditableObjectKind.Stroke,
		});
		expect(DRAWING_TOOL_DOCUMENT_CONTRACT[UtilityToolId.Fill]).toEqual({
			impact: EditorToolImpact.EditableObject,
			objectKind: EditableObjectKind.Fill,
		});
		expect(EFFECT_TOOL_DOCUMENT_CONTRACT[EffectId.Sharpen]).toEqual({
			impact: EditorToolImpact.EditableObject,
			objectKind: EditableObjectKind.Effect,
		});
	});
});
