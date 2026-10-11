import { ImageMimeType } from '../core/document/appTypes';

/** Puts a PNG on the system clipboard; every page the editor runs in can, VS Code's webview included. */
export function writeImageToClipboard(png: Blob): Promise<void> {
	return navigator.clipboard.write([new ClipboardItem({ [ImageMimeType.Png]: png })]);
}
