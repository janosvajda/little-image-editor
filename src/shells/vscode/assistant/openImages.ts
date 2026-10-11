import type {
	AssistantCommand,
	AssistantResult,
	NewImageSpec,
} from '../../../app/features/assistant/assistantCommandTypes';
import type { FileBytes } from '../vscodeMessages';
import type { ImageExtension } from '../../../app/core/document/imageFormats';

/** An image open in the editor, as an assistant sees it in a list. */
export interface OpenImageSummary {
	/** Stable while the image is open; pass it back to choose this image. */
	readonly id: string;
	readonly name: string;
	/** Where the file is, or its untitled name before the first save. */
	readonly location: string;
	/** The editor the user is working in, or worked in last. */
	readonly active: boolean;
}

/** A picture of an open image, with the image's own size. */
export interface OpenImageView {
	readonly name: string;
	readonly png: FileBytes;
	readonly width: number;
	readonly height: number;
	readonly imageWidth: number;
	readonly imageHeight: number;
}

/** The images open in the editor, as the assistant tools reach them. */
export interface OpenImages {
	list(): readonly OpenImageSummary[];
	/** A picture of one image, by id or name; without either, of the active image. */
	view(image: string | undefined, maxSize: number): Promise<OpenImageView>;
}

/** Open images an assistant can also change and create. */
export interface EditableImages extends OpenImages {
	/** Carries out a command on one image, by id or name; without either, on the active image. */
	command(image: string | undefined, command: AssistantCommand): Promise<AssistantResult>;
	/** Opens a new, unsaved image and makes it the active one. */
	create(name: string | undefined, spec: NewImageSpec): Promise<OpenImageSummary>;
}

/** A raster copy to write into a workspace, independently of the editable document. */
export interface ImageExportRequest {
	readonly path: string;
	/** Choose a workspace folder by name or absolute path in a multi-root window. */
	readonly workspace?: string;
	readonly overwrite: boolean;
}

export interface ImageExportResult {
	readonly path: string;
	readonly format: typeof ImageExtension.Png;
	readonly width: number;
	readonly height: number;
	readonly bytesWritten: number;
}

export interface ExportableImages extends OpenImages {
	export(image: string | undefined, request: ImageExportRequest): Promise<ImageExportResult>;
}

export function canExport(images: OpenImages): images is ExportableImages {
	return 'export' in images && typeof images.export === 'function';
}

export function canEdit(images: OpenImages): images is EditableImages {
	return 'command' in images && 'create' in images;
}
