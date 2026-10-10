import type { CaptureSourceMetadata } from '../../core/document/browserCapture';

export const QA_REPORTING_TITLE = 'QA Reporting';

export interface BugReportFields {
	readonly source?: CaptureSourceMetadata;
	readonly screenshot: Readonly<{ width: number; height: number }>;
	readonly title?: string;
	readonly ticketUrl?: string;
	readonly steps?: string;
	readonly expected: string;
	readonly actual: string;
}

/** A Markdown issue report with the original capture's source, never the editor URL. */
export function formatBugReport(fields: BugReportFields): string {
	const lines = [
		`# ${fields.title?.trim().replace(/[\r\n]+/g, ' ') || 'Issue report'}`,
		'',
	];
	if (fields.ticketUrl?.trim())
		lines.push(`Issue ticket: ${markdownUrl(fields.ticketUrl)}`, '');
	for (const [heading, content] of [
		['Steps to reproduce', fields.steps],
		['Expected behaviour', fields.expected],
		['Actual behaviour', fields.actual],
	] as const)
		lines.push(`## ${heading}`, '', content?.trim() || 'Not specified.', '');
	lines.push('## Capture details', '');
	const source = fields.source;
	if (source?.url) lines.push(`- Source page: ${markdownUrl(source.url)}`);
	lines.push(
		`- Screenshot: ${fields.screenshot.width} × ${fields.screenshot.height} px`,
	);
	if (source?.capturedAt) lines.push(`- Captured: ${source.capturedAt}`);
	if (source?.viewport)
		lines.push(
			`- Viewport: ${source.viewport.width} × ${source.viewport.height} px`,
		);
	if (source?.userAgent)
		lines.push(`- Browser / OS (user agent): ${source.userAgent}`);
	return `${lines.join('\n')}\n`;
}

function markdownUrl(url: string): string {
	return `<${url.trim().replace(/[<>\\\r\n]/g, (character) => encodeURIComponent(character))}>`;
}
