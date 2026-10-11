import { randomUUID } from 'node:crypto';
import { link, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ImageMimeType } from '../../../app/core/document/appTypes';
import { ImageExtension } from '../../../app/core/document/imageFormats';
import { hasValidExtension } from '../../../app/features/files/fileNameHelpers';
import type { ImageExportRequest, ImageExportResult, OpenImageView } from '../assistant/openImages';

export interface ExportWorkspace {
	readonly name: string;
	readonly path: string;
}

const OUTSIDE_WORKSPACE_MESSAGE = 'Export the PNG inside an open workspace folder.';
const PNG_EXTENSION = `.${ImageExtension.Png}`;
const FileErrorCode = { Missing: 'ENOENT', Exists: 'EEXIST' } as const;

/** Exports copies at original size, without touching a document or following paths outside its workspace. */
export class WorkspaceImageExporter {
	constructor(private readonly workspaces: readonly ExportWorkspace[]) {}

	async export(
		request: ImageExportRequest,
		sourcePath: string | undefined,
		picture: () => Promise<OpenImageView>,
	): Promise<ImageExportResult> {
		const path = request.path.trim();
		if (!path || path.includes('\0')) throw new Error('Choose a PNG file path.');
		if (!hasValidExtension(path, ImageMimeType.Png))
			throw new Error(`PNG exports must use the ${PNG_EXTENSION} extension.`);
		const workspace = this.workspaceFor({ ...request, path }, sourcePath);
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
		const target = join(realParent, basename(destination));
		const view = await picture();
		if (view.width !== view.imageWidth || view.height !== view.imageHeight)
			throw new Error('The export must use the original image size.');
		await writeCopy(target, view.png, request.overwrite);
		return {
			path: destination,
			format: ImageExtension.Png,
			width: view.width,
			height: view.height,
			bytesWritten: view.png.byteLength,
		};
	}

	private workspaceFor(request: ImageExportRequest, sourcePath: string | undefined): ExportWorkspace {
		if (!this.workspaces.length) throw new Error('Open a local workspace folder before exporting an image.');
		const selected = request.workspace
			? this.workspaces.filter(({ name, path }) => name === request.workspace || path === request.workspace)
			: this.workspaces;
		if (!selected.length) throw new Error(`No workspace folder is called ${request.workspace}.`);
		if (isAbsolute(request.path)) {
			const match = mostSpecificWorkspace(selected, request.path);
			if (!match) throw new Error(OUTSIDE_WORKSPACE_MESSAGE);
			return match;
		}
		if (selected.length === 1) return selected[0]!;
		const match = sourcePath && mostSpecificWorkspace(selected, sourcePath);
		if (match) return match;
		throw new Error(`Choose a workspace folder with workspace: ${selected.map(({ name }) => name).join(', ')}.`);
	}
}

function containsPath(root: string, path: string): boolean {
	const remainder = relative(resolve(root), resolve(path));
	return remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder);
}

function mostSpecificWorkspace(workspaces: readonly ExportWorkspace[], path: string): ExportWorkspace | undefined {
	return workspaces.filter((workspace) => containsPath(workspace.path, path))
		.sort((left, right) => right.path.length - left.path.length)[0];
}

async function existingParent(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (!hasCode(error, FileErrorCode.Missing) || dirname(path) === path) throw error;
		return existingParent(dirname(path));
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

function hasCode(error: unknown, code: string): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
