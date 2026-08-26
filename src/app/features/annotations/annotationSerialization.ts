import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
} from './annotationTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import { CoreLayerId } from '../../core/layers/layerTypes';

const MINIMUM_HISTORY_LENGTH = 1;
const MINIMUM_INDEX = 0;

export function isAnnotationSessionState(
	value: unknown,
): value is AnnotationSessionState {
	if (!isRecord(value) || !isAnnotationState(value.state)) return false;
	return (
		Array.isArray(value.history) &&
		value.history.length >= MINIMUM_HISTORY_LENGTH &&
		value.history.every(isAnnotationState) &&
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
		!isOptionalBoolean(value.locked)
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
			return (
				value.layerId === CoreLayerId.Objects &&
				Object.values(PaintToolId).some((tool) => tool === value.tool) &&
				Array.isArray(value.points) &&
				value.points.length >= 2 &&
				value.points.every(
					(point) => isPoint(point) && isFiniteNumber(point.pressure),
				) &&
				isRect(value.rect) &&
				(value.sourceRect === undefined || isRect(value.sourceRect)) &&
				isColor(value.color) &&
				isFiniteNumber(value.size) &&
				isFiniteNumber(value.opacity) &&
				isFiniteNumber(value.hardness) &&
				isFiniteNumber(value.seed) &&
				isOptionalRotation(value.rotation)
			);
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
		default:
			return false;
	}
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
