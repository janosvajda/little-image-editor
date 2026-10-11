import type { CanvasDocument } from '../../core/document/imageDocument';
import { element } from '../../shared/dom/domHelpers';
import type { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import type { NewImageController } from '../files/newImageController';
import { DIAGRAM_IMAGE_NAME, diagramImageSpec, drawMermaidDiagram } from './diagramDrawing';
import { MERMAID_FILE_ACCEPT, mermaidCode } from './mermaidFlowchart';

const HALF = 2;

/**
 * Inserts a Mermaid diagram as editable shapes, in every edition of the
 * editor: pasted into the diagram dialog, or imported from a Mermaid or
 * Markdown file. It goes on a new image sized to the diagram when none is
 * open, otherwise centred on the open image, or at its top left when it is
 * larger. The whole diagram is one undo step.
 */
export class DiagramImportController {
	readonly #source = element<HTMLTextAreaElement>('#mermaidSource');
	readonly #error = element('#diagramError');
	readonly #fileInput = element<HTMLInputElement>('#diagramFileInput');

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly images: Pick<NewImageController, 'createImage'>,
		private readonly commands: Pick<AssistantCommandRunner, 'run'>,
		private readonly dialog: HTMLDialogElement,
	) {
		this.#fileInput.accept = MERMAID_FILE_ACCEPT;
		element('#insertDiagramButton').addEventListener('click', () => {
			this.insert();
		});
		// The toolbar button is there in every edition, also where the host has no File menu for it.
		for (const opener of ['#insertDiagramMenuButton', '#quickDiagramButton']) element(opener).addEventListener('click', () => this.showDialog());
		for (const importer of ['#importDiagramButton', '#importDiagramFileButton']) element(importer).addEventListener('click', () => this.#fileInput.click());
		this.#fileInput.addEventListener('change', () => void this.importFile());
		this.#source.addEventListener('input', () => this.showError(''));
	}

	/** Draws the dialog's diagram and closes the dialog; whether it could be drawn. */
	insert(): boolean {
		try {
			const size = drawMermaidDiagram(this.#source.value);
			if (!this.documentModel.hasImage)
				this.images.createImage(DIAGRAM_IMAGE_NAME, diagramImageSpec(size));
			const origin = {
				x: Math.max(0, Math.round((this.documentModel.width - size.width) / HALF)),
				y: Math.max(0, Math.round((this.documentModel.height - size.height) / HALF)),
			};
			const { commands } = drawMermaidDiagram(this.#source.value, origin);
			this.commands.run({ kind: AssistantCommandKind.Batch, commands });
			this.showError('');
			this.dialog.close();
			return true;
		} catch (error) {
			this.showError(error instanceof Error ? error.message : String(error));
			return false;
		}
	}

	/** Inserts the diagram in a file; when it cannot be drawn, the dialog shows its code and what is wrong. */
	private async importFile(): Promise<void> {
		const file = this.#fileInput.files?.[0];
		this.#fileInput.value = '';
		if (!file) return;
		this.#source.value = mermaidCode(await file.text());
		if (!this.insert()) this.dialog.showModal();
	}

	private showDialog(): void {
		this.showError('');
		this.dialog.showModal();
		this.#source.focus();
	}

	private showError(message: string): void {
		this.#error.textContent = message;
	}
}
