import type {
	DocumentType,
	DocumentSessionSnapshot,
	ImageFormat,
} from '../../core/document/appTypes';
import type { LayerState } from '../../core/layers/layerTypes';
import type { AnnotationSessionState } from '../annotations/annotationTypes';
import type { ProjectCapabilityManifest } from './projectCompatibility';

export const PROJECT_EXTENSION = 'limg';
export const PROJECT_MIME_TYPE =
	'application/vnd.little-image-editor.project+json';
export const PROJECT_FORMAT_IDENTIFIER = 'little-image-editor-project';
export const PROJECT_FORMAT_VERSION = 3;
export const LEGACY_PROJECT_FORMAT_VERSION = 2;
export type ProjectFormatVersion =
	| typeof PROJECT_FORMAT_VERSION
	| typeof LEGACY_PROJECT_FORMAT_VERSION;

export const GuideOrientation = {
	Horizontal: 'horizontal',
	Vertical: 'vertical',
} as const;
export type GuideOrientation =
	(typeof GuideOrientation)[keyof typeof GuideOrientation];

export interface ProjectGuide {
	readonly orientation: GuideOrientation;
	readonly position: number;
}

export interface ProjectExportPreferences {
	readonly format: ImageFormat;
}

export interface SerializedPixelState {
	readonly width: number;
	readonly height: number;
	readonly pixels: string;
}

export interface SerializedDocumentSession extends SerializedPixelState {
	readonly baseName: string;
	readonly savedType: ImageFormat;
	readonly resolution: number;
	readonly history: readonly SerializedPixelState[];
	readonly historyIndex: number;
	readonly toolbarStates: Readonly<Record<string, unknown>>;
	readonly layerState: LayerState;
	readonly documentType: DocumentType;
}

export interface LittleImageProject {
	readonly format: typeof PROJECT_FORMAT_IDENTIFIER;
	readonly version: ProjectFormatVersion;
	readonly document: SerializedDocumentSession;
	readonly guides: readonly ProjectGuide[];
	readonly exportPreferences: ProjectExportPreferences;
	readonly editableObjects: AnnotationSessionState;
	readonly capabilities: ProjectCapabilityManifest;
}

export interface ProjectSnapshotSource {
	snapshotSession(): DocumentSessionSnapshot;
}
