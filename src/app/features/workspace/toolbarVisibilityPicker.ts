import type { ManagedToolbarPanel } from './managedToolbarPanel';
import {
	KeyboardKey,
	VerticalNavigationKeys,
} from '../../shared/input/keyboardKeys';

const NEXT_OPTION_OFFSET = 1;
const PREVIOUS_OPTION_OFFSET = -1;

export class ToolbarVisibilityPicker {
	readonly element = document.createElement('div');
	readonly trigger = document.createElement('button');
	readonly list = document.createElement('fieldset');
	readonly #toggles = new Map<string, HTMLInputElement>();

	constructor(
		host: HTMLElement,
		panels: readonly ManagedToolbarPanel[],
		onVisibilityChange: (key: string, visible: boolean) => void,
	) {
		this.element.className = 'toolbar-picker';
		this.configureTrigger();
		this.configureList(panels, onVisibilityChange);
		this.bindKeyboard();
		document.addEventListener('click', (event) => {
			if (!this.element.contains(event.target as Node)) this.setOpen(false);
		});
		this.element.append(this.trigger, this.list);
		host.append(this.element);
	}

	sync(panel: ManagedToolbarPanel): void {
		const toggle = this.#toggles.get(panel.key);
		if (!toggle) return;
		toggle.checked = panel.visible;
		toggle.setAttribute('aria-selected', String(panel.visible));
	}

	private configureTrigger(): void {
		this.trigger.type = 'button';
		this.trigger.id = 'toolbarPickerButton';
		this.trigger.className = 'icon-button toolbar-picker-trigger';
		this.trigger.title = 'Show or hide toolbars';
		this.trigger.setAttribute('aria-label', 'Toolbars');
		this.trigger.setAttribute('aria-haspopup', 'listbox');
		this.trigger.setAttribute('aria-expanded', 'false');
		this.trigger.innerHTML =
			'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="7"></rect><rect x="14" y="4" width="7" height="7"></rect><rect x="3" y="15" width="7" height="5"></rect><rect x="14" y="15" width="7" height="5"></rect></svg><span>Toolbars</span>';
		this.trigger.addEventListener('click', (event) => {
			event.stopPropagation();
			this.setOpen(this.list.classList.contains('hidden'));
		});
	}

	private configureList(
		panels: readonly ManagedToolbarPanel[],
		onVisibilityChange: (key: string, visible: boolean) => void,
	): void {
		this.list.className = 'toolbar-visibility hidden';
		this.list.setAttribute('role', 'listbox');
		this.list.setAttribute('aria-label', 'Toolbars');
		for (const panel of panels) {
			const label = document.createElement('label');
			const toggle = document.createElement('input');
			toggle.type = 'checkbox';
			toggle.checked = panel.visible;
			toggle.dataset.panelToggle = panel.key;
			toggle.setAttribute('role', 'option');
			toggle.setAttribute('aria-selected', String(toggle.checked));
			toggle.addEventListener('change', () =>
				onVisibilityChange(panel.key, toggle.checked),
			);
			label.append(toggle, panel.title);
			this.list.append(label);
			this.#toggles.set(panel.key, toggle);
		}
	}

	private bindKeyboard(): void {
		this.trigger.addEventListener('keydown', (event) => {
			if (event.key === KeyboardKey.ArrowDown) {
				event.preventDefault();
				this.setOpen(true);
				this.options[0]?.focus();
			} else if (event.key === KeyboardKey.Escape) {
				event.preventDefault();
				this.setOpen(false);
			}
		});
		this.list.addEventListener('keydown', (event) => {
			const options = this.options;
			const index = options.indexOf(event.target as HTMLInputElement);
			if (event.key === KeyboardKey.Escape) {
				event.preventDefault();
				this.setOpen(false);
				this.trigger.focus();
				return;
			}
			if (event.key === KeyboardKey.Tab) {
				this.setOpen(false);
				return;
			}
			if (!VerticalNavigationKeys.has(event.key)) return;
			event.preventDefault();
			if (event.key === KeyboardKey.Home) options[0]?.focus();
			else if (event.key === KeyboardKey.End)
				options.at(PREVIOUS_OPTION_OFFSET)?.focus();
			else
				options[
					(index +
						(event.key === KeyboardKey.ArrowDown
							? NEXT_OPTION_OFFSET
							: PREVIOUS_OPTION_OFFSET) +
						options.length) %
						options.length
				]?.focus();
		});
	}

	private get options(): HTMLInputElement[] {
		return [...this.#toggles.values()];
	}

	private setOpen(open: boolean): void {
		this.list.classList.toggle('hidden', !open);
		this.trigger.setAttribute('aria-expanded', String(open));
	}
}
