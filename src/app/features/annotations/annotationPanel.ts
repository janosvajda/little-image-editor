import {
	MarkupToolId,
	ShapeToolId,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import {
	DRAWING_TOOL_DEFINITIONS,
	type ToolDefinition,
} from '../drawing/drawingToolCatalog';
import { createToolButton } from '../workspace/genericToolbar';
import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarAutoOpenMode, ToolbarId } from '../workspace/toolbarTypes';

const BUG_REPORT_VISIBLE_ROWS = 7;

/** Toolbar preferences key; distinct from the layers' document state. */
export const ANNOTATION_TOOLBAR_KEY = 'annotationToolbar';

/** The shared tools this toolbar offers for marking up a screenshot. */
export const CAPTURE_TOOLS: readonly Tool[] = [
	UtilityToolId.Select,
	ShapeToolId.Arrow,
	MarkupToolId.Number,
	ShapeToolId.Rectangle,
	MarkupToolId.Highlight,
	MarkupToolId.Text,
	MarkupToolId.Blur,
	MarkupToolId.Redact,
	UtilityToolId.Crop,
];

/**
 * Capture & annotate: opens on its own after a browser capture. Its buttons
 * pick the same shared tools as the Tools panel, and it holds the bug report
 * that goes with the capture.
 */
export class AnnotationPanel {
	readonly element: HTMLElement;
	readonly tools = document.createElement('div');
	readonly reportPreview = document.createElement('textarea');
	readonly expected = input('text', '', { placeholder: 'Expected result' });
	readonly actual = input('text', '', { placeholder: 'Actual result' });
	readonly includeUrl = checkbox(true);
	readonly includeEnvironment = checkbox(true);
	readonly copyReport = action('⧉', 'Copy report details');

	constructor(selectTool: (tool: Tool) => void) {
		const panel = createManagedPanel(
			ToolbarId.Annotations,
			'Capture & annotate',
			{
				className: 'annotation-panel',
				autoOpenMode: ToolbarAutoOpenMode.Annotate,
				defaultDock: ToolbarDock.Left,
			},
		);
		this.element = panel.element;
		this.element.dataset.toolbarKey = ANNOTATION_TOOLBAR_KEY;
		this.expected.id = 'annotationExpected';
		this.actual.id = 'annotationActual';
		this.includeUrl.id = 'annotationIncludeUrl';
		this.includeEnvironment.id = 'annotationIncludeEnvironment';
		this.reportPreview.id = 'annotationReportText';
		this.tools.className = 'annotation-tool-grid';
		this.tools.setAttribute('aria-label', 'Capture tools');
		this.tools.append(...captureToolDefinitions().map(createToolButton));
		this.tools.addEventListener('click', (event) => {
			const tool = (event.target as HTMLElement).closest<HTMLElement>(
				'[data-tool]',
			)?.dataset.tool;
			const chosen = CAPTURE_TOOLS.find((candidate) => candidate === tool);
			if (chosen) selectTool(chosen);
		});
		const report = section(
			'Bug report',
			field('Expected', this.expected),
			field('Actual', this.actual),
			checkField('Include page URL', this.includeUrl),
			checkField('Include environment', this.includeEnvironment),
		);
		this.reportPreview.rows = BUG_REPORT_VISIBLE_ROWS;
		this.reportPreview.setAttribute('aria-label', 'Editable bug report');
		report.append(this.reportPreview, this.copyReport);
		panel.body.append(this.tools, report);
	}

	/** Marks the shared tool in use, wherever it was chosen. */
	showActiveTool(tool: Tool): void {
		for (const button of this.tools.querySelectorAll<HTMLElement>('[data-tool]'))
			button.classList.toggle('active', button.dataset.tool === tool);
	}
}

function captureToolDefinitions(): ToolDefinition<Tool>[] {
	return CAPTURE_TOOLS.flatMap((tool) => {
		const definition = DRAWING_TOOL_DEFINITIONS.find(
			(candidate) => candidate.id === tool,
		);
		return definition ? [definition] : [];
	});
}

function input(
	type: string,
	value: string,
	attributes: Record<string, string> = {},
): HTMLInputElement {
	const result = document.createElement('input');
	result.type = type;
	result.value = value;
	Object.entries(attributes).forEach(([name, content]) =>
		result.setAttribute(name, content),
	);
	return result;
}

function checkbox(checked: boolean): HTMLInputElement {
	const result = input('checkbox', '');
	result.checked = checked;
	return result;
}

function action(icon: string, label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'annotation-action';
	button.textContent = icon;
	button.title = label;
	button.setAttribute('aria-label', label);
	return button;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
	const result = document.createElement('label');
	result.append(document.createTextNode(label), control);
	return result;
}

function checkField(label: string, control: HTMLInputElement): HTMLLabelElement {
	const result = field(label, control);
	result.className = 'annotation-check';
	return result;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
	const result = document.createElement('section');
	const heading = document.createElement('h3');
	heading.textContent = title;
	result.append(heading, ...children);
	return result;
}
