import type { CropRect, Point, ShapeTool } from '../../core/document/appTypes';

export const AnnotationToolId = {
	Select: 'select',
	Arrow: 'arrow',
	Step: 'step',
	Box: 'box',
	Highlight: 'highlight',
	Text: 'text',
	Blur: 'blur',
	Redact: 'redact',
	Crop: 'crop',
} as const;
export type AnnotationTool =
	(typeof AnnotationToolId)[keyof typeof AnnotationToolId];
export type AnnotationObjectType = Exclude<
	AnnotationTool,
	typeof AnnotationToolId.Select | typeof AnnotationToolId.Crop
>;

export const AnnotationObjectTypeId = {
	Arrow: AnnotationToolId.Arrow,
	Step: AnnotationToolId.Step,
	Box: AnnotationToolId.Box,
	Highlight: AnnotationToolId.Highlight,
	Text: AnnotationToolId.Text,
	Blur: AnnotationToolId.Blur,
	Redact: AnnotationToolId.Redact,
	Shape: 'shape',
} as const;

interface AnnotationBase {
	id: string;
	type: AnnotationObjectType;
	rotation?: number;
}

export interface ArrowAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Arrow;
	from: Point;
	to: Point;
	color: string;
	width: number;
}

export interface RectAnnotation extends AnnotationBase {
	type:
		| typeof AnnotationObjectTypeId.Box
		| typeof AnnotationObjectTypeId.Highlight
		| typeof AnnotationObjectTypeId.Blur
		| typeof AnnotationObjectTypeId.Redact;
	rect: CropRect;
	color: string;
	width: number;
	opacity: number;
	blur: number;
	rotation?: number;
}

export interface ShapeAnnotation {
	id: string;
	type: typeof AnnotationObjectTypeId.Shape;
	shape: ShapeTool;
	rect: CropRect;
	rotation?: number;
	color: string;
	width: number;
	opacity: number;
	fill: boolean;
}

export interface StepAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Step;
	at: Point;
	value: number;
	color: string;
	size: number;
}

export interface TextAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Text;
	at: Point;
	text: string;
	color: string;
	size: number;
	rect?: CropRect;
}

export type AnnotationObject =
	| ArrowAnnotation
	| RectAnnotation
	| StepAnnotation
	| TextAnnotation
	| ShapeAnnotation;

export interface AnnotationState {
	objects: AnnotationObject[];
	nextStep: number;
}

export interface AnnotationSessionState {
	state: AnnotationState;
	history: AnnotationState[];
	historyIndex: number;
}

export interface AnnotationStyle {
	color: string;
	size: number;
	opacity: number;
	blur: number;
}
