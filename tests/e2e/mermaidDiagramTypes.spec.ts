import { expect, type Page, test } from '@playwright/test';

const LayerName = '[data-panel="layers"] .layer-row .layer-name';
const ItemRow = '[data-panel="layers"] .layer-item-row';
const DIAGRAMS = {
	state: {
		source: `stateDiagram-v2
  [*] --> Idle
  Idle --> Loading : fetch
  Loading --> Failed : error
  Failed --> Loading : retry
  Loading --> [*]
  note right of Failed : shows a retry button`,
		layers: ['Connections', 'Nodes'],
	},
	class: {
		source: `classDiagram
  class Animal {
    <<abstract>>
    +String name
    +makeSound() void
  }
  Animal <|-- Duck
  Zoo "1" *-- "many" Animal : houses`,
		layers: ['Connections', 'Nodes'],
	},
	sequence: {
		source: `sequenceDiagram
  actor User
  participant API
  User->>+API: GET /items
  alt cached
    API-->>User: items
  else
    API--x User: timeout
  end
  deactivate API
  Note right of API: logs it`,
		layers: ['Frames', 'Lifelines', 'Messages', 'Notes', 'Participants'],
	},
} as const;

for (const [kind, { source, layers }] of Object.entries(DIAGRAMS))
	test(`a ${kind} diagram inserted from the File menu becomes editable layers`, async ({ page }) => {
		await page.addInitScript(() => localStorage.clear());
		await page.goto('/');
		await page.locator('#fileMenu summary').click();
		await page.getByRole('menuitem', { name: 'Insert Mermaid diagram…' }).click();
		await page.locator('#mermaidSource').fill(source);
		await page.locator('#insertDiagramButton').click();
		await expect(page.locator('#diagramDialog')).toBeHidden();
		await expect(page.locator('#dimensions')).not.toHaveText('No image');
		await showLayers(page);
		for (const layer of layers) await expect(page.locator(LayerName, { hasText: layer }).first()).toBeVisible();
		await page.locator('#canvasWrap').screenshot({ path: `test-results/diagram/${kind}.png` });
	});

test('the elbow arrow offers every line end for its start and end', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await showLayers(page);
	await expect(page.locator('#lineHeadSelect')).toBeHidden();
	await page.getByRole('button', { name: 'Choose shape tools' }).click();
	await page.getByRole('menu', { name: 'Shape tools' }).getByRole('menuitem', { name: 'Elbow arrow', exact: true }).click();
	await expect(page.locator('#lineHeadSelect')).toHaveValue('arrow');
	await expect(page.locator('#lineTailSelect')).toHaveValue('none');
	await page.locator('#lineTailSelect').selectOption({ label: 'Filled diamond' });
	await page.locator('#lineHeadSelect').selectOption({ label: 'Hollow triangle' });
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(box.x + 300, box.y + 200);
	await page.mouse.down();
	await page.mouse.move(box.x + 600, box.y + 360, { steps: 8 });
	await page.mouse.up();
	await expect(page.locator(ItemRow)).toHaveCount(1);
	await expect(page.locator(ItemRow)).toContainText('Connector');
	await page.locator('#canvasWrap').screenshot({ path: 'test-results/diagram/elbow-ends.png' });
});

async function showLayers(page: Page): Promise<void> {
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}
