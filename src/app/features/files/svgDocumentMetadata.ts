import type { CaptureSourceMetadata } from '../../core/document/browserCapture';
import { ANNOTATION_TOOLBAR_KEY, ReportControlId } from '../annotations/annotationPanel';
import type { BugReportPreferences } from '../annotations/bugReportController';
import { CAPTURE_METADATA_KEY } from '../capture/browserCaptureImporter';
import type { DocumentToolbarState } from '../workspace/genericToolbar';
import { escapeXml, svgElement } from './svgRecordingContext';

/**
 * What a document says about itself beyond its drawing, kept in the SVG's
 * own `metadata`: the QA report written for a capture, and the page the
 * capture came from. Its fields are named for what they are, in a namespace
 * of their own, so other SVG tools leave them alone.
 */

export const QA_REPORT_NAMESPACE = 'urn:little-image-editor:qa-report';
const PREFIX = 'qa';

const ReportElement = { Report: 'report', Source: 'source' } as const;

/** Each report field, as the report names it, and the control of the form that holds it. */
const REPORT_FIELDS: Readonly<Record<string, (typeof ReportControlId)[keyof typeof ReportControlId]>> = {
	title: ReportControlId.Title,
	ticket: ReportControlId.TicketUrl,
	steps: ReportControlId.Steps,
	expected: ReportControlId.Expected,
	actual: ReportControlId.Actual,
	report: ReportControlId.Markdown,
};

const ReportAttribute = { Edited: 'edited' } as const;
const SourceAttribute = { Url: 'url', CapturedAt: 'captured-at', UserAgent: 'user-agent', Width: 'viewport-width', Height: 'viewport-height' } as const;
const EDITED = 'true';

type ReportState = DocumentToolbarState<BugReportPreferences>;

/** The document's own states its SVG keeps, by the keys the editor keeps them under. */
export type DocumentStates = Readonly<Record<string, unknown>>;

/** The document's report and capture source as SVG metadata; nothing when it has neither. */
export function documentMetadata(stateOf: (key: string) => unknown): string {
	const report = stateOf(ANNOTATION_TOOLBAR_KEY) as ReportState | undefined;
	const source = stateOf(CAPTURE_METADATA_KEY) as CaptureSourceMetadata | undefined;
	const edited = report?.extra?.reportEdited === true;
	const fields = Object.entries(REPORT_FIELDS).flatMap(([name, control]) => {
		const value = report?.controls[control];
		// The report text writes itself from the other fields until it is edited by hand, so only an edited one is the document's own.
		if (control === ReportControlId.Markdown && !edited) return [];
		return typeof value === 'string' && value ? [svgElement(qualified(name), {}, escapeXml(value))] : [];
	});
	const sourceElement = source
		? svgElement(qualified(ReportElement.Source), {
				[SourceAttribute.Url]: source.url,
				[SourceAttribute.CapturedAt]: source.capturedAt,
				[SourceAttribute.UserAgent]: source.userAgent,
				[SourceAttribute.Width]: source.viewport.width,
				[SourceAttribute.Height]: source.viewport.height,
			})
		: '';
	if (!fields.length && !sourceElement) return '';
	const reportElement = svgElement(
		qualified(ReportElement.Report),
		{ [`xmlns:${PREFIX}`]: QA_REPORT_NAMESPACE, [ReportAttribute.Edited]: edited ? EDITED : undefined },
		`${fields.join('')}${sourceElement}`,
	);
	return svgElement('metadata', {}, reportElement);
}

/** The document's report and capture source from an SVG's metadata, as the states the editor keeps them in. */
export function readDocumentMetadata(root: Element): DocumentStates {
	const [report] = root.getElementsByTagNameNS(QA_REPORT_NAMESPACE, ReportElement.Report);
	if (!report) return {};
	const field = (name: string) => report.getElementsByTagNameNS(QA_REPORT_NAMESPACE, name)[0]?.textContent ?? undefined;
	const controls = Object.fromEntries(Object.entries(REPORT_FIELDS).flatMap(([name, control]) => {
		const value = field(name);
		return value === undefined ? [] : [[control, value]];
	}));
	const source = capturedSource(report.getElementsByTagNameNS(QA_REPORT_NAMESPACE, ReportElement.Source)[0]);
	return {
		[ANNOTATION_TOOLBAR_KEY]: { controls, extra: { reportEdited: report.getAttribute(ReportAttribute.Edited) === EDITED } } satisfies ReportState,
		...(source ? { [CAPTURE_METADATA_KEY]: source } : {}),
	};
}

function capturedSource(element: Element | undefined): CaptureSourceMetadata | null {
	const url = element?.getAttribute(SourceAttribute.Url);
	if (!element || url === null || url === undefined) return null;
	return {
		url,
		capturedAt: element.getAttribute(SourceAttribute.CapturedAt) ?? '',
		userAgent: element.getAttribute(SourceAttribute.UserAgent) ?? '',
		viewport: { width: Number(element.getAttribute(SourceAttribute.Width)) || 0, height: Number(element.getAttribute(SourceAttribute.Height)) || 0 },
	};
}

function qualified(name: string): string {
	return `${PREFIX}:${name}`;
}
