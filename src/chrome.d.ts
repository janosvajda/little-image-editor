declare namespace chrome {
	type ChromeEvent<T extends (...args: never[]) => unknown> = {
		addListener(callback: T): void;
	};

	namespace action {
		const onClicked: ChromeEvent<(tab: tabs.Tab) => void>;
	}
	namespace tabs {
		interface Tab {
			id?: number;
			windowId?: number;
		}
		function create(options: { url: string }): Promise<Tab>;
		function captureVisibleTab(
			windowId?: number,
			options?: { format?: 'png' | 'jpeg'; quality?: number },
		): Promise<string>;
	}
	namespace runtime {
		function getURL(path: string): string;
	}
	namespace contextMenus {
		interface OnClickData {
			menuItemId: string | number;
			srcUrl?: string;
		}
		const onClicked: ChromeEvent<(info: OnClickData, tab?: tabs.Tab) => void>;
		function create(properties: {
			id: string;
			title: string;
			contexts?: string[];
		}): string | number;
		function removeAll(): Promise<void>;
	}
	namespace commands {
		const onCommand: ChromeEvent<(command: string, tab?: tabs.Tab) => void>;
	}
	namespace scripting {
		interface InjectionResult<T> {
			frameId: number;
			result?: T;
		}
		function executeScript<T, A extends unknown[]>(injection: {
			target: { tabId: number };
			func: (...args: A) => T | Promise<T>;
			args?: A;
		}): Promise<InjectionResult<Awaited<T>>[]>;
	}
}

interface ClipboardItemOptions {
	[mimeType: string]: Blob;
}
declare const ClipboardItem: {
	prototype: ClipboardItem;
	new (items: ClipboardItemOptions): ClipboardItem;
};
