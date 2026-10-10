import { describe, expect, it, vi } from 'vitest';
import type { CaptureSourceMetadata, PendingBrowserCapture } from '../../core/document/browserCapture';
import { ImageMimeType } from '../../core/document/appTypes';
import type { BrowserCapturePlatform, BrowserMenuClick, BrowserTab } from './browserCapturePlatform';
import { BROWSER_CAPTURE_MENU_IDS, BrowserCaptureController } from './browserCaptureController';
import { locateRenderedImage, readCaptureSource, readPageViewport, selectPageRegion } from './browserPageCapture';

const Source: CaptureSourceMetadata = { url: 'https://application.example/checkout', capturedAt: '2026-10-10T10:00:00Z', userAgent: 'QA browser / OS', viewport: { width: 1200, height: 800 } };
const Geometry = { crop: { x: 20, y: 30, width: 50, height: 60 }, viewport: Source.viewport };

describe('every browser screenshot records its original page', () => {
	it.each([BROWSER_CAPTURE_MENU_IDS.capturePage, BROWSER_CAPTURE_MENU_IDS.editImage, BROWSER_CAPTURE_MENU_IDS.captureRegion, BROWSER_CAPTURE_MENU_IDS.bugReport])('records source metadata for %s', async (menuItemId) => {
		let menu: ((info: BrowserMenuClick, tab?: BrowserTab) => void) | undefined;
		const executeInTab = vi.fn<BrowserCapturePlatform['executeInTab']>();
		const geometryFunction = menuItemId === BROWSER_CAPTURE_MENU_IDS.capturePage ? readPageViewport : menuItemId === BROWSER_CAPTURE_MENU_IDS.editImage ? locateRenderedImage : selectPageRegion;
		if (menuItemId === BROWSER_CAPTURE_MENU_IDS.bugReport) executeInTab.mockResolvedValueOnce(Source);
		else executeInTab.mockResolvedValueOnce(menuItemId === BROWSER_CAPTURE_MENU_IDS.capturePage ? Source.viewport : Geometry).mockResolvedValueOnce(Source);
		const platform: BrowserCapturePlatform = {
			onAction: vi.fn(), onCommand: vi.fn(), onContextMenu: (listener) => { menu = listener; },
			replaceContextMenus: vi.fn().mockResolvedValue(undefined), executeInTab: executeInTab as BrowserCapturePlatform['executeInTab'],
			captureVisibleTab: vi.fn().mockResolvedValue(new Blob(['capture'], { type: ImageMimeType.Png })),
			openTab: vi.fn().mockResolvedValue(undefined), extensionUrl: (path) => `chrome-extension://test/${path}`, createId: () => 'capture-id',
		};
		const put = vi.fn<(id: string, capture: PendingBrowserCapture) => Promise<void>>().mockResolvedValue(undefined);
		await new BrowserCaptureController(platform, { put }).start();
		menu!({ menuItemId, srcUrl: 'https://application.example/image.png' }, { id: 4, windowId: 7 });
		await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
		expect(put.mock.calls[0]?.[1].source).toEqual(Source);
		expect(executeInTab.mock.calls.map((call) => call[1])).toEqual(menuItemId === BROWSER_CAPTURE_MENU_IDS.bugReport ? [readCaptureSource] : [geometryFunction, readCaptureSource]);
	});
});
