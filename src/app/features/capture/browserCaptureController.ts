import { captureFileName } from './browserCaptureHelpers';
import { ColorPalette } from '../../core/document/colorPalette';
import { QA_REPORTING_TITLE } from '../annotations/bugReportMetadata';
import type { PendingBrowserCapture } from '../../core/document/browserCapture';
import type { BrowserCaptureStore } from './browserCaptureStore';
import {
	locateRenderedImage,
	readCaptureSource,
	readPageViewport,
	selectPageRegion,
} from './browserPageCapture';
import type {
	BrowserCapturePlatform,
	BrowserContextMenu,
	BrowserMenuClick,
	BrowserTab,
} from './browserCapturePlatform';

export const BROWSER_CAPTURE_MENU_IDS = {
	editImage: 'edit-image',
	capturePage: 'capture-page',
	captureRegion: 'capture-region',
	bugReport: 'bug-report-screenshot',
} as const;

const CAPTURE_REGION_COMMAND = 'capture-selected-region';
const CORE_CONTEXT_MENUS: BrowserContextMenu[] = [
	{
		id: BROWSER_CAPTURE_MENU_IDS.editImage,
		title: 'Edit in Little Image Editor',
		contexts: ['image'],
	},
	{
		id: BROWSER_CAPTURE_MENU_IDS.capturePage,
		title: 'Capture visible area',
		contexts: ['page'],
	},
	{
		id: BROWSER_CAPTURE_MENU_IDS.captureRegion,
		title: 'Capture selected region',
		contexts: ['page', 'image'],
	},
];
const BUG_REPORT_MENU: BrowserContextMenu = {
	id: BROWSER_CAPTURE_MENU_IDS.bugReport,
	title: QA_REPORTING_TITLE,
	contexts: ['page', 'image'],
};

type CaptureStore = Pick<BrowserCaptureStore, 'put'>;

export class BrowserCaptureController {
	constructor(
		private readonly platform: BrowserCapturePlatform,
		private readonly store: CaptureStore,
	) {}

	async start(): Promise<void> {
		this.platform.onAction(() => {
			void this.openEditor();
		});
		this.platform.onContextMenu((info, tab) => {
			void this.handleContextMenu(info, tab);
		});
		this.platform.onCommand((command, tab) => {
			if (command === CAPTURE_REGION_COMMAND) void this.captureRegion(tab);
		});
		// Keep core menu registration an independently verifiable compatibility contract,
		// then publish the complete set including optional workflows.
		await this.platform.replaceContextMenus(CORE_CONTEXT_MENUS);
		await this.platform.replaceContextMenus([
			...CORE_CONTEXT_MENUS,
			BUG_REPORT_MENU,
		]);
	}

	private async handleContextMenu(
		info: BrowserMenuClick,
		tab?: BrowserTab,
	): Promise<void> {
		if (info.menuItemId === BROWSER_CAPTURE_MENU_IDS.editImage && info.srcUrl)
			await this.captureImage(tab, info.srcUrl);
		else if (info.menuItemId === BROWSER_CAPTURE_MENU_IDS.capturePage)
			await this.capturePage(tab);
		else if (info.menuItemId === BROWSER_CAPTURE_MENU_IDS.captureRegion)
			await this.captureRegion(tab);
		else if (info.menuItemId === BROWSER_CAPTURE_MENU_IDS.bugReport)
			await this.captureForAnnotation(tab);
	}

	private async captureForAnnotation(tab?: BrowserTab): Promise<void> {
		const source = await this.execute(tab, readCaptureSource);
		if (source)
			await this.persistScreenshot(
				tab,
				{
					name: captureFileName('bug-report'),
					viewport: source.viewport,
					source,
				},
				'annotate',
			);
	}

	private async capturePage(tab?: BrowserTab): Promise<void> {
		const viewport = await this.execute(tab, readPageViewport);
		if (viewport)
			await this.persistScreenshot(tab, {
				name: captureFileName('page'),
				viewport,
			});
	}

	private async captureImage(
		tab: BrowserTab | undefined,
		sourceUrl: string,
	): Promise<void> {
		const geometry = await this.execute(tab, locateRenderedImage, sourceUrl);
		if (geometry)
			await this.persistScreenshot(tab, {
				name: captureFileName('image'),
				...geometry,
			});
	}

	private async captureRegion(tab?: BrowserTab): Promise<void> {
		const geometry = await this.execute(tab, selectPageRegion, ColorPalette);
		if (geometry)
			await this.persistScreenshot(tab, {
				name: captureFileName('region'),
				...geometry,
			});
	}

	private async persistScreenshot(
		tab: BrowserTab | undefined,
		metadata: Omit<PendingBrowserCapture, 'blob'>,
		mode?: string,
	): Promise<void> {
		if (tab?.windowId === undefined) return;
		const source = metadata.source ?? await this.execute(tab, readCaptureSource);
		const blob = await this.platform.captureVisibleTab(tab.windowId);
		const id = this.platform.createId();
		await this.store.put(id, { blob, ...metadata, ...(source ? { source } : {}) });
		await this.openEditor(id, mode);
	}

	private async openEditor(captureId?: string, mode?: string): Promise<void> {
		const parameters = new URLSearchParams();
		if (captureId) parameters.set('capture', captureId);
		if (mode) parameters.set('mode', mode);
		const suffix = parameters.size ? `?${parameters}` : '';
		await this.platform.openTab(
			this.platform.extensionUrl(`editor.html${suffix}`),
		);
	}

	private execute<T, A extends unknown[]>(
		tab: BrowserTab | undefined,
		func: (...args: A) => T | Promise<T>,
		...args: A
	): Promise<Awaited<T> | null> {
		return tab?.id === undefined
			? Promise.resolve(null)
			: this.platform.executeInTab(tab.id, func, args);
	}
}
