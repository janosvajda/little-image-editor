import type { Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import {
	type ShapeHandle,
	ShapeHandleId,
	ShapeHandleMetrics,
	shapeCenter,
	shapeHandles,
	shapeMoveHandle,
} from '../../core/geometry/shapeTransformHelpers';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from './annotationTypes';
import { transformedStrokePoints } from './strokeGeometry';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SelectionMetrics = {
	ResizeHandleSize: 8,
	RotateHandleSize: 10,
	MoveHandleRadius: 6,
	MoveHandleCrossRadius: 3,
	EndpointHandleSize: 10,
} as const;

export class SelectionOverlayRenderer {
	readonly element = document.createElementNS(SVG_NAMESPACE, 'svg');

	constructor() {
		this.element.classList.add('selection-overlay');
		this.element.setAttribute('aria-hidden', 'true');
		this.element.setAttribute('preserveAspectRatio', 'none');
	}

	render(
		object: AnnotationObject | null,
		width: number,
		height: number,
		visualScale: number,
	): void {
		this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
		this.element.replaceChildren();
		if (!object) return;
		const shape = genericShape(object);
		const geometry = shape.geometry;
		const center = shapeCenter(geometry);
		const group = svgElement('g');
		group.setAttribute(
			'transform',
			`rotate(${geometry.rotation ?? 0} ${center.x} ${center.y})`,
		);
		group.append(
			selectionRect(geometry.rect, 'selection-frame-contrast'),
			selectionRect(geometry.rect, 'selection-frame'),
		);
		this.element.append(group);

		const handles = shapeHandles(
			geometry,
			ShapeHandleMetrics.Offset * visualScale,
		);
		for (const [id, point] of Object.entries(handles) as Array<
			[ShapeHandle, Point]
		>)
			this.element.append(
				handle(
					point,
					(id === ShapeHandleId.Rotate
						? SelectionMetrics.RotateHandleSize
						: SelectionMetrics.ResizeHandleSize) * visualScale,
					'selection-handle',
				),
			);

		this.element.append(
			moveHandle(
				shapeMoveHandle(geometry, ShapeHandleMetrics.Offset * visualScale, {
					width,
					height,
				}),
				visualScale,
			),
		);
		if (object.type === AnnotationObjectTypeId.Stroke)
			for (const point of strokeEndpoints(object))
				this.element.append(
					handle(
						point,
						SelectionMetrics.EndpointHandleSize * visualScale,
						'selection-endpoint',
					),
				);
	}
}

function selectionRect(
	rect: Readonly<{ x: number; y: number; width: number; height: number }>,
	className: string,
): SVGRectElement {
	const element = svgElement('rect');
	element.setAttribute('x', String(rect.x));
	element.setAttribute('y', String(rect.y));
	element.setAttribute('width', String(rect.width));
	element.setAttribute('height', String(rect.height));
	element.setAttribute('class', className);
	return element;
}

function handle(point: Point, size: number, className: string): SVGRectElement {
	const element = svgElement('rect');
	element.setAttribute('x', String(point.x - size / 2));
	element.setAttribute('y', String(point.y - size / 2));
	element.setAttribute('width', String(size));
	element.setAttribute('height', String(size));
	element.setAttribute('class', className);
	return element;
}

function moveHandle(point: Point, visualScale: number): SVGGElement {
	const group = svgElement('g');
	group.setAttribute('class', 'selection-move-handle');
	const circle = svgElement('circle');
	circle.setAttribute('cx', String(point.x));
	circle.setAttribute('cy', String(point.y));
	circle.setAttribute(
		'r',
		String(SelectionMetrics.MoveHandleRadius * visualScale),
	);
	const cross = SelectionMetrics.MoveHandleCrossRadius * visualScale;
	const horizontal = svgElement('line');
	horizontal.setAttribute('x1', String(point.x - cross));
	horizontal.setAttribute('x2', String(point.x + cross));
	horizontal.setAttribute('y1', String(point.y));
	horizontal.setAttribute('y2', String(point.y));
	const vertical = svgElement('line');
	vertical.setAttribute('x1', String(point.x));
	vertical.setAttribute('x2', String(point.x));
	vertical.setAttribute('y1', String(point.y - cross));
	vertical.setAttribute('y2', String(point.y + cross));
	group.append(circle, horizontal, vertical);
	return group;
}

function strokeEndpoints(
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
): Point[] {
	const points = transformedStrokePoints(object);
	return [points[0], points.at(-1)].flatMap((point) => (point ? [point] : []));
}

function svgElement<K extends keyof SVGElementTagNameMap>(
	tag: K,
): SVGElementTagNameMap[K] {
	return document.createElementNS(SVG_NAMESPACE, tag);
}
