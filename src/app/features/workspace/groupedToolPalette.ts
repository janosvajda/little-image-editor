import type { ToolDefinition } from '../drawing/drawingToolCatalog';

export interface ToolPaletteGroup<TTool extends string> {
	readonly label: string;
	readonly select: HTMLSelectElement;
	readonly tools: readonly ToolDefinition<TTool>[];
}

export class GroupedToolPalette<TTool extends string> {
	readonly #groupButtons = new Map<
		HTMLButtonElement,
		ToolPaletteGroup<TTool>
	>();
	readonly #menuTriggers = new Map<HTMLButtonElement, HTMLElement>();
	#activeTool: TTool;
	#openFlyout: HTMLElement | null = null;
	#openTrigger: HTMLButtonElement | null = null;

	constructor(
		readonly root: HTMLElement,
		readonly groups: readonly ToolPaletteGroup<TTool>[],
		activeTool: TTool,
		readonly selectTool: (tool: TTool) => void,
	) {
		this.#activeTool = activeTool;
		root.classList.add('grouped-tool-palette');
		this.renderGroups();
		document.addEventListener('pointerdown', (event) => {
			if (!root.contains(event.target as Node)) this.closeFlyout();
		});
		this.update(activeTool);
	}

	update(tool: TTool): void {
		const toolChanged = tool !== this.#activeTool;
		this.#activeTool = tool;
		if (toolChanged) this.closeFlyout();
		this.#groupButtons.forEach((group, button) => {
			const selected =
				group.tools.find((candidate) => candidate.id === group.select.value) ??
				group.tools[0]!;
			button.querySelector<HTMLElement>('.palette-icon')!.innerHTML =
				selected.icon;
			button.querySelector<HTMLElement>('.palette-name')!.textContent =
				selected.label;
			button.classList.toggle(
				'active',
				group.tools.some((candidate) => candidate.id === tool),
			);
			button.title = `Activate ${selected.label}`;
			button.setAttribute('aria-label', `${group.label}: ${selected.label}`);
		});
	}

	private renderGroups(): void {
		[...this.groups].reverse().forEach((group, reverseIndex) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'palette-group';
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'tool palette-group-button';
			button.innerHTML =
				'<span class="palette-icon"></span><small class="palette-name"></small>';
			const trigger = document.createElement('button');
			trigger.type = 'button';
			trigger.className = 'palette-menu-trigger';
			trigger.setAttribute('aria-haspopup', 'menu');
			trigger.setAttribute('aria-expanded', 'false');
			trigger.setAttribute('aria-label', `Choose ${group.label.toLowerCase()}`);
			trigger.title = `Choose ${group.label.toLowerCase()}`;
			trigger.innerHTML = '<i aria-hidden="true"></i>';
			const flyout = this.createFlyout(
				group,
				this.groups.length - reverseIndex - 1,
			);
			wrapper.append(button, trigger);
			this.root.prepend(wrapper);
			this.root.insertBefore(flyout, this.root.querySelector('.utility-tool'));
			this.#groupButtons.set(button, group);
			this.#menuTriggers.set(trigger, flyout);

			button.addEventListener('click', () => {
				this.closeFlyout();
				this.selectTool(group.select.value as TTool);
			});
			button.addEventListener('contextmenu', (event) => {
				event.preventDefault();
				this.open(flyout, trigger);
			});
			trigger.addEventListener('click', (event) => {
				event.stopPropagation();
				this.toggleFlyout(flyout, trigger);
			});
			trigger.addEventListener('keydown', (event) => {
				if (event.key !== 'ArrowDown') return;
				event.preventDefault();
				this.open(flyout, trigger);
				flyout.querySelector<HTMLButtonElement>('button')?.focus();
			});
		});
	}

	private createFlyout(
		group: ToolPaletteGroup<TTool>,
		index: number,
	): HTMLElement {
		const flyout = document.createElement('div');
		flyout.className = `tool-flyout hidden${index % 2 ? ' align-right' : ''}`;
		flyout.setAttribute('role', 'menu');
		flyout.setAttribute('aria-label', group.label);
		flyout.append(
			...group.tools.map((tool) => {
				const option = document.createElement('button');
				option.type = 'button';
				option.setAttribute('role', 'menuitem');
				option.title = tool.title;
				option.setAttribute('aria-label', tool.label);
				option.innerHTML = `<span>${tool.icon}</span><small>${tool.label}</small>`;
				option.addEventListener('click', (event) => {
					event.stopPropagation();
					group.select.value = tool.id;
					group.select.dispatchEvent(new Event('change', { bubbles: true }));
					this.closeFlyout(event.detail === 0);
				});
				return option;
			}),
		);
		flyout.addEventListener('keydown', (event) =>
			this.navigateFlyout(event, flyout),
		);
		return flyout;
	}

	private toggleFlyout(flyout: HTMLElement, trigger: HTMLButtonElement): void {
		if (flyout === this.#openFlyout) this.closeFlyout();
		else this.open(flyout, trigger);
	}

	private open(flyout: HTMLElement, trigger: HTMLButtonElement): void {
		this.closeFlyout();
		flyout.classList.remove('hidden');
		trigger.setAttribute('aria-expanded', 'true');
		this.#openFlyout = flyout;
		this.#openTrigger = trigger;
	}

	private closeFlyout(restoreFocus = false): void {
		const trigger = this.#openTrigger;
		this.#openFlyout?.classList.add('hidden');
		this.#menuTriggers.forEach((_flyout, trigger) =>
			trigger.setAttribute('aria-expanded', 'false'),
		);
		this.#openFlyout = null;
		this.#openTrigger = null;
		if (restoreFocus) trigger?.focus();
	}

	private navigateFlyout(event: KeyboardEvent, flyout: HTMLElement): void {
		const items = [
			...flyout.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
		];
		const index = items.indexOf(event.target as HTMLButtonElement);
		if (event.key === 'Escape') {
			event.preventDefault();
			this.closeFlyout(true);
			return;
		}
		if (event.key === 'Tab') {
			this.closeFlyout();
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Home') items[0]?.focus();
		else if (event.key === 'End') items.at(-1)?.focus();
		else
			items[
				(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
					items.length
			]?.focus();
	}
}
