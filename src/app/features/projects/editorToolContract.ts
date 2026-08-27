import {
	PaintToolId,
	ShapeToolId,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import {
	AnnotationToolId,
	type AnnotationTool,
} from '../annotations/annotationTypes';
import {
	type ColorEffect,
	EffectId,
} from '../effects/imageFilterHelpers';

export const EditorToolImpact = {
	EditableObject: 'editable-object',
	DocumentOperation: 'document-operation',
} as const;
export type EditorToolImpact =
	(typeof EditorToolImpact)[keyof typeof EditorToolImpact];

export const EditableObjectKind = {
	Stroke: 'stroke',
	Shape: 'shape',
	Fill: 'fill',
	Annotation: 'annotation',
	Effect: 'effect',
	Adjustment: 'adjustment',
} as const;
export type EditableObjectKind =
	(typeof EditableObjectKind)[keyof typeof EditableObjectKind];

export const DocumentOperationKind = {
	Crop: 'crop',
	Resize: 'resize',
	Rotate: 'rotate',
	Flip: 'flip',
} as const;
export type DocumentOperationKind =
	(typeof DocumentOperationKind)[keyof typeof DocumentOperationKind];

export const AdjustmentId = {
	Brightness: 'brightness',
	Contrast: 'contrast',
	Saturation: 'saturation',
} as const;
export type AdjustmentId =
	(typeof AdjustmentId)[keyof typeof AdjustmentId];

export const TransformActionId = {
	Crop: 'crop',
	Resize: 'resize',
	RotateLeft: 'rotate-left',
	RotateRight: 'rotate-right',
	FlipHorizontal: 'flip-horizontal',
	FlipVertical: 'flip-vertical',
} as const;
export type TransformActionId =
	(typeof TransformActionId)[keyof typeof TransformActionId];

export type EffectToolId = ColorEffect | typeof EffectId.Sharpen;
export type ImageAffectingDrawingTool = Exclude<
	Tool,
	| typeof UtilityToolId.Select
	| typeof UtilityToolId.Picker
	| typeof UtilityToolId.Zoom
>;
export type ImageAffectingAnnotationTool = Exclude<
	AnnotationTool,
	typeof AnnotationToolId.Select
>;

export type ToolDocumentRegistration =
	| Readonly<{
			impact: typeof EditorToolImpact.EditableObject;
			objectKind: EditableObjectKind;
		}>
	| Readonly<{
			impact: typeof EditorToolImpact.DocumentOperation;
			operationKind: DocumentOperationKind;
		}>;

const editable = (
	objectKind: EditableObjectKind,
): ToolDocumentRegistration => ({
	impact: EditorToolImpact.EditableObject,
	objectKind,
});

const documentOperation = (
	operationKind: DocumentOperationKind,
): ToolDocumentRegistration => ({
	impact: EditorToolImpact.DocumentOperation,
	operationKind,
});

/**
 * Exhaustive compile-time boundary for every tool that changes the picture.
 * Navigation and inspection tools deliberately do not belong to a document.
 */
export const DRAWING_TOOL_DOCUMENT_CONTRACT = {
	[PaintToolId.Pencil]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Brush]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Marker]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Highlighter]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Calligraphy]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Spray]: editable(EditableObjectKind.Stroke),
	[PaintToolId.Eraser]: editable(EditableObjectKind.Stroke),
	[ShapeToolId.Line]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Arrow]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Rectangle]: editable(EditableObjectKind.Shape),
	[ShapeToolId.RoundedRectangle]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Ellipse]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Triangle]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Diamond]: editable(EditableObjectKind.Shape),
	[ShapeToolId.Star]: editable(EditableObjectKind.Shape),
	[UtilityToolId.Crop]: documentOperation(DocumentOperationKind.Crop),
	[UtilityToolId.Fill]: editable(EditableObjectKind.Fill),
} as const satisfies Record<
	ImageAffectingDrawingTool,
	ToolDocumentRegistration
>;

/** Exhaustive compile-time boundary for Capture & annotate tools. */
export const ANNOTATION_TOOL_DOCUMENT_CONTRACT = {
	[AnnotationToolId.Arrow]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Step]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Box]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Highlight]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Text]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Blur]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Redact]: editable(EditableObjectKind.Annotation),
	[AnnotationToolId.Crop]: documentOperation(DocumentOperationKind.Crop),
} as const satisfies Record<
	ImageAffectingAnnotationTool,
	ToolDocumentRegistration
>;

/** Exhaustive compile-time boundary for image effects. */
export const EFFECT_TOOL_DOCUMENT_CONTRACT = {
	[EffectId.Monochrome]: editable(EditableObjectKind.Effect),
	[EffectId.Sepia]: editable(EditableObjectKind.Effect),
	[EffectId.Invert]: editable(EditableObjectKind.Effect),
	[EffectId.Sharpen]: editable(EditableObjectKind.Effect),
} as const satisfies Record<EffectToolId, ToolDocumentRegistration>;

/** Exhaustive compile-time boundary for tone adjustments. */
export const ADJUSTMENT_DOCUMENT_CONTRACT = {
	[AdjustmentId.Brightness]: editable(EditableObjectKind.Adjustment),
	[AdjustmentId.Contrast]: editable(EditableObjectKind.Adjustment),
	[AdjustmentId.Saturation]: editable(EditableObjectKind.Adjustment),
} as const satisfies Record<AdjustmentId, ToolDocumentRegistration>;

/** Exhaustive compile-time boundary for document geometry operations. */
export const TRANSFORM_DOCUMENT_CONTRACT = {
	[TransformActionId.Crop]: documentOperation(DocumentOperationKind.Crop),
	[TransformActionId.Resize]: documentOperation(DocumentOperationKind.Resize),
	[TransformActionId.RotateLeft]: documentOperation(
		DocumentOperationKind.Rotate,
	),
	[TransformActionId.RotateRight]: documentOperation(
		DocumentOperationKind.Rotate,
	),
	[TransformActionId.FlipHorizontal]: documentOperation(
		DocumentOperationKind.Flip,
	),
	[TransformActionId.FlipVertical]: documentOperation(
		DocumentOperationKind.Flip,
	),
} as const satisfies Record<TransformActionId, ToolDocumentRegistration>;

export function isEditableToolRegistration(
	registration: ToolDocumentRegistration,
): registration is Extract<
	ToolDocumentRegistration,
	{ impact: typeof EditorToolImpact.EditableObject }
> {
	return registration.impact === EditorToolImpact.EditableObject;
}
