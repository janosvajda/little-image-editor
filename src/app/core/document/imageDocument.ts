import {
	copyCanvas,
	encodeCanvas,
	hasTransparency,
} from '../../features/files/canvasHelpers';
import { canvasContext } from '../../shared/dom/domHelpers';
import { degreesToRadians, Numeric } from '../../shared/math/numericConstants';
import { LayerDocument } from '../layers/layerDocument';
import { CoreLayerId } from '../layers/layerTypes';
import type {
	CropRect,
	DocumentSessionSnapshot,
	HistorySnapshot,
	ImageFormat,
	ImageSnapshot,
	NewImageOptions,
} from './appTypes';
import { DEFAULT_DOCUMENT_NAME, DocumentType } from './appTypes';
import { DEFAULT_IMAGE_FORMAT } from './imageFormats';
import { PIXELS_PER_INCH } from './measurementUnits';
import { EditorLimit } from './editorLimits';

const HISTORY_LIMIT = EditorLimit.RasterHistory;
const EMPTY_HISTORY_INDEX = -1;

export const DocumentGeometryChangeKind = {
	Crop: 'crop',
	Resize: 'resize',
	Transform: 'transform',
	Rebase: 'rebase',
} as const;
export type DocumentGeometryChange =
	| Readonly<{ kind: typeof DocumentGeometryChangeKind.Crop; rect: CropRect }>
	| Readonly<{ kind: typeof DocumentGeometryChangeKind.Resize }>
	| Readonly<{ kind: typeof DocumentGeometryChangeKind.Transform }>
	| Readonly<{
			kind: typeof DocumentGeometryChangeKind.Rebase;
			delta: Readonly<{ x: number; y: number }>;
	  }>;
type GeometryHistoryEntry = Readonly<{
	kind: typeof DocumentGeometryChangeKind.Crop;
	rect: CropRect;
}> | null;

export class CanvasDocument {
	readonly context: CanvasRenderingContext2D;
	readonly overlayContext: CanvasRenderingContext2D;
	readonly layers = new LayerDocument();

	hasImage = false;
	fileHandle: FileSystemFileHandle | null = null;
	baseName = 'little-image';
	savedType: ImageFormat = DEFAULT_IMAGE_FORMAT.mimeType;
	resolution = PIXELS_PER_INCH;
	documentType: DocumentType = DocumentType.Image;
	#opaqueBackgroundColor: string | null = null;

	#history: ImageData[] = [];
	#geometryHistory: GeometryHistoryEntry[] = [];
	#historyIndex = EMPTY_HISTORY_INDEX;
	#historyListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	#documentListeners = new Set<
		(
			snapshot: Readonly<{ hasImage: boolean; width: number; height: number }>,
		) => void
	>();
	#contentListeners = new Set<(hasImage: boolean) => void>();
	#toolbarStates: Record<string, unknown> = {};
	#compositeRenderers = new Set<(context: CanvasRenderingContext2D) => void>();
	#beforeGeometryChangeListeners = new Set<
		(change: DocumentGeometryChange) => void
	>();

	constructor(
		readonly canvas: HTMLCanvasElement,
		readonly overlay: HTMLCanvasElement,
	) {
		this.context = canvasContext(canvas, { willReadFrequently: true });
		this.overlayContext = canvasContext(overlay);
		this.layers.onChange(() => {
			this.canvas.style.opacity = this.layers.isVisible(CoreLayerId.Image)
				? '1'
				: '0';
			if (this.hasImage) this.#emitContentChange();
		});
	}

	get width(): number {
		return this.canvas.width;
	}
	get height(): number {
		return this.canvas.height;
	}

	onHistoryChange(
		listener: (canUndo: boolean, canRedo: boolean) => void,
	): void {
		this.#historyListeners.add(listener);
		listener(
			this.#historyIndex > 0,
			this.#historyIndex < this.#history.length - 1,
		);
	}

	onDocumentChange(
		listener: (
			snapshot: Readonly<{ hasImage: boolean; width: number; height: number }>,
		) => void,
	): void {
		this.#documentListeners.add(listener);
		listener(this.snapshot());
	}

	/** Signals that recovery data is stale without eagerly copying the canvas. */
	onContentChange(listener: (hasImage: boolean) => void): void {
		this.#contentListeners.add(listener);
	}

	registerCompositeRenderer(
		renderer: (context: CanvasRenderingContext2D) => void,
	): () => void {
		this.#compositeRenderers.add(renderer);
		return () => this.#compositeRenderers.delete(renderer);
	}

	onBeforeGeometryChange(listener: (change: DocumentGeometryChange) => void): void {
		this.#beforeGeometryChangeListeners.add(listener);
	}

	snapshotPixels(): ImageSnapshot {
		return {
			width: this.width,
			height: this.height,
			// getImageData already returns an isolated pixel buffer; copying it again
			// doubles peak memory and traversal time for no additional safety.
			pixels: this.context.getImageData(0, 0, this.width, this.height).data,
			baseName: this.baseName,
			savedType: this.savedType,
			resolution: this.resolution,
		};
	}

	snapshotSession(): DocumentSessionSnapshot {
		return {
			...this.snapshotPixels(),
			history: this.#history.map((state) => this.#snapshotImageData(state)),
			historyIndex: this.#historyIndex,
			toolbarStates: structuredClone(this.#toolbarStates),
			layerState: this.layers.state,
			documentType: this.documentType,
		};
	}

	restoreSnapshot(snapshot: ImageSnapshot): void {
		this.setSize(snapshot.width, snapshot.height);
		this.context.putImageData(
			new ImageData(
				new Uint8ClampedArray(snapshot.pixels),
				snapshot.width,
				snapshot.height,
			),
			0,
			0,
		);
		this.savedType = snapshot.savedType;
		this.resolution = snapshot.resolution ?? PIXELS_PER_INCH;
		this.documentType = snapshot.documentType ?? DocumentType.Image;
		this.#opaqueBackgroundColor = this.containsTransparency() ? null : '#ffffff';
		this.activate(snapshot.baseName);
	}

	restoreSession(snapshot: DocumentSessionSnapshot): void {
		this.setSize(snapshot.width, snapshot.height);
		this.#history = snapshot.history.map(
			(state) =>
				new ImageData(
					new Uint8ClampedArray(state.pixels),
					state.width,
					state.height,
				),
		);
		this.#geometryHistory = this.#history.map(() => null);
		this.#historyIndex = Math.min(
			Math.max(snapshot.historyIndex, 0),
			this.#history.length - 1,
		);
		const current = new ImageData(
			new Uint8ClampedArray(snapshot.pixels),
			snapshot.width,
			snapshot.height,
		);
		this.context.putImageData(current, 0, 0);
		if (this.#historyIndex >= 0) this.#history[this.#historyIndex] = current;
		else {
			this.#history = [current];
			this.#historyIndex = 0;
		}
		this.savedType = snapshot.savedType;
		this.resolution = snapshot.resolution ?? PIXELS_PER_INCH;
		this.#opaqueBackgroundColor = this.containsTransparency() ? null : '#ffffff';
		this.hasImage = true;
		this.fileHandle = null;
		this.baseName = snapshot.baseName;
		this.#toolbarStates = structuredClone(snapshot.toolbarStates ?? {});
		this.layers.restore(snapshot.layerState);
		this.clearOverlay();
		this.#emitHistory();
		this.#emitDocumentChange();
	}

	setSize(width: number, height: number): void {
		this.canvas.width = this.overlay.width = width;
		this.canvas.height = this.overlay.height = height;
		if (this.hasImage) this.#emitDocumentChange();
	}

	async load(file: File): Promise<void> {
		if (!file.type.startsWith('image/')) return;
		const bitmap = await createImageBitmap(file);
		this.setSize(bitmap.width, bitmap.height);
		this.context.clearRect(0, 0, this.width, this.height);
		this.context.drawImage(bitmap, 0, 0);
		this.resolution = PIXELS_PER_INCH;
		this.documentType = DocumentType.Image;
		this.#opaqueBackgroundColor = '#ffffff';
		bitmap.close();
		this.activate(file.name.replace(/\.[^.]+$/, '') || 'little-image');
	}

	create(options: NewImageOptions): void {
		this.setSize(options.width, options.height);
		this.context.clearRect(0, 0, options.width, options.height);
		if (!options.transparent) {
			this.context.fillStyle = options.background;
			this.context.fillRect(0, 0, options.width, options.height);
		}
		this.savedType = options.format ?? DEFAULT_IMAGE_FORMAT.mimeType;
		this.resolution = options.resolution ?? PIXELS_PER_INCH;
		this.documentType = options.documentType ?? DocumentType.Image;
		this.#opaqueBackgroundColor = options.transparent ? null : options.background;
		this.activate(options.name.trim() || DEFAULT_DOCUMENT_NAME);
	}

	activate(name: string): void {
		this.hasImage = true;
		this.fileHandle = null;
		this.baseName = name;
		this.#toolbarStates = {};
		this.layers.reset();
		this.#history = [];
		this.#geometryHistory = [];
		this.#historyIndex = EMPTY_HISTORY_INDEX;
		this.#opaqueBackgroundColor = null;
		this.#toolbarStates = {};
		this.clearOverlay();
		this.commit();
		this.#emitDocumentChange();
	}

	close(): void {
		this.hasImage = false;
		this.fileHandle = null;
		this.#history = [];
		this.#geometryHistory = [];
		this.#historyIndex = EMPTY_HISTORY_INDEX;
		this.layers.reset();
		this.context.clearRect(0, 0, this.width, this.height);
		this.clearOverlay();
		this.#emitHistory();
		this.#emitDocumentChange();
		this.#emitContentChange();
	}

	commit(geometry: GeometryHistoryEntry = null): void {
		if (!this.hasImage && this.#history.length > 0) return;
		this.#history.splice(this.#historyIndex + 1);
		this.#geometryHistory.splice(this.#historyIndex + 1);
		this.#history.push(
			this.context.getImageData(0, 0, this.width, this.height),
		);
		this.#geometryHistory.push(geometry);
		if (this.#history.length > HISTORY_LIMIT) {
			this.#history.shift();
			this.#geometryHistory.shift();
		}
		this.#historyIndex = this.#history.length - 1;
		this.#emitHistory();
		if (this.hasImage) this.#emitContentChange();
	}

	undo(): void {
		this.#restore(this.#historyIndex - 1);
	}
	redo(): void {
		this.#restore(this.#historyIndex + 1);
	}

	toolbarState<T>(key: string): T | undefined {
		return this.#toolbarStates[key] as T | undefined;
	}

	setToolbarState(key: string, state: unknown): void {
		if (!this.hasImage) return;
		this.#toolbarStates[key] = structuredClone(state);
		this.#emitContentChange();
	}

	clearOverlay(): void {
		this.overlayContext.clearRect(
			0,
			0,
			this.overlay.width,
			this.overlay.height,
		);
	}

	crop(rect: CropRect): void {
		if (rect.width < 1 || rect.height < 1) return;
		this.#emitBeforeGeometryChange({
			kind: DocumentGeometryChangeKind.Crop,
			rect,
		});
		const image = this.context.getImageData(
			rect.x,
			rect.y,
			rect.width,
			rect.height,
		);
		this.setSize(image.width, image.height);
		this.context.putImageData(image, 0, 0);
		this.clearOverlay();
		this.commit({ kind: DocumentGeometryChangeKind.Crop, rect });
	}

	resize(
		width: number,
		height: number,
		historyMode: 'commit' | 'reset' = 'commit',
	): void {
		if (!this.hasImage || width < 1 || height < 1) return;
		this.#emitBeforeGeometryChange({ kind: DocumentGeometryChangeKind.Resize });
		const source = this.copyCanvas();
		this.setSize(Math.round(width), Math.round(height));
		this.context.imageSmoothingEnabled = true;
		this.context.imageSmoothingQuality = 'high';
		this.context.drawImage(source, 0, 0, this.width, this.height);
		if (historyMode === 'reset') {
			this.#history = [];
			this.#geometryHistory = [];
			this.#historyIndex = EMPTY_HISTORY_INDEX;
		}
		this.commit();
	}

	transform(rotation: number, flipX = 1, flipY = 1): void {
		if (!this.hasImage) return;
		this.#emitBeforeGeometryChange({ kind: DocumentGeometryChangeKind.Transform });
		const source = this.copyCanvas();
		const swap =
			Math.abs(rotation) % Numeric.DegreesPerHalfTurn ===
			Numeric.DegreesPerQuarterTurn;
		this.setSize(
			swap ? source.height : source.width,
			swap ? source.width : source.height,
		);
		this.context.save();
		this.context.translate(this.width / 2, this.height / 2);
		this.context.rotate(degreesToRadians(rotation));
		this.context.scale(flipX, flipY);
		this.context.drawImage(source, -source.width / 2, -source.height / 2);
		this.context.restore();
		this.commit();
	}

	containsTransparency(): boolean {
		return hasTransparency(this.context, this.width, this.height);
	}

	cropReplacementPixel(): Uint8ClampedArray | null {
		if (this.containsTransparency()) return null;
		const sample = document.createElement('canvas');
		sample.width = 1;
		sample.height = 1;
		const context = sample.getContext('2d')!;
		context.fillStyle = this.#opaqueBackgroundColor ?? '#ffffff';
		context.fillRect(0, 0, sample.width, sample.height);
		return context.getImageData(0, 0, sample.width, sample.height).data;
	}

	compositeCanvas(): HTMLCanvasElement {
		const composite = document.createElement('canvas');
		composite.width = this.width;
		composite.height = this.height;
		const context = composite.getContext('2d')!;
		if (this.layers.isVisible(CoreLayerId.Image))
			context.drawImage(this.canvas, 0, 0);
		this.#compositeRenderers.forEach((renderer) => renderer(context));
		return composite;
	}

	toBlob(type: ImageFormat): Promise<Blob> {
		if (
			this.layers.isVisible(CoreLayerId.Image) &&
			this.#compositeRenderers.size === 0
		)
			return encodeCanvas(this.canvas, type);
		return encodeCanvas(this.compositeCanvas(), type);
	}

	private copyCanvas(): HTMLCanvasElement {
		return copyCanvas(this.canvas);
	}

	#restore(index: number): void {
		const state = this.#history[index];
		if (!state) return;
		const movingBackward = index < this.#historyIndex;
		const geometry = movingBackward
			? this.#geometryHistory[this.#historyIndex]
			: this.#geometryHistory[index];
		if (geometry?.kind === DocumentGeometryChangeKind.Crop)
			this.#emitBeforeGeometryChange({
				kind: DocumentGeometryChangeKind.Rebase,
				delta: {
					x: movingBackward ? geometry.rect.x : -geometry.rect.x,
					y: movingBackward ? geometry.rect.y : -geometry.rect.y,
				},
			});
		this.setSize(state.width, state.height);
		this.context.putImageData(state, 0, 0);
		this.#historyIndex = index;
		this.clearOverlay();
		this.#emitHistory();
		this.#emitContentChange();
	}

	#snapshotImageData(state: ImageData): HistorySnapshot {
		return {
			width: state.width,
			height: state.height,
			pixels: new Uint8ClampedArray(state.data),
		};
	}

	#emitHistory(): void {
		const canUndo = this.#historyIndex > 0;
		const canRedo = this.#historyIndex < this.#history.length - 1;
		this.#historyListeners.forEach((listener) => listener(canUndo, canRedo));
	}

	private snapshot(): Readonly<{
		hasImage: boolean;
		width: number;
		height: number;
	}> {
		return { hasImage: this.hasImage, width: this.width, height: this.height };
	}

	#emitDocumentChange(): void {
		const snapshot = this.snapshot();
		this.#documentListeners.forEach((listener) => listener(snapshot));
	}

	#emitContentChange(): void {
		this.#contentListeners.forEach((listener) => listener(this.hasImage));
	}

	#emitBeforeGeometryChange(change: DocumentGeometryChange): void {
		this.#beforeGeometryChangeListeners.forEach((listener) => listener(change));
	}
}
