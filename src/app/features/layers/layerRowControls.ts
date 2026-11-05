import { createEditorIcon, EditorIconId } from '../../shared/style/editorIcons';

/**
 * The controls a layer's row is made of, shared by every list of layers: the
 * Layers panel and the animation timeline show, hide and lock a layer with
 * the same buttons.
 */

const VisibilityIcon = { Visible: EditorIconId.Visible, Hidden: EditorIconId.Hidden } as const;
const LockIcon = { Locked: EditorIconId.Lock, Unlocked: EditorIconId.Unlock } as const;
export const LayerRowClass = { Visibility: 'layer-visibility', Lock: 'layer-lock', Name: 'layer-name' } as const;

/** A button showing text, labelled for assistive technology and tooltips. */
export function layerActionButton(content: string, label: string, action: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = content;
	button.title = label;
	button.setAttribute('aria-label', label);
	button.addEventListener('click', action);
	return button;
}

/** A button showing an icon, with the same label and action contract. */
export function layerIconButton(icon: EditorIconId, label: string, action: () => void): HTMLButtonElement {
	const button = layerActionButton('', label, action);
	button.append(createEditorIcon(icon));
	return button;
}

/** Shows or hides what `label` names. */
export function layerVisibilityButton(visible: boolean, label: string, toggle: () => void): HTMLButtonElement {
	const button = layerIconButton(visible ? VisibilityIcon.Visible : VisibilityIcon.Hidden, `${visible ? 'Hide' : 'Show'} ${label}`, toggle);
	button.className = LayerRowClass.Visibility;
	return button;
}

/** Locks or unlocks what `label` names. */
export function layerLockButton(locked: boolean, label: string, toggle: () => void): HTMLButtonElement {
	const button = layerIconButton(locked ? LockIcon.Locked : LockIcon.Unlocked, `${locked ? 'Unlock' : 'Lock'} ${label}`, toggle);
	button.className = LayerRowClass.Lock;
	button.setAttribute('aria-pressed', String(locked));
	return button;
}
