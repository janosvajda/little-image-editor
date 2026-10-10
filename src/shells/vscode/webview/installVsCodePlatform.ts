import { installEditorPlatform } from '../../../app/platform/editorPlatform';
import { WebviewMessageType } from '../vscodeMessages';
import { createVsCodePlatform, type VsCodeWebviewApi } from './vscodePlatform';

declare function acquireVsCodeApi(): VsCodeWebviewApi;

const api = acquireVsCodeApi();
installEditorPlatform(createVsCodePlatform(api));
document.documentElement.dataset.host = 'vscode';
// Asked for once the editor below has registered for the file.
queueMicrotask(() => api.postMessage({ type: WebviewMessageType.Ready }));
