import {
	CoreLayerId,
	DEFAULT_LAYER_STATE,
	type EditorLayer,
	type LayerState,
} from './layerTypes';

export class LayerDocument {
	#state: LayerState = structuredClone(DEFAULT_LAYER_STATE);
	readonly #listeners = new Set<(state: LayerState) => void>();

	get state(): LayerState {
		return structuredClone(this.#state);
	}

	onChange(listener: (state: LayerState) => void): void {
		this.#listeners.add(listener);
		listener(this.state);
	}

	reset(): void {
		this.replace(DEFAULT_LAYER_STATE);
	}

	restore(state?: LayerState): void {
		this.replace(state && isLayerState(state) ? state : DEFAULT_LAYER_STATE);
	}

	select(id: string): void {
		if (!this.find(id) || this.#state.activeLayerId === id) return;
		this.#state = { ...this.#state, activeLayerId: id };
		this.emit();
	}

	setVisible(id: string, visible: boolean): void {
		this.update(id, (layer) => ({ ...layer, visible }));
	}

	setLocked(id: string, locked: boolean): void {
		this.update(id, (layer) => ({ ...layer, locked }));
	}

	isVisible(id: string): boolean {
		return this.find(id)?.visible ?? false;
	}

	isEditable(id: string): boolean {
		const layer = this.find(id);
		return Boolean(layer?.visible && !layer.locked);
	}

	private find(id: string): EditorLayer | undefined {
		return this.#state.layers.find((layer) => layer.id === id);
	}

	private update(
		id: string,
		updater: (layer: EditorLayer) => EditorLayer,
	): void {
		const current = this.find(id);
		if (!current) return;
		const updated = updater(current);
		if (sameLayer(current, updated)) return;
		const layers = this.#state.layers.map((layer) => {
			if (layer.id !== id) return layer;
			return updated;
		});
		this.#state = { ...this.#state, layers };
		this.emit();
	}

	private replace(state: LayerState): void {
		this.#state = structuredClone(state);
		this.emit();
	}

	private emit(): void {
		const snapshot = this.state;
		this.#listeners.forEach((listener) => listener(snapshot));
	}
}

function sameLayer(left: EditorLayer, right: EditorLayer): boolean {
	return (
		left.id === right.id &&
		left.kind === right.kind &&
		left.name === right.name &&
		left.visible === right.visible &&
		left.locked === right.locked
	);
}

function isLayerState(value: LayerState): boolean {
	return (
		value.layers.length > 0 &&
		value.layers.some((layer) => layer.id === value.activeLayerId) &&
		value.layers.some((layer) => layer.id === CoreLayerId.Image) &&
		value.layers.some((layer) => layer.id === CoreLayerId.Objects)
	);
}
