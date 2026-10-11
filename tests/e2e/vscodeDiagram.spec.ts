import { expect, type Page, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { AssistantCommandKind, type AssistantResult } from '../../src/app/features/assistant/assistantCommandTypes';
import { drawMermaidFlowchart } from '../../src/app/features/diagrams/diagramDrawing';
import { HostMessageType, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const ARCHITECTURE = `flowchart LR
  subgraph shells [Shells]
    web[Web app]
    chrome[Chrome extension]
    vscode[VS Code extension]
  end
  subgraph core [Shared editor]
    editor[Editor UI] --> layers[(Layers & history)]
    editor --> diagrams[Diagram layout]
  end
  web & chrome & vscode --> editor
  vscode -->|MCP| assistant((AI assistant))
  assistant -.->|draw| diagrams`;

test('a Mermaid diagram becomes editable shapes on named layers in the editor', async ({ page }) => {
	const drawing = drawMermaidFlowchart(ARCHITECTURE);
	await openVsCodeWebview(page);
	await sendToWebview(page, {
		type: HostMessageType.Create,
		fileName: 'architecture.png',
		image: { width: drawing.width, height: drawing.height, background: ColorPalette.White, transparent: false },
	});
	await expect(page.locator('#dimensions')).toHaveText(`${drawing.width} × ${drawing.height} px`);
	await sendToWebview(page, { type: HostMessageType.Command, requestId: 1, command: { kind: AssistantCommandKind.Batch, commands: drawing.commands } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).length).toBe(1);
	const [done] = await sentToHost(page, WebviewMessageType.CommandDone);
	if (!done || 'error' in done) throw new Error(done && 'error' in done ? done.error : 'no answer');
	const result: AssistantResult = done.result;
	expect(result).toEqual({ batch: { layers: ['Groups', 'Connections', 'Nodes'], items: drawing.commands.length - 3 } });
	for (const layer of ['Groups', 'Connections', 'Nodes']) await expect(page.locator('.layer-row', { hasText: layer })).toHaveCount(1);
	await page.locator('#canvasWrap').screenshot({ path: 'test-results/diagram/architecture.png' });
	await expectNodeFill(page);
});

/** The middle of the first node shows the node colour, so the shapes really are drawn. */
async function expectNodeFill(page: Page): Promise<void> {
	const drawing = drawMermaidFlowchart(ARCHITECTURE);
	const node = drawing.commands.find((command) => command.kind === AssistantCommandKind.AddShape && (command.fillColor ?? command.color) === ColorPalette.Porcelain && command.fill);
	if (!node || node.kind !== AssistantCommandKind.AddShape) throw new Error('no node');
	const pixel = await page.evaluate(
		({ x, y }) => Array.from(document.querySelector<HTMLCanvasElement>('.annotation-canvas')!.getContext('2d')!.getImageData(x, y, 1, 1).data),
		{ x: node.rect.x + 6, y: node.rect.y + 6 },
	);
	expect(pixel.slice(0, 3)).toEqual([0xf4, 0xf5, 0xf8]);
}
