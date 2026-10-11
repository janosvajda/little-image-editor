import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';

interface PanelActionDefinition {
	label: string;
	title: string;
	icon: EditorIconId;
}

const PANEL_ACTIONS: Readonly<Record<string, PanelActionDefinition>> = {
	resetFiltersButton: {
		label: 'Reset',
		title: 'Reset adjustments',
		icon: EditorIconId.Reset,
	},
	rotateLeftButton: {
		label: 'Left 90°',
		title: 'Rotate left 90 degrees',
		icon: EditorIconId.RotateLeft,
	},
	rotateRightButton: {
		label: 'Right 90°',
		title: 'Rotate right 90 degrees',
		icon: EditorIconId.RotateRight,
	},
	flipHButton: {
		label: 'Flip H',
		title: 'Flip horizontally',
		icon: EditorIconId.FlipHorizontal,
	},
	flipVButton: {
		label: 'Flip V',
		title: 'Flip vertically',
		icon: EditorIconId.FlipVertical,
	},
	resizeButton: {
		label: 'Resize',
		title: 'Resize image',
		icon: EditorIconId.Resize,
	},
};

export function enhancePanelButtons(root: ParentNode = document): void {
	for (const [id, definition] of Object.entries(PANEL_ACTIONS)) {
		const button = root.querySelector<HTMLButtonElement>(`#${id}`);
		if (!button) continue;
		button.classList.add('panel-action');
		button.title = definition.title;
		button.setAttribute('aria-label', definition.title);
		button.innerHTML = `${editorIconMarkup(definition.icon)}<span>${definition.label}</span>`;
	}
}
