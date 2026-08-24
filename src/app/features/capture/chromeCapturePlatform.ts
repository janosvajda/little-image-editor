import type {
	BrowserCapturePlatform,
	BrowserContextMenu,
	BrowserMenuClick,
	BrowserTab,
} from './browserCapturePlatform';

export class ChromeCapturePlatform implements BrowserCapturePlatform {
	onAction(listener: (tab: BrowserTab) => void): void {
		chrome.action.onClicked.addListener(listener);
	}
	onContextMenu(
		listener: (info: BrowserMenuClick, tab?: BrowserTab) => void,
	): void {
		chrome.contextMenus.onClicked.addListener(listener);
	}
	onCommand(listener: (command: string, tab?: BrowserTab) => void): void {
		chrome.commands.onCommand.addListener(listener);
	}

	async replaceContextMenus(items: BrowserContextMenu[]): Promise<void> {
		await chrome.contextMenus.removeAll();
		items.forEach((item) => chrome.contextMenus.create(item));
	}

	async executeInTab<T, A extends unknown[]>(
		tabId: number,
		func: (...args: A) => T | Promise<T>,
		args: A,
	): Promise<Awaited<T> | null> {
		try {
			const [injection] = await chrome.scripting.executeScript({
				target: { tabId },
				func,
				args,
			});
			return injection?.result ?? null;
		} catch {
			return null;
		}
	}

	async captureVisibleTab(windowId: number): Promise<Blob> {
		const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
			format: 'png',
		});
		return (await fetch(dataUrl)).blob();
	}

	async openTab(url: string): Promise<void> {
		await chrome.tabs.create({ url });
	}
	extensionUrl(path: string): string {
		return chrome.runtime.getURL(path);
	}
	createId(): string {
		return crypto.randomUUID();
	}
}
