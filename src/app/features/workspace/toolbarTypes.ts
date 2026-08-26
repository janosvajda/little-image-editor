export const ToolbarId = {
	Tools: 'tools',
	Adjust: 'adjust',
	Effects: 'effects',
	Transform: 'transform',
	Annotations: 'annotations',
	Layers: 'layers',
} as const;
export type ToolbarId = (typeof ToolbarId)[keyof typeof ToolbarId];

export const ToolbarAutoOpenMode = { Annotate: 'annotate' } as const;
export type ToolbarAutoOpenMode =
	(typeof ToolbarAutoOpenMode)[keyof typeof ToolbarAutoOpenMode];

export function toolbarSelector(id: ToolbarId): string {
	return `[data-panel="${id}"]`;
}
