import type { CaptureSourceMetadata } from '../../core/document/browserCapture';

export interface BugReportFields {
	source?: CaptureSourceMetadata;
	screenshot: Readonly<{ width: number; height: number }>;
	expected: string;
	actual: string;
	includeUrl: boolean;
	includeEnvironment: boolean;
}

export function formatBugReport(fields: BugReportFields): string {
	const lines = [
		'Bug report',
		'',
		`Expected: ${fields.expected || '—'}`,
		`Actual: ${fields.actual || '—'}`,
	];
	if (fields.includeUrl && fields.source?.url)
		lines.push('', `Page: ${fields.source.url}`);
	lines.push(
		`Screenshot: ${fields.screenshot.width} × ${fields.screenshot.height} px`,
	);
	if (fields.includeEnvironment && fields.source) {
		lines.push(
			`Captured: ${fields.source.capturedAt}`,
			`Viewport: ${fields.source.viewport.width} × ${fields.source.viewport.height} px`,
			`Browser / OS: ${fields.source.userAgent}`,
		);
	}
	return lines.join('\n');
}
