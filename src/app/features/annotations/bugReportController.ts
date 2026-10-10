import type { CaptureSourceMetadata } from '../../core/document/browserCapture';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CAPTURE_METADATA_KEY } from '../capture/browserCaptureImporter';
import type { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import type { AnnotationPanel } from './annotationPanel';
import { formatBugReport } from './bugReportMetadata';

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
	) {
		preferences.onRestore((saved) => {
			this.#reportEdited = saved?.reportEdited ?? false;
			this.refresh();
		});
		for (const control of [
			panel.expected,
			panel.actual,
			panel.includeUrl,
			panel.includeEnvironment,
		])
			control.addEventListener('input', () => {
				this.setEdited(false);
				this.refresh();
			});
		panel.reportPreview.addEventListener('input', () => this.setEdited(true));
		panel.copyReport.addEventListener(
			'click',
			() => void navigator.clipboard.writeText(panel.reportPreview.value),
		);
		documentModel.onDocumentChange(() => this.refresh());
	}

	private setEdited(edited: boolean): void {
		this.#reportEdited = edited;
		this.preferences.setExtra({ reportEdited: edited });
	}

	private refresh(): void {
		if (this.#reportEdited) return;
		this.panel.reportPreview.value = formatBugReport({
			source: this.documentModel.toolbarState<CaptureSourceMetadata>(
				CAPTURE_METADATA_KEY,
			),
			screenshot: {
				width: this.documentModel.width,
				height: this.documentModel.height,
			},
			expected: this.panel.expected.value,
			actual: this.panel.actual.value,
			includeUrl: this.panel.includeUrl.checked,
			includeEnvironment: this.panel.includeEnvironment.checked,
		});
	}
}
