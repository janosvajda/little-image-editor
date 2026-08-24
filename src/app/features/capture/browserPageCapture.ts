import type {
	CaptureRect,
	CaptureSourceMetadata,
	CaptureViewport,
} from '../../core/document/browserCapture';

export interface BrowserCaptureGeometry {
	crop: CaptureRect;
	viewport: CaptureViewport;
}

/** Runs inside the captured webpage through chrome.scripting.executeScript. */
export function readPageViewport(): CaptureViewport {
	return { width: window.innerWidth, height: window.innerHeight };
}

/** Runs inside the captured webpage through chrome.scripting.executeScript. */
export function readCaptureSource(): CaptureSourceMetadata {
	return {
		url: location.href,
		capturedAt: new Date().toISOString(),
		userAgent: navigator.userAgent,
		viewport: { width: window.innerWidth, height: window.innerHeight },
	};
}

/** Runs inside the captured webpage through chrome.scripting.executeScript. */
export function locateRenderedImage(
	sourceUrl: string,
): BrowserCaptureGeometry | null {
	const viewport = { width: window.innerWidth, height: window.innerHeight };
	const candidates = [...document.images]
		.filter(
			(image) => image.currentSrc === sourceUrl || image.src === sourceUrl,
		)
		.map((image) => image.getBoundingClientRect())
		.map((rect) => ({
			x: Math.max(0, rect.left),
			y: Math.max(0, rect.top),
			width: Math.max(
				0,
				Math.min(viewport.width, rect.right) - Math.max(0, rect.left),
			),
			height: Math.max(
				0,
				Math.min(viewport.height, rect.bottom) - Math.max(0, rect.top),
			),
		}))
		.filter((rect) => rect.width > 0 && rect.height > 0)
		.sort(
			(left, right) => right.width * right.height - left.width * left.height,
		);
	return candidates[0] ? { crop: candidates[0], viewport } : null;
}

/** Runs inside the captured webpage and resolves after its temporary UI is removed. */
export function selectPageRegion(): Promise<BrowserCaptureGeometry | null> {
	return new Promise((resolve) => {
		const captureStyle = {
			overlayShade: 'rgba(0,0,0,.28)',
			selectionBorder: '#fff',
			selectionAccent: '#2563eb',
			instructionSurface: '#161a22',
			instructionText: '#fff',
			instructionShadow: 'rgba(0,0,0,.35)',
		} as const;
		const overlay = document.createElement('div');
		const selection = document.createElement('div');
		const instruction = document.createElement('div');
		Object.assign(overlay.style, {
			position: 'fixed',
			inset: '0',
			zIndex: '2147483647',
			cursor: 'crosshair',
			background: captureStyle.overlayShade,
		});
		Object.assign(selection.style, {
			position: 'fixed',
			display: 'none',
			border: `2px solid ${captureStyle.selectionBorder}`,
			boxShadow: `0 0 0 1px ${captureStyle.selectionAccent},0 0 0 99999px ${captureStyle.overlayShade}`,
			background: 'transparent',
		});
		Object.assign(instruction.style, {
			position: 'fixed',
			top: '16px',
			left: '50%',
			transform: 'translateX(-50%)',
			padding: '8px 12px',
			borderRadius: '7px',
			background: captureStyle.instructionSurface,
			color: captureStyle.instructionText,
			font: '600 13px system-ui,sans-serif',
			boxShadow: `0 4px 18px ${captureStyle.instructionShadow}`,
		});
		instruction.textContent = 'Drag to select an area · Esc to cancel';
		overlay.append(selection, instruction);
		document.documentElement.append(overlay);

		let startX = 0;
		let startY = 0;
		let dragging = false;
		const updateSelection = (x: number, y: number) => {
			const left = Math.min(startX, x);
			const top = Math.min(startY, y);
			Object.assign(selection.style, {
				display: 'block',
				left: `${left}px`,
				top: `${top}px`,
				width: `${Math.abs(x - startX)}px`,
				height: `${Math.abs(y - startY)}px`,
			});
		};
		const finish = (result: BrowserCaptureGeometry | null) => {
			document.removeEventListener('keydown', cancelOnEscape, true);
			overlay.remove();
			requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
		};
		const cancelOnEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			finish(null);
		};
		document.addEventListener('keydown', cancelOnEscape, true);
		overlay.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			dragging = true;
			startX = event.clientX;
			startY = event.clientY;
			instruction.style.display = 'none';
			updateSelection(startX, startY);
			overlay.setPointerCapture(event.pointerId);
		});
		overlay.addEventListener('pointermove', (event) => {
			if (dragging) updateSelection(event.clientX, event.clientY);
		});
		overlay.addEventListener('pointerup', (event) => {
			if (!dragging) return;
			dragging = false;
			const crop = {
				x: Math.min(startX, event.clientX),
				y: Math.min(startY, event.clientY),
				width: Math.abs(event.clientX - startX),
				height: Math.abs(event.clientY - startY),
			};
			finish(
				crop.width >= 2 && crop.height >= 2
					? {
							crop,
							viewport: {
								width: window.innerWidth,
								height: window.innerHeight,
							},
						}
					: null,
			);
		});
	});
}
