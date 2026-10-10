import type * as vscode from 'vscode';
import type {
	AssistantCommand,
	AssistantResult,
} from '../../../app/features/assistant/assistantCommandTypes';
import {
	DOCUMENT_TARGET_ID,
	type HostMessage,
	HostMessageType,
	type ReplyValue,
	type ViewedImage,
	type WebviewMessage,
	type WebviewMessageType,
} from '../vscodeMessages';

/** A file VS Code holds before its first save; Save then asks where to write it. */
export const UNTITLED_SCHEME = 'untitled';
/** How long the page may take to answer before the request is given up, for example when it has stopped. */
const ANSWER_TIMEOUT_MS = 15_000;
const ANSWER_TIMEOUT_MESSAGE = 'The image editor did not answer in time.';

export function fileNameOf(uri: vscode.Uri): string {
	return uri.path.split('/').at(-1) ?? '';
}

export class EditorDocument implements vscode.CustomDocument {
	/** Where Save writes; changed by Save As. */
	destination: vscode.Uri;

	constructor(readonly uri: vscode.Uri) {
		this.destination = uri;
	}

	get isUntitled(): boolean {
		return this.uri.scheme === UNTITLED_SCHEME;
	}

	get name(): string {
		return fileNameOf(this.uri);
	}

	dispose(): void {}
}

/** The page's answers to the extension's requests: a value, or why there is none. */
type AnswerMessage = Extract<
	WebviewMessage,
	{ type: typeof WebviewMessageType.Viewed | typeof WebviewMessageType.CommandDone }
>;

/** One open editor: its page, and the requests the page is waiting on. */
export class EditorSession {
	readonly #pendingSaves = new Map<number, (error?: string) => void>();
	readonly #pendingAnswers = new Map<number, (message: AnswerMessage) => void>();
	readonly #savedTargets = new Map<string, vscode.Uri>();
	#nextRequestId = 0;
	#markReady!: () => void;
	/** Settles once the page has started and been handed its file. */
	readonly ready = new Promise<void>((resolve) => {
		this.#markReady = resolve;
	});

	constructor(
		readonly document: EditorDocument,
		readonly panel: vscode.WebviewPanel,
	) {}

	/** The page has its file, so requests reach a started editor. */
	opened(): void {
		this.#markReady();
	}

	post(message: HostMessage): void {
		void this.panel.webview.postMessage(message);
	}

	reply(requestId: number, value: ReplyValue): void {
		this.post({ type: HostMessageType.Reply, requestId, value });
	}

	/** Asks the page to save into the document's destination; resolves when the file has been written. */
	save(): Promise<void> {
		const requestId = this.#nextRequestId++;
		return new Promise((resolve, reject) => {
			this.#pendingSaves.set(requestId, (error) =>
				error ? reject(new Error(error)) : resolve(),
			);
			this.post({
				type: HostMessageType.Save,
				requestId,
				fileName: fileNameOf(this.document.destination),
			});
		});
	}

	finishSave(requestId: number, error?: string): void {
		this.#pendingSaves.get(requestId)?.(error);
		this.#pendingSaves.delete(requestId);
	}

	/** Asks the page for a picture of the whole image, its longer side at most `maxSize` pixels. */
	async view(maxSize: number): Promise<ViewedImage> {
		const answer = await this.ask((requestId) => ({ type: HostMessageType.View, requestId, maxSize }));
		if ('image' in answer) return answer.image;
		throw new Error('error' in answer ? answer.error : ANSWER_TIMEOUT_MESSAGE);
	}

	/** Has the page carry out an assistant's command. */
	async command(command: AssistantCommand): Promise<AssistantResult> {
		const answer = await this.ask((requestId) => ({ type: HostMessageType.Command, requestId, command }));
		if ('result' in answer) return answer.result;
		throw new Error('error' in answer ? answer.error : ANSWER_TIMEOUT_MESSAGE);
	}

	/** Settles the request a page's answer belongs to. */
	answer(message: AnswerMessage): void {
		this.#pendingAnswers.get(message.requestId)?.(message);
		this.#pendingAnswers.delete(message.requestId);
	}

	/** Sends a request once the page is ready, and waits for its answer. */
	private async ask(request: (requestId: number) => HostMessage): Promise<AnswerMessage> {
		await this.ready;
		const requestId = this.#nextRequestId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pendingAnswers.delete(requestId);
				reject(new Error(ANSWER_TIMEOUT_MESSAGE));
			}, ANSWER_TIMEOUT_MS);
			this.#pendingAnswers.set(requestId, (message) => {
				clearTimeout(timeout);
				resolve(message);
			});
			this.post(request(requestId));
		});
	}

	rememberTarget(uri: vscode.Uri): string {
		const targetId = uri.toString();
		this.#savedTargets.set(targetId, uri);
		return targetId;
	}

	targetUri(targetId: string): vscode.Uri | undefined {
		return targetId === DOCUMENT_TARGET_ID
			? this.document.destination
			: this.#savedTargets.get(targetId);
	}
}
