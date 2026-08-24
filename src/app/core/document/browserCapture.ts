export interface CaptureRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CaptureViewport {
	width: number;
	height: number;
}

export interface CaptureSourceMetadata {
	url: string;
	capturedAt: string;
	userAgent: string;
	viewport: CaptureViewport;
}

export interface PendingBrowserCapture {
	blob: Blob;
	name: string;
	crop?: CaptureRect;
	viewport?: CaptureViewport;
	source?: CaptureSourceMetadata;
}
