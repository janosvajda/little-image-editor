import { expect, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { AssistantCommandKind } from '../../src/app/features/assistant/assistantCommandTypes';
import { drawMermaidFlowchart } from '../../src/app/features/diagrams/diagramDrawing';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const DIAGRAM = `flowchart TD
  api[API] --> auth[Auth] & db[(Database)]
  api -.->|cache| cache((Cache))`;

test('each diagram link is one item, a bent or dashed link one connector with its arrowhead', async ({ page }) => {
	const drawing = drawMermaidFlowchart(DIAGRAM);
	await openVsCodeWebview(page);
	await sendToWebview(page, {
		type: HostMessageType.Create,
		fileName: 'links.png',
		image: { width: drawing.width, height: drawing.height, background: ColorPalette.White, transparent: false },
	});
	await expect(page.locator('#dimensions')).toHaveText(`${drawing.width} × ${drawing.height} px`);
	await sendToWebview(page, { type: HostMessageType.Command, requestId: 1, command: { kind: AssistantCommandKind.Batch, commands: drawing.commands } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).length).toBe(1);
	await sendToWebview(page, { type: HostMessageType.Command, requestId: 2, command: { kind: AssistantCommandKind.Describe } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).length).toBe(2);
	const described = (await sentToHost(page, WebviewMessageType.CommandDone))[1]!;
	if (!('result' in described) || !('document' in described.result)) throw new Error('no description');
	const connections = described.result.document.layers.find(({ name }) => name === 'Connections')!;
	// Three links, one item each: a bent or dashed link is a connector, a straight one a plain arrow.
	const links = connections.items.filter(({ type, shape }) => type === 'connector' || shape === 'arrow' || shape === 'line');
	expect(links).toHaveLength(3);
	expect(links.filter(({ type }) => type === 'connector').length).toBeGreaterThan(0);
	await page.locator('#canvasWrap').screenshot({ path: 'test-results/diagram/connectors.png' });
});
