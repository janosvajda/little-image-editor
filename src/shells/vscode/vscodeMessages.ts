/**
 * Messages between the VS Code extension and the editor in its webview.
 * Both sides import this file, so the protocol has one definition.
 */

import type {
	AssistantCommand,
	AssistantResult,
	NewImageSpec,
} from '../../app/features/assistant/assistantCommandTypes';

/** The target the opened file is written through; picked locations get their own ids. */
export const DOCUMENT_TARGET_ID = 'document';

export const HostMessageType = {
	Open: 'open',
	/** A new, untitled file: the editor starts a new image for it. */
	Create: 'create',
	Save: 'save',
	Reply: 'reply',
	/** Asks for a picture of the whole image, for an assistant to look at. */
	View: 'view',
	/** An assistant's edit for the editor to carry out. */
	Command: 'command',
} as const;

export const WebviewMessageType = {
	Ready: 'ready',
	Changed: 'changed',
	Saved: 'saved',
	Write: 'write',
	PickSaveTarget: 'pickSaveTarget',
	Download: 'download',
	Confirm: 'confirm',
	Prompt: 'prompt',
	Alert: 'alert',
	CopyText: 'copyText',
	StorePreference: 'storePreference',
	/** The picture asked for with a view message, or why there is none. */
	Viewed: 'viewed',
	/** The outcome of a command message, or why it failed. */
	CommandDone: 'commandDone',
} as const;

/** File contents as sent between the extension and the webview. */
export type FileBytes = Uint8Array<ArrayBuffer>;

/**
 * File contents in a buffer of their own. A view into a larger buffer, as
 * VS Code's file reads can return, must not be sent as it is: the receiver
 * could get the whole buffer and read bytes that are not the file's.
 */
export function ownedFileBytes(contents: Uint8Array): FileBytes {
	return new Uint8Array(contents);
}

/**
 * File contents as they arrive: typed arrays and buffers are cloned, while
 * an older message channel may turn them into plain arrays or objects.
 */
export function receivedFileBytes(value: unknown): FileBytes {
	if (value instanceof Uint8Array) return ownedFileBytes(value);
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (Array.isArray(value)) return Uint8Array.from(value as number[]);
	if (typeof value === 'object' && value !== null)
		return Uint8Array.from(Object.values(value as Record<string, number>));
	return new Uint8Array();
}

export interface PickerFileFilter {
	readonly description: string;
	readonly extensions: readonly string[];
}

export interface PickedSaveTarget {
	readonly targetId: string;
	readonly name: string;
}

export type HostMessage =
	| Readonly<{
			type: typeof HostMessageType.Open;
			fileName: string;
			contents: FileBytes;
	  }>
	| Readonly<{
			type: typeof HostMessageType.Create;
			fileName: string;
			/** Given when an assistant made the file: the editor creates it without asking. */
			image?: NewImageSpec;
	  }>
	| Readonly<{
			type: typeof HostMessageType.Save;
			requestId: number;
			/** The file saved into, whose extension decides the format; absent, the opened file. */
			fileName?: string;
	  }>
	| Readonly<{
			type: typeof HostMessageType.Reply;
			requestId: number;
			value: boolean | string | PickedSaveTarget | null;
	  }>
	| Readonly<{
			type: typeof HostMessageType.View;
			requestId: number;
			/** The picture's longer side is at most this many pixels. */
			maxSize: number;
	  }>
	| Readonly<{
			type: typeof HostMessageType.Command;
			requestId: number;
			command: AssistantCommand;
	  }>;

/** A picture of the whole image as PNG, and the sizes of the picture and of the image itself. */
export interface ViewedImage {
	readonly contents: FileBytes;
	readonly width: number;
	readonly height: number;
	readonly imageWidth: number;
	readonly imageHeight: number;
}

export type WebviewMessage =
	| Readonly<{ type: typeof WebviewMessageType.Ready }>
	| Readonly<{ type: typeof WebviewMessageType.Changed }>
	| Readonly<{
			type: typeof WebviewMessageType.Saved;
			requestId: number;
			error?: string;
	  }>
	| Readonly<{
			type: typeof WebviewMessageType.Write;
			requestId: number;
			targetId: string;
			contents: FileBytes;
	  }>
	| Readonly<{
			type: typeof WebviewMessageType.PickSaveTarget;
			requestId: number;
			suggestedName: string;
			filters: readonly PickerFileFilter[];
	  }>
	| Readonly<{
			type: typeof WebviewMessageType.Download;
			fileName: string;
			contents: FileBytes;
	  }>
	| Readonly<{
			type: typeof WebviewMessageType.Confirm;
			requestId: number;
			message: string;
	  }>
	| Readonly<{
			type: typeof WebviewMessageType.Prompt;
			requestId: number;
			message: string;
			defaultValue: string;
	  }>
	| Readonly<{ type: typeof WebviewMessageType.Alert; message: string }>
	| Readonly<{ type: typeof WebviewMessageType.CopyText; text: string }>
	| Readonly<{
			type: typeof WebviewMessageType.StorePreference;
			key: string;
			value: string | null;
	  }>
	| (Readonly<{ type: typeof WebviewMessageType.Viewed; requestId: number }> &
			(Readonly<{ image: ViewedImage }> | Readonly<{ error: string }>))
	| (Readonly<{ type: typeof WebviewMessageType.CommandDone; requestId: number }> &
			(Readonly<{ result: AssistantResult }> | Readonly<{ error: string }>));

export type ReplyValue = Extract<
	HostMessage,
	{ type: typeof HostMessageType.Reply }
>['value'];

export function isPickedSaveTarget(value: ReplyValue): value is PickedSaveTarget {
	return typeof value === 'object' && value !== null && 'targetId' in value;
}

/** The webview's saved preferences, handed over in the page so they are ready before the editor starts. */
export const PREFERENCES_META_NAME = 'little-editor-preferences';
