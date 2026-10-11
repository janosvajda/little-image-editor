import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** A workspace folder files are read from and written to. */
export interface ExportWorkspace {
	readonly name: string;
	readonly path: string;
}

/** Where a file in a workspace is asked for: its path, and the folder by name in a multi-root window. */
export interface WorkspaceFileRequest {
	readonly path: string;
	readonly workspace?: string;
}

/** What a caller says when there is no workspace, or a path leads outside it. */
export interface WorkspaceMessages {
	readonly noWorkspace: string;
	readonly outside: string;
}

const FileErrorCode = { Missing: 'ENOENT' } as const;

/**
 * Finds files in the open workspace folders, for assistants that read or
 * write them: a relative path belongs to the only folder, the one named, or
 * the one the open image is in; an absolute path must be inside one. Nothing
 * outside the folders is reached, links included.
 */
export class WorkspacePaths {
	constructor(
		private readonly workspaces: readonly ExportWorkspace[],
		private readonly messages: WorkspaceMessages,
	) {}

	/** The folder a requested path belongs to. */
	workspaceFor(request: WorkspaceFileRequest, sourcePath: string | undefined): ExportWorkspace {
		if (!this.workspaces.length) throw new Error(this.messages.noWorkspace);
		const selected = request.workspace
			? this.workspaces.filter(({ name, path }) => name === request.workspace || path === request.workspace)
			: this.workspaces;
		if (!selected.length) throw new Error(`No workspace folder is called ${request.workspace}.`);
		if (isAbsolute(request.path)) {
			const match = mostSpecificWorkspace(selected, request.path);
			if (!match) throw new Error(this.messages.outside);
			return match;
		}
		if (selected.length === 1) return selected[0]!;
		const match = sourcePath && mostSpecificWorkspace(selected, sourcePath);
		if (match) return match;
		throw new Error(`Choose a workspace folder with workspace: ${selected.map(({ name }) => name).join(', ')}.`);
	}

	/** An existing file's real path, which must be inside its folder even after following links. */
	async existingFile(request: WorkspaceFileRequest, sourcePath: string | undefined): Promise<string> {
		const workspace = this.workspaceFor(request, sourcePath);
		const requested = resolve(workspace.path, request.path);
		if (!containsPath(workspace.path, requested)) throw new Error(this.messages.outside);
		const [root, real] = await Promise.all([realpath(workspace.path), realpath(requested)]);
		if (!containsPath(root, real)) throw new Error(this.messages.outside);
		return real;
	}
}

export function containsPath(root: string, path: string): boolean {
	const remainder = relative(resolve(root), resolve(path));
	return remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder);
}

function mostSpecificWorkspace(workspaces: readonly ExportWorkspace[], path: string): ExportWorkspace | undefined {
	return workspaces.filter((workspace) => containsPath(workspace.path, path)).sort((left, right) => right.path.length - left.path.length)[0];
}

/** The nearest folder on the way up that exists, by its real path. */
export async function existingParent(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (!hasCode(error, FileErrorCode.Missing) || dirname(path) === path) throw error;
		return existingParent(dirname(path));
	}
}

export function hasCode(error: unknown, code: string): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
