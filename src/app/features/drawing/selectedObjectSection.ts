import type { AnnotationObject } from '../annotations/annotationTypes';

/** More controls the selected-object bar holds, which say whether they apply to the selected item and show it. */
export interface SelectedObjectSection {
	readonly element: HTMLElement;
	/** Shows the item's values; false when the section does not apply to it, so it is hidden. */
	show(item: Readonly<AnnotationObject>): boolean;
}
