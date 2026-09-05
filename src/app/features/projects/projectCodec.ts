import {
	DocumentType,
	type DocumentSessionSnapshot,
	type ImageFormat,
	ImageMimeType,
} from '../../core/document/appTypes';
import { PIXELS_PER_INCH } from '../../core/document/measurementUnits';
import {
	DEFAULT_LAYER_STATE,
	LayerKind,
	type LayerState,
} from '../../core/layers/layerTypes';
import {
	GuideOrientation,
	LEGACY_PROJECT_FORMAT_VERSION,
	type LittleImageProject,
	PROJECT_FORMAT_IDENTIFIER,
	PROJECT_FORMAT_VERSION,
	type ProjectGuide,
	type SerializedDocumentSession,
	type SerializedPixelState,
} from './projectTypes';
import {
	decodePixelBytes,
	decodePixelReference,
	encodePixelBytes,
	encodePixelReference,
	PixelBufferRegistry,
} from '../../shared/image/pixelDataCodec';
import type { AnnotationSessionState } from '../annotations/annotationTypes';
import { isSafeProjectAnnotationSession } from '../annotations/annotationSerialization';
import type { EditorProjectState } from './projectEditorAdapter';
import {
	PROJECT_CAPABILITY_MANIFEST,
	type ProjectCapabilityManifest,
} from './projectCompatibility';

const RGBA_CHANNEL_COUNT = 4;
const EMPTY_EDITABLE_OBJECTS: AnnotationSessionState = {
	state: { objects: [], nextStep: 1 },
	history: [{ objects: [], nextStep: 1 }],
	historyIndex: 0,
};

export class ProjectFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectFormatError';
	}
}

export class ProjectCodec {
	serializeEditorState(
		state: EditorProjectState,
		guides: readonly ProjectGuide[] = [],
	): string {
		return this.serialize(state.document, guides, state.editableObjects);
	}

	serialize(
		session: DocumentSessionSnapshot,
		guides: readonly ProjectGuide[] = [],
		editableObjects: AnnotationSessionState = EMPTY_EDITABLE_OBJECTS,
	): string {
		const document = serializeSession(session);
		const project: LittleImageProject = {
			format: PROJECT_FORMAT_IDENTIFIER,
			version: PROJECT_FORMAT_VERSION,
			document,
			guides: structuredClone(guides),
			exportPreferences: { format: session.savedType },
			editableObjects: structuredClone(editableObjects),
			capabilities: structuredClone(PROJECT_CAPABILITY_MANIFEST),
		};
		return JSON.stringify(project);
	}

	toEditableObjects(project: LittleImageProject): AnnotationSessionState {
		return structuredClone(project.editableObjects);
	}

	toEditorState(project: LittleImageProject): EditorProjectState {
		return {
			document: this.toSession(project),
			editableObjects: this.toEditableObjects(project),
		};
	}

	parse(source: string): LittleImageProject {
		let value: unknown;
		try {
			value = JSON.parse(source);
		} catch {
			throw new ProjectFormatError('The project file is not valid JSON.');
		}
		if (!isProject(value))
			throw new ProjectFormatError(
				'The project file has an unsupported structure.',
			);
		return value;
	}

	toSession(project: LittleImageProject): DocumentSessionSnapshot {
		const { documentPixels, history } = deserializeSessionPixels(
			project.document,
		);
		return {
			...deserializePixels(project.document, documentPixels),
			baseName: project.document.baseName,
			savedType: project.document.savedType,
			resolution: project.document.resolution,
			history,
			historyIndex: project.document.historyIndex,
			toolbarStates: structuredClone(project.document.toolbarStates),
			layerState: structuredClone(project.document.layerState),
			documentType: project.document.documentType,
		};
	}
}

function serializeSession(
	session: DocumentSessionSnapshot,
): SerializedDocumentSession {
	const document = serializePixels(session);
	const pixelBuffers = new PixelBufferRegistry();
	pixelBuffers.register(session.pixels, { kind: 'document' });
	const history = session.history.map((state, index) => {
		const reference = pixelBuffers.register(state.pixels, {
			kind: 'history',
			index,
		});
		if (reference)
			return {
				width: state.width,
				height: state.height,
				pixels: encodePixelReference(reference),
			};
		return serializePixels(state);
	});
	return {
		...document,
		baseName: session.baseName,
		savedType: session.savedType,
		resolution: session.resolution ?? PIXELS_PER_INCH,
		history,
		historyIndex: session.historyIndex,
		toolbarStates: structuredClone(session.toolbarStates ?? {}),
		layerState: structuredClone(session.layerState ?? DEFAULT_LAYER_STATE),
		documentType: session.documentType ?? DocumentType.Image,
	};
}

function serializePixels(
	state: Readonly<{ width: number; height: number; pixels: Uint8ClampedArray }>,
): SerializedPixelState {
	return {
		width: state.width,
		height: state.height,
		pixels: encodePixelBytes(state.pixels),
	};
}

function deserializePixels(
	state: SerializedPixelState,
	pixels = decodePixelBytes(state.pixels),
): {
	width: number;
	height: number;
	pixels: Uint8ClampedArray;
} {
	return { width: state.width, height: state.height, pixels };
}

function deserializeSessionPixels(session: SerializedDocumentSession): {
	readonly documentPixels: Uint8ClampedArray;
	readonly history: Array<{
		readonly width: number;
		readonly height: number;
		readonly pixels: Uint8ClampedArray;
	}>;
} {
	const documentPixels = decodePixelBytes(session.pixels);
	assertPixelLength(session, documentPixels);
	const history: Array<{
		readonly width: number;
		readonly height: number;
		readonly pixels: Uint8ClampedArray;
	}> = [];
	for (const state of session.history) {
		const reference = decodePixelReference(state.pixels);
		const pixels = reference
			? referencedPixels(reference, documentPixels, history)
			: decodePixelBytes(state.pixels);
		assertPixelLength(state, pixels);
		history.push(deserializePixels(state, pixels));
	}
	return { documentPixels, history };
}

function referencedPixels(
	reference: ReturnType<typeof decodePixelReference> & {},
	documentPixels: Uint8ClampedArray,
	history: ReadonlyArray<Readonly<{ pixels: Uint8ClampedArray }>>,
): Uint8ClampedArray {
	if (reference.kind === 'document') return documentPixels;
	const state = history[reference.index];
	if (!state) throw new Error('Invalid pixel snapshot reference.');
	return state.pixels;
}

function assertPixelLength(
	state: SerializedPixelState,
	pixels: Uint8ClampedArray,
): void {
	if (pixels.length !== state.width * state.height * RGBA_CHANNEL_COUNT)
		throw new Error('Pixel data does not match its canvas dimensions.');
}

function isProject(value: unknown): value is LittleImageProject {
	if (!isRecord(value)) return false;
	return (
		value.format === PROJECT_FORMAT_IDENTIFIER &&
		(value.version === PROJECT_FORMAT_VERSION ||
			value.version === LEGACY_PROJECT_FORMAT_VERSION) &&
		isSerializedSession(value.document) &&
		Array.isArray(value.guides) &&
		value.guides.every(isGuide) &&
		isRecord(value.exportPreferences) &&
		isImageFormat(value.exportPreferences.format) &&
		isSafeProjectAnnotationSession(value.editableObjects) &&
		isCurrentCapabilityManifest(value.capabilities)
	);
}

function isSerializedSession(
	value: unknown,
): value is SerializedDocumentSession {
	if (!isRecord(value) || !isPixelState(value)) return false;
	const structurallyValid =
		typeof value.baseName === 'string' &&
		isImageFormat(value.savedType) &&
		isPositiveNumber(value.resolution) &&
		Array.isArray(value.history) &&
		value.history.length > 0 &&
		value.history.every(isPixelState) &&
		typeof value.historyIndex === 'number' &&
		Number.isInteger(value.historyIndex) &&
		value.historyIndex >= 0 &&
		value.historyIndex < value.history.length &&
		isRecord(value.toolbarStates) &&
		isLayerState(value.layerState) &&
		Object.values(DocumentType).some(
			(documentType) => documentType === value.documentType,
		);
	if (!structurallyValid) return false;
	try {
		deserializeSessionPixels(value as unknown as SerializedDocumentSession);
		return true;
	} catch {
		return false;
	}
}

function isPixelState(value: unknown): value is SerializedPixelState {
	if (!isRecord(value)) return false;
	if (
		!isPositiveInteger(value.width) ||
		!isPositiveInteger(value.height) ||
		typeof value.pixels !== 'string'
	)
		return false;
	return true;
}

function isLayerState(value: unknown): value is LayerState {
	return (
		isRecord(value) &&
		typeof value.activeLayerId === 'string' &&
		Array.isArray(value.layers) &&
		value.layers.length > 0 &&
		value.layers.every(
			(layer) =>
				isRecord(layer) &&
				typeof layer.id === 'string' &&
				typeof layer.name === 'string' &&
				typeof layer.visible === 'boolean' &&
				typeof layer.locked === 'boolean' &&
				isLayerKind(layer.kind),
		) &&
		value.layers.some(
			(layer) => isRecord(layer) && layer.id === value.activeLayerId,
		)
	);
}

function isGuide(value: unknown): value is ProjectGuide {
	return (
		isRecord(value) &&
		(value.orientation === GuideOrientation.Horizontal ||
			value.orientation === GuideOrientation.Vertical) &&
		Number.isFinite(value.position)
	);
}

function isImageFormat(value: unknown): value is ImageFormat {
	return Object.values(ImageMimeType).includes(value as ImageFormat);
}

function isLayerKind(value: unknown): value is LayerKind {
	return Object.values(LayerKind).some((kind) => kind === value);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isInteger(value) && Number(value) > 0;
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCurrentCapabilityManifest(
	value: unknown,
): value is ProjectCapabilityManifest {
	if (!isRecord(value)) return false;
	return (
		arraysEqual(value.drawingTools, PROJECT_CAPABILITY_MANIFEST.drawingTools) &&
		arraysEqual(
			value.annotationTools,
			PROJECT_CAPABILITY_MANIFEST.annotationTools,
		)
	);
}

function arraysEqual(value: unknown, expected: readonly string[]): boolean {
	return (
		Array.isArray(value) &&
		value.length === expected.length &&
		value.every((item, index) => item === expected[index])
	);
}
