import {
	MarkupToolId,
	type MarkupTool,
	type Point,
} from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import {
	TextShapeMetrics,
	textFrame,
} from '../../core/geometry/textShapeMetrics';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type RectAnnotation,
	type TextAnnotation,
} from '../annotations/annotationTypes';
import { InlineTextEditor } from '../annotations/inlineTextEditor';
import type { StrokeOptions } from './drawingHelpers';
import { RetainedDrawingGesture } from './gestures/drawingGesture';

/** How markup sizes follow the shared size setting. */
const MarkupSize = {
	MinimumMarker: 22,
	MarkerPerSize: 2,
	MinimumText: TextShapeMetrics.MinimumFontSize,
	TextPerSize: 2,
} as const;
const MINIMUM_FRAME_LENGTH = 2;
const FULL_OPACITY = 1;
/** Highlight, blur and redaction areas are filled; they have no outline. */
const NO_OUTLINE = 0;

/** Markup tools that are dragged out as a frame. */
export type FramedMarkupTool =
	| typeof MarkupToolId.Highlight
	| typeof MarkupToolId.Blur
	| typeof MarkupToolId.Redact;

export function isFramedMarkupTool(tool: MarkupTool): tool is FramedMarkupTool {
	return (
		tool === MarkupToolId.Highlight ||
		tool === MarkupToolId.Blur ||
		tool === MarkupToolId.Redact
	);
}

function framedItem(
	tool: FramedMarkupTool,
	rect: RectAnnotation['rect'],
	style: StrokeOptions,
): RectAnnotation {
	return {
		id: crypto.randomUUID(),
		type: tool,
		rect,
		color: tool === MarkupToolId.Redact ? ColorPalette.Black : style.color,
		width: NO_OUTLINE,
		opacity: tool === MarkupToolId.Highlight ? style.opacity : FULL_OPACITY,
		blur: style.size,
		rotation: 0,
	};
}

function textFontSize(style: StrokeOptions): number {
	return Math.max(MarkupSize.MinimumText, style.size * MarkupSize.TextPerSize);
}

/** Drags a highlight, blur or redaction area out from the press point. */
class FramedMarkupGesture extends RetainedDrawingGesture {
	readonly locksScroll = true;
	readonly #itemId: string;

	constructor(
		objects: AnnotationDocument,
		tool: FramedMarkupTool,
		private readonly start: Point,
		style: StrokeOptions,
	) {
		super(objects);
		const item = framedItem(tool, normalizedRect(start, start), style);
		this.#itemId = item.id;
		objects.add(item, false);
	}

	update(point: Point): void {
		this.objects.update(
			this.#itemId,
			(item) => {
				if ('rect' in item) item.rect = normalizedRect(this.start, point);
			},
			false,
		);
	}

	override complete(point: Point): void {
		if (
			Math.hypot(point.x - this.start.x, point.y - this.start.y) <
			MINIMUM_FRAME_LENGTH
		) {
			this.cancel();
			return;
		}
		this.update(point);
		super.complete(point);
	}
}

/**
 * The markup tools: numbered markers, highlight, blur and redaction areas,
 * and text. Items go into the active layer like every other item.
 */
export class MarkupActions {
	readonly #textEditor = new InlineTextEditor();

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
	) {}

	beginFrame(
		tool: FramedMarkupTool,
		point: Point,
		style: StrokeOptions,
	): RetainedDrawingGesture {
		return new FramedMarkupGesture(this.objects, tool, point, style);
	}

	placeNumber(point: Point, style: StrokeOptions): void {
		this.objects.add({
			id: crypto.randomUUID(),
			type: AnnotationObjectTypeId.Step,
			at: point,
			value: this.objects.state.nextStep,
			color: style.color,
			size: Math.max(
				MarkupSize.MinimumMarker,
				style.size * MarkupSize.MarkerPerSize,
			),
		});
	}

	/** Opens a text box at the pointer; the text becomes an item when committed. */
	createText(
		point: Point,
		client: Readonly<{ clientX: number; clientY: number }>,
		style: StrokeOptions,
	): void {
		const size = textFontSize(style);
		this.#textEditor.open({
			value: '',
			clientX: client.clientX,
			clientY: client.clientY,
			fontSize: size * this.screenScale(),
			color: style.color,
			onInput: () => undefined,
			onCommit: (text) =>
				this.objects.add({
					id: crypto.randomUUID(),
					type: AnnotationObjectTypeId.Text,
					at: point,
					text,
					color: style.color,
					size,
					rect: textFrame(point, text, size),
				}),
			onCancel: () => undefined,
		});
	}

	/** Edits a text item in place; typing previews, Escape restores it. */
	editText(
		item: TextAnnotation,
		client: Readonly<{ clientX: number; clientY: number }>,
	): void {
		const original = structuredClone(item);
		const apply = (text: string, commit: boolean) =>
			this.objects.update(
				item.id,
				(target) => {
					if (target.type !== AnnotationObjectTypeId.Text) return;
					target.text = text;
					const current = genericShape(target).geometry.rect;
					const measured = textFrame(target.at, text, target.size);
					target.rect = { ...current, width: measured.width };
				},
				commit,
			);
		this.objects.select(item.id);
		this.#textEditor.open({
			value: item.text,
			clientX: client.clientX,
			clientY: client.clientY,
			fontSize: item.size * this.screenScale(),
			color: item.color,
			onInput: (text) => apply(text, false),
			onCommit: (text) => apply(text, true),
			onCancel: () =>
				this.objects.update(
					item.id,
					(target) => Object.assign(target, original),
					false,
				),
		});
	}

	/** Screen pixels per document pixel, so the text box matches the drawn text. */
	private screenScale(): number {
		return (
			this.documentModel.overlay.getBoundingClientRect().width /
			Math.max(1, this.documentModel.width)
		);
	}
}
