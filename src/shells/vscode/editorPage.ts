import { PREFERENCES_META_NAME } from './vscodeMessages';

/** The webview bundle that replaces the web page's own script. */
export const VSCODE_EDITOR_SCRIPT = 'vscodeEditor.js';

export interface EditorPageOptions {
	/** Where the page's relative files are served from, ending with a slash. */
	readonly baseUrl: string;
	/** The origin allowed to serve images, styles and fonts. */
	readonly resourceSource: string;
	readonly nonce: string;
	readonly preferences: Readonly<Record<string, string>>;
}

/**
 * Turns the built editor page into the webview page: files load from the
 * extension, only the nonced editor script may run, and the saved
 * preferences are ready before the editor starts.
 */
export function vscodeEditorPage(source: string, options: EditorPageOptions): string {
	const policy = [
		"default-src 'none'",
		`img-src ${options.resourceSource} data: blob:`,
		`style-src ${options.resourceSource} 'unsafe-inline'`,
		`font-src ${options.resourceSource}`,
		`script-src 'nonce-${options.nonce}'`,
	].join('; ');
	const head = [
		`<base href="${options.baseUrl}">`,
		`<meta http-equiv="Content-Security-Policy" content="${policy}">`,
		`<meta name="${PREFERENCES_META_NAME}" content="${escapeAttribute(JSON.stringify(options.preferences))}">`,
	].join('');
	return source
		.replace('<head>', `<head>${head}`)
		.replace(
			/<script type="module" src="[^"]+"><\/script>/,
			`<script type="module" nonce="${options.nonce}" src="${VSCODE_EDITOR_SCRIPT}"></script>`,
		);
}

function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;');
}
