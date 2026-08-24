import type { ToolbarPanelState } from './managedToolbarPanel';

export type ToolbarLayout = Readonly<Record<string, ToolbarPanelState>>;

export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const TOOLBAR_LAYOUT_STORAGE_KEY = 'little-editor.panel-layout.v2';

export class ToolbarLayoutStore {
	constructor(
		private readonly storage: KeyValueStorage = localStorage,
		private readonly storageKey = TOOLBAR_LAYOUT_STORAGE_KEY,
	) {}

	load(): ToolbarLayout {
		try {
			const value: unknown = JSON.parse(
				this.storage.getItem(this.storageKey) ?? '{}',
			);
			return isLayout(value) ? value : {};
		} catch {
			return {};
		}
	}

	save(layout: ToolbarLayout): void {
		this.storage.setItem(this.storageKey, JSON.stringify(layout));
	}

	clear(): void {
		this.storage.removeItem(this.storageKey);
	}
}

function isLayout(value: unknown): value is ToolbarLayout {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
