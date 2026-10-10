import type { Tool } from '../../core/document/appTypes';
import { toolsForToolbar } from '../drawing/drawingToolCatalog';
import { ToolButtonGroup } from '../workspace/genericToolbar';
import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarAutoOpenMode, ToolbarId } from '../workspace/toolbarTypes';
import { QA_REPORTING_TITLE } from './bugReportMetadata';

const ReportRows = { Steps: 4, Behaviour: 3, Markdown: 14 } as const;
const ReportControlId = {
	Title: 'annotationIssueTitle',
	TicketUrl: 'annotationTicketUrl',
	Steps: 'annotationSteps',
	Expected: 'annotationExpected',
	Actual: 'annotationActual',
	Markdown: 'annotationReportText',
} as const;
const TextInputType = { Text: 'text', Url: 'url' } as const;

/** Toolbar preferences key; distinct from the layers' document state. */
export const ANNOTATION_TOOLBAR_KEY = 'annotationToolbar';

/** Derived from the shared catalogue; this panel owns no drawing-tool definitions. */
export const CAPTURE_TOOLS: readonly Tool[] = toolsForToolbar(
	ToolbarId.Annotations,
).map((tool) => tool.id);

/** A view of the shared drawing tools with a document-persisted QA report form. */
export class AnnotationPanel {
	readonly element: HTMLElement;
	readonly tools = document.createElement('div');
	readonly issueTitle = input(
		ReportControlId.Title,
		TextInputType.Text,
		'Briefly describe the issue',
	);
	readonly ticketUrl = input(
		ReportControlId.TicketUrl,
		TextInputType.Url,
		'https://your-tracker.example/browse/QA-123',
	);
	readonly steps = textarea(
		ReportControlId.Steps,
		ReportRows.Steps,
		'1. Open the page\n2. Perform the action\n3. Observe the result',
	);
	readonly expected = textarea(
		ReportControlId.Expected,
		ReportRows.Behaviour,
		'What should happen?',
	);
	readonly actual = textarea(
		ReportControlId.Actual,
		ReportRows.Behaviour,
		'What happened instead?',
	);
	readonly reportPreview = textarea(
		ReportControlId.Markdown,
		ReportRows.Markdown,
	);
	readonly sourcePage = document.createElement('output');
	readonly copyReport = action('Copy report');
	readonly copyImage = action('Copy annotated screenshot');
	readonly feedback = document.createElement('p');
	readonly #toolButtons: ToolButtonGroup<Tool>;

	constructor(selectTool: (tool: Tool) => void) {
		const panel = createManagedPanel(
			ToolbarId.Annotations,
			QA_REPORTING_TITLE,
			{
				className: 'annotation-panel',
				autoOpenMode: ToolbarAutoOpenMode.Annotate,
				defaultDock: ToolbarDock.Left,
			},
		);
		this.element = panel.element;
		this.element.dataset.toolbarKey = ANNOTATION_TOOLBAR_KEY;
		const content = document.createElement('div');
		content.className = 'annotation-content';
		const introduction = document.createElement('p');
		introduction.className = 'annotation-introduction';
		introduction.textContent =
			'Annotate a screenshot and prepare an issue report.';
		this.tools.className = 'annotation-tool-grid';
		this.tools.setAttribute('role', 'group');
		this.tools.setAttribute('aria-label', 'Screenshot annotations');
		this.#toolButtons = new ToolButtonGroup(
			this.tools,
			toolsForToolbar(ToolbarId.Annotations),
			selectTool,
		);
		this.sourcePage.className = 'annotation-source-page';
		this.sourcePage.setAttribute('aria-label', 'Source page');
		const issue = section(
			'Issue details',
			field('Issue title', this.issueTitle),
			field('Issue ticket URL', this.ticketUrl),
			field('Steps to reproduce', this.steps),
			field('Expected behaviour', this.expected),
			field('Actual behaviour', this.actual),
		);
		this.reportPreview.className = 'annotation-markdown';
		this.reportPreview.setAttribute('aria-label', 'Editable Markdown report');
		this.reportPreview.spellcheck = false;
		const report = document.createElement('details');
		report.className = 'annotation-report';
		report.open = true;
		const summary = document.createElement('summary');
		summary.textContent = 'Markdown report';
		const hint = document.createElement('p');
		hint.className = 'annotation-report-hint';
		hint.textContent =
			'You can edit the Markdown before copying. Changing issue details regenerates the report.';
		report.append(summary, hint, this.reportPreview);
		content.append(
			introduction,
			section('Screenshot annotations', this.tools),
			issue,
			section('Source page', this.sourcePage),
			report,
		);
		const footer = document.createElement('div');
		footer.className = 'annotation-footer';
		const actions = document.createElement('div');
		actions.className = 'annotation-actions';
		this.copyReport.classList.add('primary');
		this.feedback.className = 'annotation-feedback';
		this.feedback.setAttribute('role', 'status');
		this.feedback.setAttribute('aria-live', 'polite');
		actions.append(this.copyReport, this.copyImage);
		footer.append(actions, this.feedback);
		panel.body.append(content, footer);
	}

	showActiveTool(tool: Tool): void {
		this.#toolButtons.showActiveTool(tool);
	}
	showFeedback(message: string, error = false): void {
		this.feedback.textContent = message;
		this.feedback.classList.toggle('error', error);
	}
}

function input(
	id: string,
	type: (typeof TextInputType)[keyof typeof TextInputType],
	placeholder: string,
): HTMLInputElement {
	const control = document.createElement('input');
	control.id = id;
	control.type = type;
	control.placeholder = placeholder;
	if (type === TextInputType.Url) {
		control.autocomplete = 'off';
		control.spellcheck = false;
	}
	return control;
}

function textarea(
	id: string,
	rows: number,
	placeholder = '',
): HTMLTextAreaElement {
	const control = document.createElement('textarea');
	control.id = id;
	control.rows = rows;
	control.placeholder = placeholder;
	return control;
}

function action(label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'annotation-action';
	button.textContent = label;
	return button;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
	const result = document.createElement('label');
	result.append(document.createTextNode(label), control);
	return result;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
	const result = document.createElement('section');
	const heading = document.createElement('h3');
	heading.textContent = title;
	result.append(heading, ...children);
	return result;
}
