import type { Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import {
	RESIZE_HANDLES,
	shapeCenter,
	shapeHandles,
} from '../../core/geometry/shapeTransformHelpers';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from './annotationTypes';
import { transformedStrokePoints } from './strokeGeometry';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SelectionMetrics = {
	ResizeHandleSize: 8,
	EndpointHandleSize: 10,
} as const;

/**
 * How a selected layer is shown: transform controls only for the Select tool,
 * a plain frame while another tool still targets it, otherwise nothing.
 */
export const SelectionPresentation = {
	Hidden: 'hidden',
	Frame: 'frame',
	Transform: 'transform',
} as const;
export type SelectionPresentation =
	(typeof SelectionPresentation)[keyof typeof SelectionPresentation];

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
		presentation: SelectionPresentation = SelectionPresentation.Transform,
	): void {
		this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
		this.element.replaceChildren();
		if (!object || presentation === SelectionPresentation.Hidden) return;
		const geometry = genericShape(object).geometry;
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
		if (presentation !== SelectionPresentation.Transform) return;

		const handles = shapeHandles(geometry);
		for (const corner of RESIZE_HANDLES)
			this.element.append(
				handle(
					handles[corner],
					SelectionMetrics.ResizeHandleSize * visualScale,
					'selection-handle',
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
