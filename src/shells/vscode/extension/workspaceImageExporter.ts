import { randomUUID } from 'node:crypto';
import { link, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ImageMimeType } from '../../../app/core/document/appTypes';
import { ImageExtension } from '../../../app/core/document/imageFormats';
import { hasValidExtension } from '../../../app/features/files/fileNameHelpers';
import { isSvgFileName, SVG_EXTENSION } from '../../../app/core/document/svgFormat';
import type { ImageExportRequest, ImageExportResult, OpenImageView } from '../assistant/openImages';
import { containsPath, type ExportWorkspace, existingParent, hasCode, WorkspacePaths } from './workspacePaths';

export type { ExportWorkspace } from './workspacePaths';

const OUTSIDE_WORKSPACE_MESSAGE = 'Export the PNG inside an open workspace folder.';
const NO_WORKSPACE_MESSAGE = 'Open a local workspace folder before exporting an image.';
const PNG_EXTENSION = `.${ImageExtension.Png}`;
const FileErrorCode = { Missing: 'ENOENT', Exists: 'EEXIST' } as const;

/** The image as SVG, with its size. */
export interface VectorPicture {
	readonly markup: string;
	readonly width: number;
	readonly height: number;
}

/** The path asked for in the workspace, and the real path written after following folders. */
interface SafeTarget {
	readonly destination: string;
	readonly real: string;
}

/** Exports copies at original size, without touching a document or following paths outside its workspace. */
export class WorkspaceImageExporter {
	readonly #paths: WorkspacePaths;

	constructor(workspaces: readonly ExportWorkspace[]) {
		this.#paths = new WorkspacePaths(workspaces, { noWorkspace: NO_WORKSPACE_MESSAGE, outside: OUTSIDE_WORKSPACE_MESSAGE });
	}

	/**
	 * Writes a PNG, or an SVG for a path ending in .svg when the image can be
	 * written as one, without saving the document.
	 */
	async export(
		request: ImageExportRequest,
		sourcePath: string | undefined,
		picture: () => Promise<OpenImageView>,
		vector?: () => Promise<VectorPicture>,
	): Promise<ImageExportResult> {
		const path = request.path.trim();
		if (!path || path.includes('\0')) throw new Error('Choose a PNG file path.');
		const svg = vector !== undefined && isSvgFileName(path);
		if (!svg && !hasValidExtension(path, ImageMimeType.Png))
			throw new Error(`PNG exports must use the ${PNG_EXTENSION} extension.`);
		const target = await this.safeTarget({ ...request, path }, sourcePath);
		if (svg) return this.writeSvg(target, request, await vector());
		const view = await picture();
		if (view.width !== view.imageWidth || view.height !== view.imageHeight)
			throw new Error('The export must use the original image size.');
		await writeCopy(target.real, view.png, request.overwrite);
		return {
			path: target.destination,
			format: ImageExtension.Png,
			width: view.width,
			height: view.height,
			bytesWritten: view.png.byteLength,
		};
	}

	private async writeSvg(target: SafeTarget, request: ImageExportRequest, picture: VectorPicture): Promise<ImageExportResult> {
		const contents = new TextEncoder().encode(picture.markup);
		await writeCopy(target.real, contents, request.overwrite);
		return { path: target.destination, format: SVG_EXTENSION, width: picture.width, height: picture.height, bytesWritten: contents.byteLength };
	}

	/** Where to write inside the workspace, with any missing folders made, never through a link leading outside. */
	private async safeTarget(request: ImageExportRequest, sourcePath: string | undefined): Promise<SafeTarget> {
		const path = request.path.trim();
		const workspace = this.#paths.workspaceFor({ ...request, path }, sourcePath);
		const destination = resolve(workspace.path, path);
		if (!containsPath(workspace.path, destination)) throw new Error(OUTSIDE_WORKSPACE_MESSAGE);

		const root = await realpath(workspace.path);
		const parent = dirname(destination);
		// Check the nearest existing parent before mkdir, so a linked directory
		// cannot create even an empty directory outside the workspace.
		if (!containsPath(root, await existingParent(parent))) throw new Error(OUTSIDE_WORKSPACE_MESSAGE);
		await mkdir(parent, { recursive: true });
		const realParent = await realpath(parent);
		if (!containsPath(root, realParent)) throw new Error(OUTSIDE_WORKSPACE_MESSAGE);
		return { destination, real: join(realParent, basename(destination)) };
	}
}

/** Publish complete contents atomically; link refuses collisions even between concurrent clients. */
async function writeCopy(target: string, contents: Uint8Array, overwrite: boolean): Promise<void> {
	const temporary = join(dirname(target), `.little-image-editor-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, contents, { flag: 'wx' });
		if (overwrite) await rename(temporary, target);
		else await link(temporary, target);
	} catch (error) {
		if (hasCode(error, FileErrorCode.Exists))
			throw new Error(`${target} already exists. Choose another name or explicitly request overwrite.`);
		throw error;
	} finally {
		await unlink(temporary).catch((error: unknown) => {
			if (!hasCode(error, FileErrorCode.Missing)) throw error;
		});
	}
}
