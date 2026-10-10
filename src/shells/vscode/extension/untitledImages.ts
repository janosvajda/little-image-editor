import * as vscode from 'vscode';
import { fileNameOf, UNTITLED_SCHEME } from './editorSession';

/** Must match the image view type in `contributes.customEditors` of the extension manifest. */
export const IMAGE_VIEW_TYPE = 'littleImageEditor.image';
const OPEN_WITH_COMMAND = 'vscode.openWith';
const FILE_SCHEME = 'file';
const DEFAULT_NAME = 'Untitled';
const DEFAULT_EXTENSION = 'png';
const EXTENSION_SEPARATOR = '.';

/**
 * The address of a new, unsaved image: beside a folder when one is given,
 * where Save then suggests writing it, under a name no open tab has yet.
 */
export function untitledImageUri(folder: vscode.Uri | undefined, requestedName?: string): vscode.Uri {
	const fileName = freeName(requestedName);
	return folder?.scheme === FILE_SCHEME
		? vscode.Uri.joinPath(folder, fileName).with({ scheme: UNTITLED_SCHEME })
		: vscode.Uri.from({ scheme: UNTITLED_SCHEME, path: fileName });
}

/** Opens an untitled image in Little Image Editor. */
export async function openUntitledImage(uri: vscode.Uri): Promise<void> {
	await vscode.commands.executeCommand(OPEN_WITH_COMMAND, uri, IMAGE_VIEW_TYPE);
}

/**
 * The requested name, or Untitled, with an image extension, numbered when an
 * open untitled tab already has it: Untitled-1.png, apple.png, apple-2.png.
 */
function freeName(requestedName: string | undefined): string {
	const requested = requestedName?.split(/[\\/]/).at(-1)?.trim();
	const [base, extension] = splitName(requested || DEFAULT_NAME);
	const taken = openUntitledNames();
	const numbered = (number: number) => `${base}-${number}${EXTENSION_SEPARATOR}${extension}`;
	if (requested) {
		const plain = `${base}${EXTENSION_SEPARATOR}${extension}`;
		if (!taken.has(plain)) return plain;
	}
	for (let number = requested ? 2 : 1; ; number++) if (!taken.has(numbered(number))) return numbered(number);
}

function splitName(name: string): readonly [string, string] {
	const separator = name.lastIndexOf(EXTENSION_SEPARATOR);
	return separator > 0
		? [name.slice(0, separator), name.slice(separator + 1)]
		: [name, DEFAULT_EXTENSION];
}

function openUntitledNames(): ReadonlySet<string> {
	return new Set(
		vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.map((tab) => tab.input)
			.filter((input): input is vscode.TabInputCustom => input instanceof vscode.TabInputCustom)
			.filter((input) => input.uri.scheme === UNTITLED_SCHEME)
			.map((input) => fileNameOf(input.uri)),
	);
}
