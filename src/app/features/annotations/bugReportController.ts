import type { CaptureSourceMetadata } from '../../core/document/browserCapture';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CAPTURE_METADATA_KEY } from '../capture/browserCaptureImporter';
import type { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import type { AnnotationPanel } from './annotationPanel';
import { formatBugReport } from './bugReportMetadata';
import { ClipboardController } from '../files/clipboardController';

/** What the capture toolbar keeps between sessions beyond its own controls. */
export interface BugReportPreferences {
	/** The report text was edited by hand, so it is no longer regenerated. */
	readonly reportEdited: boolean;
}

/**
 * The bug report that accompanies a capture: generated from the capture's
 * source, the screenshot size and the Expected/Actual fields until edited by
 * hand, and copied to the clipboard on request.
 */
export class BugReportController {
	#reportEdited = false;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly panel: AnnotationPanel,
		private readonly preferences: PersistentDocumentToolbar<BugReportPreferences>,
		private readonly clipboard: Pick<
			ClipboardController,
			'copy' | 'copyText'
		> = new ClipboardController(documentModel),
	) {
		preferences.onRestore((saved) => {
			this.#reportEdited = saved?.reportEdited ?? false;
			this.refresh();
		});
		for (const control of [
			panel.issueTitle,
			panel.ticketUrl,
			panel.steps,
			panel.expected,
			panel.actual,
		])
			control.addEventListener('input', () => {
				panel.showFeedback('');
				this.setEdited(false);
				this.refresh();
			});
		panel.reportPreview.addEventListener('input', () => {
			panel.showFeedback('');
			this.setEdited(true);
		});
		panel.copyReport.addEventListener('click', () => void this.copyReport());
		documentModel.onDocumentChange(() => {
			panel.showFeedback('');
			this.refresh();
		});
		panel.copyImage.addEventListener('click', () => void this.copyScreenshot());
		documentModel.onToolbarStateChange((key) => {
			if (key === CAPTURE_METADATA_KEY) this.refresh();
		});
		this.refresh();
	}

	private setEdited(edited: boolean): void {
		this.#reportEdited = edited;
		this.preferences.setExtra({ reportEdited: edited });
	}

	private refresh(): void {
		const source =
			this.documentModel.toolbarState<CaptureSourceMetadata>(
				CAPTURE_METADATA_KEY,
			);
		const sourceLabel =
			source?.url || 'No source page recorded for this image.';
		if (this.panel.sourcePage.textContent !== sourceLabel)
			this.panel.sourcePage.textContent = sourceLabel;
		if (this.#reportEdited) return;
		const report = this.documentModel.hasImage
			? formatBugReport({
					source,
					screenshot: {
						width: this.documentModel.width,
						height: this.documentModel.height,
					},
					expected: this.panel.expected.value,
					actual: this.panel.actual.value,
					title: this.panel.issueTitle.value,
					ticketUrl: this.panel.ticketUrl.value,
					steps: this.panel.steps.value,
				})
			: '';
		if (this.panel.reportPreview.value === report) return;
		this.panel.reportPreview.value = report;
		this.preferences.persist();
	}

	private async copyReport(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (!this.panel.ticketUrl.reportValidity()) {
			this.panel.showFeedback(
				'Enter a valid issue ticket URL, or leave it empty.',
				true,
			);
			return;
		}
		const copied = await this.clipboard.copyText(
			this.panel.reportPreview.value,
			'Markdown report',
		);
		this.panel.showFeedback(
			copied
				? 'Report copied as Markdown.'
				: 'Could not copy the report. Check clipboard permission.',
			!copied,
		);
	}

	private async copyScreenshot(): Promise<void> {
		const copied = await this.clipboard.copy();
		this.panel.showFeedback(
			copied
				? 'Annotated screenshot copied.'
				: 'Could not copy the screenshot. Check clipboard permission.',
			!copied,
		);
	}
}
