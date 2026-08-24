interface PanelActionDefinition {
	label: string;
	title: string;
	path: string;
}

const PANEL_ACTIONS: Readonly<Record<string, PanelActionDefinition>> = {
	applyCropButton: {
		label: 'Apply',
		title: 'Apply crop',
		path: 'm3 8 3 3 7-7',
	},
	resetFiltersButton: {
		label: 'Reset',
		title: 'Reset adjustments',
		path: 'M4 5H1V2M1.5 5A6 6 0 1 1 2 12',
	},
	rotateLeftButton: {
		label: 'Left 90°',
		title: 'Rotate left 90 degrees',
		path: 'M5 5H2V2M2.5 5A6 6 0 1 1 3 12',
	},
	rotateRightButton: {
		label: 'Right 90°',
		title: 'Rotate right 90 degrees',
		path: 'M11 5h3V2m-.5 3A6 6 0 1 0 13 12',
	},
	flipHButton: {
		label: 'Flip H',
		title: 'Flip horizontally',
		path: 'M1.5 8h13M4 5 1 8l3 3m8-6 3 3-3 3',
	},
	flipVButton: {
		label: 'Flip V',
		title: 'Flip vertically',
		path: 'M8 1.5v13M5 4l3-3 3 3m-6 8 3 3 3-3',
	},
	resizeButton: {
		label: 'Resize',
		title: 'Resize image',
		path: 'M2 6V2h4m8 8v4h-4M6 2 2 6m8 8 4-4',
	},
};

export function enhancePanelButtons(root: ParentNode = document): void {
	for (const [id, definition] of Object.entries(PANEL_ACTIONS)) {
		const button = root.querySelector<HTMLButtonElement>(`#${id}`);
		if (!button) continue;
		button.classList.add('panel-action');
		button.title = definition.title;
		button.setAttribute('aria-label', definition.title);
		button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${definition.path}"></path></svg><span>${definition.label}</span>`;
	}
}
