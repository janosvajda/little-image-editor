import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationObject } from '../annotations/annotationTypes';
import { clippingShapeAbove, clipWithShapeAbove, releaseClip } from './clipActions';
import type { SelectedObjectSection } from './selectedObjectSection';

/** The clip actions, each named by its button's words and its tooltip. */
const ClipAction = {
	Clip: { label: 'Clip', title: 'Clip with the shape above: show this item only inside it', icon: EditorIconId.Clip },
	Release: { label: 'Release clip', title: 'Release clip: give its outline back as a path', icon: EditorIconId.ReleaseClip },
} as const;

/** Clip the selected item with the shape above it, or release its clip. */
export class ObjectClipActions implements SelectedObjectSection {
	readonly element = document.createElement('div');
	readonly #clip: HTMLButtonElement;
	readonly #release: HTMLButtonElement;

	constructor(private readonly objects: AnnotationDocument) {
		this.element.className = 'object-clip-actions';
		this.#clip = this.button(ClipAction.Clip, () => clipWithShapeAbove(objects));
		this.#release = this.button(ClipAction.Release, () => releaseClip(objects));
		this.element.append(this.#clip, this.#release);
	}

	show(item: Readonly<AnnotationObject>): boolean {
		const clipped = item.clip !== undefined;
		const canClip = !clipped && clippingShapeAbove(this.objects, item) !== null;
		this.#clip.classList.toggle('hidden', !canClip);
		this.#release.classList.toggle('hidden', !clipped);
		return canClip || clipped;
	}

	private button(action: (typeof ClipAction)[keyof typeof ClipAction], run: () => void): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'object-action-button';
		button.title = action.title;
		button.innerHTML = `${editorIconMarkup(action.icon)}<span>${action.label}</span>`;
		button.addEventListener('click', run);
		return button;
	}
}
