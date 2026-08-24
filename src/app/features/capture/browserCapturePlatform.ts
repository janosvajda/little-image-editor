export interface BrowserTab {
	id?: number;
	windowId?: number;
}

export interface BrowserMenuClick {
	menuItemId: string | number;
	srcUrl?: string;
}

export interface BrowserContextMenu {
	id: string;
	title: string;
	contexts: string[];
}

export interface BrowserCapturePlatform {
	onAction(listener: (tab: BrowserTab) => void): void;
	onContextMenu(
		listener: (info: BrowserMenuClick, tab?: BrowserTab) => void,
	): void;
	onCommand(listener: (command: string, tab?: BrowserTab) => void): void;
	replaceContextMenus(items: BrowserContextMenu[]): Promise<void>;
	executeInTab<T, A extends unknown[]>(
		tabId: number,
		func: (...args: A) => T | Promise<T>,
		args: A,
	): Promise<Awaited<T> | null>;
	captureVisibleTab(windowId: number): Promise<Blob>;
	openTab(url: string): Promise<void>;
	extensionUrl(path: string): string;
	createId(): string;
}
