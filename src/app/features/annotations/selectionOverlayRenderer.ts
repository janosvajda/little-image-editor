import type { Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import {
	RESIZE_HANDLES,
	shapeCenter,
	shapeHandles,
	type TransformableGeometry,
} from '../../core/geometry/shapeTransformHelpers';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from './annotationTypes';
import { transformedStrokePoints } from './strokeGeometry';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const LAYER_FRAME_CLASS = 'selection-layer-frame';
const LAYER_OUTLINE_CLASS = 'selection-layer-outline';
const ITEM_HANDLE_CLASS = 'selection-handle';
const LAYER_HANDLE_CLASS = `${ITEM_HANDLE_CLASS} layer-selection-handle`;
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

	/**
	 * The selected item's frame and, while it is shown, the outline of the
	 * layer holding it, so it is always clear which layer an item belongs to.
	 */
	render(
		object: AnnotationObject | null,
		width: number,
		height: number,
		visualScale: number,
		presentation: SelectionPresentation = SelectionPresentation.Transform,
		layerFrame: TransformableGeometry | null = null,
	): void {
		this.reset(width, height);
		if (!object || presentation === SelectionPresentation.Hidden) return;
		if (layerFrame)
			this.element.append(
				turnedGroup(layerFrame, [selectionRect(layerFrame.rect, LAYER_OUTLINE_CLASS)]),
			);
		const geometry = genericShape(object).geometry;
		this.appendFrame(geometry);
		if (presentation !== SelectionPresentation.Transform) return;
		this.appendCornerHandles(geometry, visualScale);
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

	/** A whole selected layer: a frame around its items with the same transform controls. */
	renderLayerFrame(
		frame: TransformableGeometry | null,
		width: number,
		height: number,
		visualScale: number,
		presentation: SelectionPresentation,
	): void {
		this.reset(width, height);
		if (!frame || presentation === SelectionPresentation.Hidden) return;
		this.appendFrame(frame, LAYER_FRAME_CLASS);
		if (presentation === SelectionPresentation.Transform)
			this.appendCornerHandles(frame, visualScale, LAYER_HANDLE_CLASS);
	}

	private reset(width: number, height: number): void {
		this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
		this.element.replaceChildren();
	}

	private appendFrame(geometry: TransformableGeometry, className?: string): void {
		const group = turnedGroup(geometry, [
			selectionRect(geometry.rect, 'selection-frame-contrast'),
			selectionRect(geometry.rect, 'selection-frame'),
		]);
		if (className) group.classList.add(className);
		this.element.append(group);
	}

	private appendCornerHandles(
		geometry: TransformableGeometry,
		visualScale: number,
		className: string = ITEM_HANDLE_CLASS,
	): void {
		const handles = shapeHandles(geometry);
		for (const corner of RESIZE_HANDLES)
			this.element.append(
				handle(
					handles[corner],
					SelectionMetrics.ResizeHandleSize * visualScale,
					className,
				),
			);
	}
}

/** Elements drawn in a frame's own orientation, turned about its centre. */
function turnedGroup(
	geometry: TransformableGeometry,
	children: readonly SVGElement[],
): SVGGElement {
	const center = shapeCenter(geometry);
	const group = svgElement('g');
	group.setAttribute(
		'transform',
		`rotate(${geometry.rotation ?? 0} ${center.x} ${center.y})`,
	);
	group.append(...children);
	return group;
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
