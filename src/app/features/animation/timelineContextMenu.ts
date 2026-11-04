import { KeyboardKey } from '../../shared/input/keyboardKeys';
import type { TimelineCommand } from './timelineShortcuts';

/** One entry of the menu: what it does, how it is named, its key, and whether it can be chosen now. */
export interface TimelineMenuEntry {
	readonly command: TimelineCommand;
	readonly label: string;
	readonly shortcut: string;
	readonly enabled: boolean;
}

/** Menu entries in groups, a rule between each group. */
export type TimelineMenuGroups = readonly (readonly TimelineMenuEntry[])[];

const MenuClass = {
	Menu: 'menu-popover timeline-context-menu',
	Item: 'timeline-menu-item',
	Copy: 'menu-action-copy',
	Rule: 'menu-rule',
} as const;
const MENU_LABEL = 'Frame actions';

/**
 * The timeline's right-click menu, made as the application's menus are: a
 * popover of menu items with their keys. It closes when an item is chosen,
 * on Escape, or on a press anywhere else.
 */
export class TimelineContextMenu {
	readonly element = document.createElement('div');
	readonly #dismiss = (event: Event) => {
		if (!(event.target instanceof Node) || !this.element.contains(event.target)) this.close();
	};
	readonly #escape = (event: KeyboardEvent) => {
		if (event.key === KeyboardKey.Escape) this.close();
	};

	constructor(private readonly choose: (command: TimelineCommand) => void) {
		this.element.className = MenuClass.Menu;
		this.element.setAttribute('role', 'menu');
		this.element.setAttribute('aria-label', MENU_LABEL);
		this.element.hidden = true;
	}

	get open(): boolean {
		return !this.element.hidden;
	}

	/** Opens at a point on the screen, inside the window. */
	show(groups: TimelineMenuGroups, clientX: number, clientY: number): void {
		const rows = groups.flatMap((group, index) => [...(index ? [rule()] : []), ...group.map((entry) => this.item(entry))]);
		this.element.replaceChildren(...rows);
		this.element.hidden = false;
		const { width, height } = this.element.getBoundingClientRect();
		this.element.style.left = `${Math.max(0, Math.min(clientX, window.innerWidth - width))}px`;
		this.element.style.top = `${Math.max(0, Math.min(clientY, window.innerHeight - height))}px`;
		document.addEventListener('pointerdown', this.#dismiss, true);
		document.addEventListener('keydown', this.#escape, true);
		this.element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
	}

	close(): void {
		if (!this.open) return;
		this.element.hidden = true;
		document.removeEventListener('pointerdown', this.#dismiss, true);
		document.removeEventListener('keydown', this.#escape, true);
	}

	private item(entry: TimelineMenuEntry): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = MenuClass.Item;
		button.setAttribute('role', 'menuitem');
		button.dataset.command = entry.command;
		button.disabled = !entry.enabled;
		const copy = document.createElement('span');
		copy.className = MenuClass.Copy;
		copy.textContent = entry.label;
		button.append(copy);
		if (entry.shortcut) {
			const key = document.createElement('kbd');
			key.textContent = entry.shortcut;
			button.append(key);
		}
		button.addEventListener('click', () => {
			this.close();
			this.choose(entry.command);
		});
		return button;
	}
}

function rule(): HTMLElement {
	const element = document.createElement('div');
	element.className = MenuClass.Rule;
	return element;
}
