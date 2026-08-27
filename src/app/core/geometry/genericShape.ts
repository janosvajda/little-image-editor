import type {
	ShapeHandle,
	TransformableGeometry,
} from './shapeTransformHelpers';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type ArrowAnnotation,
	type FillAnnotation,
	type RectAnnotation,
	type ShapeAnnotation,
	type StepAnnotation,
	type StrokeAnnotation,
	type TextAnnotation,
} from '../../features/annotations/annotationTypes';
import type { CropRect, Point } from '../document/appTypes';
import { normalizedRect } from './geometryHelpers';
import {
	DEFAULT_SHAPE_INTERACTION,
	type ShapeInteractionPolicy,
} from './shapeInteraction';
import { textFrame, TextShapeMetrics } from './textShapeMetrics';

const MINIMUM_STEP_SIZE = 12;

/** Common editable-shape contract. Every retained canvas shape inherits these transforms. */
export abstract class GenericShape<
	TObject extends AnnotationObject = AnnotationObject,
> {
	constructor(
		readonly object: TObject,
		private readonly interaction: ShapeInteractionPolicy = DEFAULT_SHAPE_INTERACTION,
	) {}

	protected abstract readRect(): CropRect;
	protected abstract writeRect(rect: CropRect): void;

	get geometry(): TransformableGeometry {
		return { rect: this.readRect(), rotation: this.object.rotation ?? 0 };
	}
	get handles(): Readonly<Record<ShapeHandle, Point>> {
		return this.interaction.handles(this.geometry);
	}

	hitHandle(point: Point, visualScale = 1): ShapeHandle | null {
		return this.interaction.hitHandle(this.geometry, point, visualScale);
	}
	contains(point: Point, padding?: number): boolean {
		return this.interaction.contains(this.geometry, point, padding);
	}
	cursorAt(point: Point, visualScale = 1): string | null {
		return this.interaction.cursor(this.geometry, point, visualScale);
	}

	move(delta: Point): void {
		const rect = this.readRect();
		this.writeRect({ ...rect, x: rect.x + delta.x, y: rect.y + delta.y });
	}

	transform(handle: ShapeHandle, point: Point): void {
		const geometry = this.geometry;
		this.interaction.transform(geometry, handle, point);
		this.writeRect(geometry.rect);
		this.object.rotation = geometry.rotation;
	}
}

export class RectShape extends GenericShape<
	RectAnnotation | ShapeAnnotation | FillAnnotation
> {
	protected readRect(): CropRect {
		return this.object.rect;
	}
	protected writeRect(rect: CropRect): void {
		this.object.rect = rect;
	}
}

export class ArrowShape extends GenericShape<ArrowAnnotation> {
	protected readRect(): CropRect {
		return normalizedRect(this.object.from, this.object.to);
	}
	protected writeRect(rect: CropRect): void {
		this.object.from = { x: rect.x, y: rect.y };
		this.object.to = { x: rect.x + rect.width, y: rect.y + rect.height };
	}
}

export class StepShape extends GenericShape<StepAnnotation> {
	protected readRect(): CropRect {
		return {
			x: this.object.at.x - this.object.size / 2,
			y: this.object.at.y - this.object.size / 2,
			width: this.object.size,
			height: this.object.size,
		};
	}
	protected writeRect(rect: CropRect): void {
		this.object.size = Math.max(
			MINIMUM_STEP_SIZE,
			Math.min(rect.width, rect.height),
		);
		this.object.at = {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		};
	}
}

export class TextShape extends GenericShape<TextAnnotation> {
	protected readRect(): CropRect {
		return (
			this.object.rect ??
			textFrame(this.object.at, this.object.text, this.object.size)
		);
	}
	protected writeRect(rect: CropRect): void {
		this.object.rect = rect;
		this.object.size = Math.max(
			TextShapeMetrics.MinimumFontSize,
			rect.height / TextShapeMetrics.LineHeight,
		);
		this.object.at = { x: rect.x, y: rect.y + this.object.size };
	}
}

export class StrokeShape extends GenericShape<StrokeAnnotation> {
	protected readRect(): CropRect {
		return this.object.rect;
	}
	protected writeRect(rect: CropRect): void {
		this.object.sourceRect ??= { ...this.object.rect };
		this.object.rect = rect;
	}
}

type ShapeRegistration = Readonly<{
	supports(object: AnnotationObject): boolean;
	create(object: AnnotationObject): GenericShape;
}>;

export class GenericShapeFactory {
	constructor(private readonly registrations: readonly ShapeRegistration[]) {}

	create(object: AnnotationObject): GenericShape {
		const registration = this.registrations.find((candidate) =>
			candidate.supports(object),
		);
		if (!registration)
			throw new Error(`Unsupported retained object type: ${object.type}`);
		return registration.create(object);
	}
}

const DEFAULT_SHAPE_FACTORY = new GenericShapeFactory([
	registration(
		AnnotationObjectTypeId.Arrow,
		(object) => new ArrowShape(object),
	),
	registration(AnnotationObjectTypeId.Step, (object) => new StepShape(object)),
	registration(AnnotationObjectTypeId.Text, (object) => new TextShape(object)),
	registration(AnnotationObjectTypeId.Shape, (object) => new RectShape(object)),
	registration(
		AnnotationObjectTypeId.Stroke,
		(object) => new StrokeShape(object),
	),
	registration(AnnotationObjectTypeId.Fill, (object) => new RectShape(object)),
	registration(AnnotationObjectTypeId.Box, (object) => new RectShape(object)),
	registration(
		AnnotationObjectTypeId.Highlight,
		(object) => new RectShape(object),
	),
	registration(AnnotationObjectTypeId.Blur, (object) => new RectShape(object)),
	registration(
		AnnotationObjectTypeId.Redact,
		(object) => new RectShape(object),
	),
]);

export function genericShape(object: AnnotationObject): GenericShape {
	return DEFAULT_SHAPE_FACTORY.create(object);
}

function registration<TType extends AnnotationObject['type']>(
	type: TType,
	create: (object: Extract<AnnotationObject, { type: TType }>) => GenericShape,
): ShapeRegistration {
	return {
		supports: (object) => object.type === type,
		create: (object) =>
			create(object as Extract<AnnotationObject, { type: TType }>),
	};
}
