import { BrowserCaptureController } from './app/features/capture/browserCaptureController';
import { ChromeCapturePlatform } from './app/features/capture/chromeCapturePlatform';
import { BrowserCaptureStore } from './app/features/capture/browserCaptureStore';

const browserCapture = new BrowserCaptureController(
	new ChromeCapturePlatform(),
	new BrowserCaptureStore(),
);
void browserCapture.start();
