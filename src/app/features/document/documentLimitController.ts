import {
	DocumentLimitStateKey,
	EditorLimit,
	type DocumentPerformanceWarningState,
} from '../../core/document/editorLimits';
import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	type AnnotationDocument,
	isEphemeralAnnotationChange,
} from '../annotations/annotationDocument';

const DialogAction = {
	Continue: 'continue',
	Suppress: 'suppress',
} as const;

export class DocumentLimitController {
	readonly dialog = document.createElement('dialog');
	readonly #message = document.createElement('p');
	#aboveWarningThreshold = false;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly editableObjects: AnnotationDocument,
	) {
		this.buildDialog();
		document.body.append(this.dialog);
		this.documentModel.onDocumentChange(() => {
			this.#aboveWarningThreshold = false;
			if (!this.documentModel.hasImage && this.dialog.open) this.dialog.close();
		});
		this.editableObjects.onChange((state, change) => {
			if (!isEphemeralAnnotationChange(change))
				this.evaluate(state.objects.length);
		});
	}

	private evaluate(objectCount: number): void {
		if (!this.documentModel.hasImage) return;
		if (objectCount <= EditorLimit.EditableObjectWarning) {
			this.#aboveWarningThreshold = false;
			return;
		}
		if (this.#aboveWarningThreshold) return;
		this.#aboveWarningThreshold = true;
		if (this.warningState().suppressEditableObjectWarning) return;
		this.#message.textContent = `This document contains ${objectCount} editable objects. You can continue editing, but selection, rendering, saving, and undo may become slower above ${EditorLimit.EditableObjectWarning} objects.`;
		if (!this.dialog.open) this.dialog.showModal();
	}

	private warningState(): DocumentPerformanceWarningState {
		return (
			this.documentModel.toolbarState<DocumentPerformanceWarningState>(
				DocumentLimitStateKey.PerformanceWarning,
			) ?? { suppressEditableObjectWarning: false }
		);
	}

	private buildDialog(): void {
		this.dialog.id = 'editableObjectLimitDialog';
		this.dialog.className = 'compact-dialog performance-warning-dialog';
		this.dialog.setAttribute('aria-labelledby', 'editableObjectLimitTitle');
		const title = document.createElement('h2');
		title.id = 'editableObjectLimitTitle';
		title.textContent = 'Large editable document';
		const description = document.createElement('p');
		description.textContent =
			'No objects will be removed or flattened. This is a performance warning only.';
		const actions = document.createElement('div');
		actions.className = 'dialog-actions';
		const continueButton = actionButton('Continue editing', DialogAction.Continue);
		const suppressButton = actionButton(
			"Don't warn again for this document",
			DialogAction.Suppress,
		);
		continueButton.addEventListener('click', () => this.dialog.close());
		suppressButton.addEventListener('click', () => {
			this.documentModel.setToolbarState(
				DocumentLimitStateKey.PerformanceWarning,
				{ suppressEditableObjectWarning: true } satisfies DocumentPerformanceWarningState,
			);
			this.dialog.close();
		});
		actions.append(continueButton, suppressButton);
		this.dialog.append(title, this.#message, description, actions);
	}
}

function actionButton(label: string, action: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.dataset.limitAction = action;
	button.textContent = label;
	return button;
}
