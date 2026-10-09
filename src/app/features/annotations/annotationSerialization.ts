import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	LinkedHistoryDomain,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
} from './annotationTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import {
	CoreLayerId,
	isBlendMode,
	isLayerOpacity,
} from '../../core/layers/layerTypes';
import { decodePixelBytes } from '../../shared/image/pixelDataCodec';

const MINIMUM_HISTORY_LENGTH = 1;
const MINIMUM_INDEX = 0;
const MINIMUM_POLYGON_POINTS = 3;
const RGBA_CHANNEL_COUNT = 4;

export function isAnnotationSessionState(
	value: unknown,
): value is AnnotationSessionState {
	if (!isRecord(value) || !isAnnotationState(value.state)) return false;
	return (
		Array.isArray(value.history) &&
		value.history.length >= MINIMUM_HISTORY_LENGTH &&
		value.history.every(isAnnotationState) &&
		isOptionalHistoryLinks(value.historyLinks, value.history.length) &&
		Number.isInteger(value.historyIndex) &&
		Number(value.historyIndex) >= MINIMUM_INDEX &&
		Number(value.historyIndex) < value.history.length
	);
}

export function isSafeProjectAnnotationSession(
	value: unknown,
): value is AnnotationSessionState {
	return (
		isAnnotationSessionState(value) &&
		value.state.objects.length <= EditorLimit.EditableObjectImportMaximum &&
		value.history.every(
			(state) =>
				state.objects.length <= EditorLimit.EditableObjectImportMaximum,
		)
	);
}

function isAnnotationState(value: unknown): value is AnnotationState {
	return (
		isRecord(value) &&
		Array.isArray(value.objects) &&
		value.objects.every(isAnnotationObject) &&
		isFiniteNumber(value.nextStep)
	);
}

function isAnnotationObject(value: unknown): value is AnnotationObject {
	if (
		!isRecord(value) ||
		typeof value.id !== 'string' ||
		!isOptionalBoolean(value.visible) ||
		!isOptionalBoolean(value.locked) ||
		!isOptionalLayerAppearance(value) ||
		!isOptionalObjectErasures(value.erasures) ||
		!isOptionalPixelMasks(value.pixelCutouts) ||
		!isOptionalPixelMasks(value.pixelClips) ||
		!(value.erasureRevision === undefined || isFiniteNumber(value.erasureRevision))
	)
		return false;
	switch (value.type) {
		case AnnotationObjectTypeId.Arrow:
			return (
				isPoint(value.from) &&
				isPoint(value.to) &&
				isColor(value.color) &&
				isFiniteNumber(value.width) &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.Step:
			return (
				isPoint(value.at) &&
				isFiniteNumber(value.value) &&
				isColor(value.color) &&
				isFiniteNumber(value.size) &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.Text:
			return (
				isPoint(value.at) &&
				typeof value.text === 'string' &&
				isColor(value.color) &&
				isFiniteNumber(value.size) &&
				(value.rect === undefined || isRect(value.rect)) &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.Box:
		case AnnotationObjectTypeId.Highlight:
		case AnnotationObjectTypeId.Blur:
		case AnnotationObjectTypeId.Redact:
			return (
				isRect(value.rect) &&
				isColor(value.color) &&
				isFiniteNumber(value.width) &&
				isFiniteNumber(value.opacity) &&
				isFiniteNumber(value.blur) &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.Shape:
			return (
				Object.values(ShapeToolId).some((shape) => shape === value.shape) &&
				isRect(value.rect) &&
				isColor(value.color) &&
				isFiniteNumber(value.width) &&
				isFiniteNumber(value.opacity) &&
				typeof value.fill === 'boolean' &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.Stroke:
			return isStrokeAnnotation(value);
		case AnnotationObjectTypeId.Fill:
			return (
				value.layerId === CoreLayerId.Objects &&
				isRect(value.rect) &&
				Array.isArray(value.runs) &&
				value.runs.length > 0 &&
				value.runs.every(isFillRun) &&
				isColor(value.color) &&
				isFiniteNumber(value.opacity) &&
				isFiniteNumber(value.tolerance) &&
				isOptionalRotation(value.rotation)
			);
		case AnnotationObjectTypeId.RasterFragment:
			return (
				isRect(value.rect) &&
				isExactRasterPixelData(
					value.pixels,
					value.pixelWidth,
					value.pixelHeight,
				) &&
				isOptionalRotation(value.rotation)
			);
		default:
			return false;
	}
}

function isExactRasterPixelData(
	value: unknown,
	width: unknown,
	height: unknown,
): value is string {
	if (
		typeof value !== 'string' ||
		!isPositiveInteger(width) ||
		!isPositiveInteger(height)
	)
		return false;
	try {
		return (
			decodePixelBytes(value).length === width * height * RGBA_CHANNEL_COUNT
		);
	} catch {
		return false;
	}
}

function isOptionalHistoryLinks(value: unknown, historyLength: number): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			value.length === historyLength &&
			value.every(
				(link) => link === null || link === LinkedHistoryDomain.Document,
			))
	);
}

function isOptionalPixelMasks(value: unknown): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			value.every(
				(mask) =>
					isRecord(mask) &&
					Array.isArray(mask.points) &&
					mask.points.length >= MINIMUM_POLYGON_POINTS &&
					mask.points.every(
						(point) =>
							isRecord(point) &&
							isFiniteNumber(point.xRatio) &&
							isFiniteNumber(point.yRatio),
					) &&
					(mask.strokePointLimit === undefined ||
						(Number.isInteger(mask.strokePointLimit) &&
							Number(mask.strokePointLimit) >= 2)) &&
					(mask.strokeSourceRect === undefined || isRect(mask.strokeSourceRect)),
			))
	);
}

function isStrokeAnnotation(value: Record<string, unknown>): boolean {
	return (
		value.layerId === CoreLayerId.Objects &&
		Object.values(PaintToolId).some((tool) => tool === value.tool) &&
		Array.isArray(value.points) &&
		value.points.every(
			(point) => isPoint(point) && isFiniteNumber(point.pressure),
		) &&
		(value.pathStarts === undefined ||
			(Array.isArray(value.pathStarts) &&
				value.pathStarts.every(
					(index) => Number.isInteger(index) && Number(index) > 0,
				))) &&
		(value.pathStyles === undefined ||
			(Array.isArray(value.pathStyles) &&
				value.pathStyles.every(isStrokePathStyle))) &&
		isRect(value.rect) &&
		(value.sourceRect === undefined || isRect(value.sourceRect)) &&
		isColor(value.color) &&
		isFiniteNumber(value.size) &&
		isFiniteNumber(value.opacity) &&
		isFiniteNumber(value.hardness) &&
		isFiniteNumber(value.seed) &&
		isOptionalRotation(value.rotation)
	);
}

function isStrokePathStyle(value: unknown): boolean {
	return (
		isRecord(value) &&
		Number.isInteger(value.startIndex) &&
		Number(value.startIndex) >= MINIMUM_INDEX &&
		Object.values(PaintToolId).some((tool) => tool === value.tool) &&
		isColor(value.color) &&
		isFiniteNumber(value.size) &&
		isFiniteNumber(value.opacity) &&
		isFiniteNumber(value.hardness) &&
		isFiniteNumber(value.seed)
	);
}

function isOptionalObjectErasures(value: unknown): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			value.every(
				(path) =>
					isRecord(path) &&
					Array.isArray(path.points) &&
					path.points.length >= 2 &&
					path.points.every(
						(point) =>
							isRecord(point) &&
							isFiniteNumber(point.xRatio) &&
							isFiniteNumber(point.yRatio) &&
							isFiniteNumber(point.pressure),
					) &&
					isFiniteNumber(path.sizeRatio) &&
					isFiniteNumber(path.opacity) &&
					isFiniteNumber(path.hardness) &&
					(path.strokePointLimit === undefined ||
						(Number.isInteger(path.strokePointLimit) &&
							Number(path.strokePointLimit) >= 2)),
			)
		)
	);
}

function isOptionalBoolean(value: unknown): boolean {
	return value === undefined || typeof value === 'boolean';
}

function isFillRun(value: unknown): boolean {
	return (
		isRecord(value) &&
		isFiniteNumber(value.x) &&
		isFiniteNumber(value.y) &&
		isFiniteNumber(value.length) &&
		Number(value.length) > 0
	);
}

function isPoint(value: unknown): boolean {
	return (
		isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
	);
}

function isRect(value: unknown): boolean {
	return (
		isRecord(value) &&
		isFiniteNumber(value.x) &&
		isFiniteNumber(value.y) &&
		isFiniteNumber(value.width) &&
		isFiniteNumber(value.height)
	);
}

function isColor(value: unknown): boolean {
	return typeof value === 'string' && value.length > 0;
}

function isOptionalRotation(value: unknown): boolean {
	return value === undefined || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalLayerAppearance(value: Record<string, unknown>): boolean {
	return (
		(value.name === undefined || typeof value.name === 'string') &&
		(value.layerOpacity === undefined || isLayerOpacity(value.layerOpacity)) &&
		(value.blendMode === undefined || isBlendMode(value.blendMode))
	);
}
