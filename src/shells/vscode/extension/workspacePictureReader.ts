import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { isPictureFileName } from '../../../app/core/document/pictureFormats';
import { type ExportWorkspace, WorkspacePaths, type WorkspaceFileRequest } from './workspacePaths';

/** A picture file read from the workspace, with its name, which says its format. */
export interface WorkspacePicture {
	readonly fileName: string;
	readonly bytes: Uint8Array;
}

const OUTSIDE_WORKSPACE_MESSAGE = 'Place a picture from inside an open workspace folder.';
const NO_WORKSPACE_MESSAGE = 'Open a local workspace folder before placing a picture from it.';
const NOT_A_PICTURE_MESSAGE = 'Place a PNG, JPEG, WebP or SVG image.';
const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
const MAX_PLACED_PICTURE_MEGABYTES = 64;
/** A picture larger than this is refused before it is read, so an assistant cannot hand the editor a huge file. */
export const MAX_PLACED_PICTURE_BYTES = MAX_PLACED_PICTURE_MEGABYTES * BYTES_PER_MEGABYTE;

/** Reads picture files for assistants, only from the open workspace folders, never through links leading outside. */
export class WorkspacePictureReader {
	readonly #paths: WorkspacePaths;

	constructor(workspaces: readonly ExportWorkspace[]) {
		this.#paths = new WorkspacePaths(workspaces, { noWorkspace: NO_WORKSPACE_MESSAGE, outside: OUTSIDE_WORKSPACE_MESSAGE });
	}

	async read(request: WorkspaceFileRequest, sourcePath: string | undefined): Promise<WorkspacePicture> {
		if (!isPictureFileName(request.path)) throw new Error(NOT_A_PICTURE_MESSAGE);
		const path = await this.#paths.existingFile(request, sourcePath);
		if ((await stat(path)).size > MAX_PLACED_PICTURE_BYTES)
			throw new Error(`The picture is larger than ${MAX_PLACED_PICTURE_MEGABYTES} MB.`);
		return { fileName: basename(path), bytes: new Uint8Array(await readFile(path)) };
	}
}
