import { describe, expect, it, vi } from 'vitest';
import { LayerDocument } from './layerDocument';
import { CoreLayerId, LayerKind } from './layerTypes';

describe('LayerDocument contract', () => {
	it('provides typed image and object layers and restores their editable state', () => {
		const layers = new LayerDocument();
		const changed = vi.fn();
		layers.onChange(changed);
		layers.setVisible(CoreLayerId.Objects, false);
		layers.setLocked(CoreLayerId.Image, true);
		layers.select(CoreLayerId.Objects);

		expect(layers.state).toEqual({
			activeLayerId: CoreLayerId.Objects,
			layers: [
				{
					id: CoreLayerId.Image,
					kind: LayerKind.Raster,
					name: 'Image',
					visible: true,
					locked: true,
				},
				{
					id: CoreLayerId.Objects,
					kind: LayerKind.Objects,
					name: 'Editable objects',
					visible: false,
					locked: false,
				},
			],
		});
		expect(layers.isEditable(CoreLayerId.Image)).toBe(false);
		expect(layers.isEditable(CoreLayerId.Objects)).toBe(false);
		expect(changed).toHaveBeenCalledTimes(4);

		const restored = new LayerDocument();
		restored.restore(layers.state);
		expect(restored.state).toEqual(layers.state);
	});
});
