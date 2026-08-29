import {
	captureControlState,
	restoreControlState,
	restoreToolState,
	saveToolState,
	type PersistedValue,
} from './toolStatePersistence';
import type { ToolDefinition } from '../drawing/drawingToolCatalog';
import type { CanvasDocument } from '../../core/document/imageDocument';

export interface SelectToolGroup<TTool extends string> {
	control: HTMLElement;
	icon: HTMLElement;
	select: HTMLSelectElement;
	tools: readonly ToolDefinition<TTool>[];
	defaultTool: TTool;
}

export interface GenericToolbarOptions<TTool extends string> {
	root: HTMLElement;
	tools: readonly ToolDefinition<TTool>[];
	selectGroups: readonly SelectToolGroup<TTool>[];
	buttonContainer: HTMLElement;
	buttonTools: readonly ToolDefinition<TTool>[];
	defaultTool: TTool;
	documentModel?: CanvasDocument;
	stateKey?: string;
	profiledControlIds?: readonly string[];
}

interface GenericToolbarDocumentState {
	readonly activeTool?: string;
	readonly controls?: Record<string, PersistedValue>;
	readonly controlProfiles?: Record<
		string,
		Record<string, PersistedValue>
	>;
}

export class GenericToolbar<TTool extends string> {
	readonly restoredControlIds: ReadonlySet<string>;
	#activeTool: TTool;
	#defaultControls: Record<string, PersistedValue> = {};
	readonly #controlProfiles = new Map<
		TTool,
		Record<string, PersistedValue>
	>();
	#listeners = new Set<(tool: TTool) => void>();

	constructor(readonly options: GenericToolbarOptions<TTool>) {
		options.root.dataset.toolbarManaged = 'true';
		this.render();
		this.#defaultControls = captureControlState(options.root);
		const restored = options.documentModel
			? { activeTool: null, restoredControlIds: new Set<string>() }
			: restoreToolState(options.root);
		this.restoredControlIds = restored.restoredControlIds;
		this.#activeTool = this.hasTool(restored.activeTool)
			? restored.activeTool
			: options.defaultTool;
		this.captureActiveProfile();
		this.bindEvents();
		this.updateSelection();
		this.persist();
		options.documentModel?.onDocumentChange(({ hasImage }) => {
			if (hasImage) this.restoreDocumentState();
		});
	}

	get activeTool(): TTool {
		return this.#activeTool;
	}

	select(tool: TTool): void {
		if (!this.hasTool(tool)) return;
		if (tool !== this.#activeTool) {
			this.captureActiveProfile();
			this.restoreProfile(tool);
		}
		this.#activeTool = tool;
		this.updateSelection();
		this.persist();
		this.#listeners.forEach((listener) => listener(tool));
	}

	onSelection(listener: (tool: TTool) => void): void {
		this.#listeners.add(listener);
	}
	persist(): void {
		this.captureActiveProfile();
		if (this.options.documentModel) {
			this.options.documentModel.setToolbarState(
				this.options.stateKey ?? 'toolbar',
				{
					activeTool: this.#activeTool,
					controls: captureControlState(this.options.root),
					controlProfiles: Object.fromEntries(this.#controlProfiles),
				},
			);
		} else saveToolState(this.options.root, this.#activeTool);
	}

	refreshDefaults(): void {
		this.#defaultControls = captureControlState(this.options.root);
	}

	private render(): void {
		this.options.selectGroups.forEach((group) => {
			group.select.replaceChildren(
				...group.tools.map((tool) => new Option(tool.label, tool.id)),
			);
			group.select.value = group.defaultTool;
		});
		this.options.buttonContainer.replaceChildren(
			...this.options.buttonTools.map((tool) => {
				const button = document.createElement('button');
				button.className = 'tool utility-tool';
				button.dataset.tool = tool.id;
				button.title = tool.title;
				button.setAttribute('aria-label', tool.label);
				button.innerHTML = `<span>${tool.icon}</span><small class="tool-label">${tool.label}</small>`;
				return button;
			}),
		);
	}

	private bindEvents(): void {
		this.options.selectGroups.forEach((group) => {
			group.select.addEventListener('change', () =>
				this.select(group.select.value as TTool),
			);
			group.control.addEventListener('click', () =>
				this.select(group.select.value as TTool),
			);
		});
		this.options.buttonContainer.addEventListener('click', (event) => {
			const button = (event.target as HTMLElement).closest<HTMLElement>(
				'[data-tool]',
			);
			if (button?.dataset.tool && this.hasTool(button.dataset.tool))
				this.select(button.dataset.tool);
		});
		for (const eventName of ['input', 'change'])
			this.options.root.addEventListener(eventName, () => this.persist());
	}

	private updateSelection(): void {
		this.options.selectGroups.forEach((group) => {
			const definition = group.tools.find(
				(tool) => tool.id === this.#activeTool,
			);
			group.control.classList.toggle('active', Boolean(definition));
			if (definition) {
				group.select.value = definition.id;
				group.icon.textContent = definition.icon;
			}
		});
		this.options.buttonContainer
			.querySelectorAll<HTMLElement>('[data-tool]')
			.forEach((button) =>
				button.classList.toggle(
					'active',
					button.dataset.tool === this.#activeTool,
				),
			);
	}

	private restoreDocumentState(): void {
		const state =
			this.options.documentModel?.toolbarState<GenericToolbarDocumentState>(
				this.options.stateKey ?? 'toolbar',
			);
		this.#controlProfiles.clear();
		for (const [tool, profile] of Object.entries(state?.controlProfiles ?? {}))
			if (this.hasTool(tool)) this.#controlProfiles.set(tool, profile);
		restoreControlState(
			this.options.root,
			state?.controls ?? this.#defaultControls,
		);
		this.#activeTool = this.hasTool(state?.activeTool ?? null)
			? (state!.activeTool! as TTool)
			: this.options.defaultTool;
		if (this.#controlProfiles.has(this.#activeTool))
			this.restoreProfile(this.#activeTool);
		else this.captureActiveProfile();
		this.updateSelection();
		this.#listeners.forEach((listener) => listener(this.#activeTool));
	}

	private hasTool(value: string | null): value is TTool {
		return (
			value !== null && this.options.tools.some((tool) => tool.id === value)
		);
	}

	private captureActiveProfile(): void {
		if (!this.options.profiledControlIds?.length) return;
		const controls = captureControlState(this.options.root);
		const profile: Record<string, PersistedValue> = {};
		for (const id of this.options.profiledControlIds) {
			const value = controls[id];
			if (value !== undefined) profile[id] = value;
		}
		this.#controlProfiles.set(this.#activeTool, profile);
	}

	private restoreProfile(tool: TTool): void {
		if (!this.options.profiledControlIds?.length) return;
		const profile = this.#controlProfiles.get(tool);
		if (profile) {
			restoreControlState(this.options.root, profile);
			return;
		}
		const defaults: Record<string, PersistedValue> = {};
		for (const id of this.options.profiledControlIds) {
			const value = this.#defaultControls[id];
			if (value !== undefined) defaults[id] = value;
		}
		restoreControlState(this.options.root, defaults);
	}
}

interface DocumentToolbarState<TExtra> {
	controls: Record<string, PersistedValue>;
	extra?: TExtra;
}

export class PersistentDocumentToolbar<TExtra = never> {
	readonly #defaults: Record<string, PersistedValue>;
	#extra: TExtra | undefined;
	#restoreListeners = new Set<(extra: TExtra | undefined) => void>();

	constructor(
		readonly root: HTMLElement,
		readonly documentModel: CanvasDocument,
		readonly stateKey: string,
		readonly restoreDefaultsWhenMissing = true,
	) {
		root.dataset.toolbarManaged = 'true';
		this.#defaults = captureControlState(root);
		for (const eventName of ['input', 'change'])
			root.addEventListener(eventName, () =>
				queueMicrotask(() => this.persist()),
			);
		documentModel.onDocumentChange(({ hasImage }) => {
			if (hasImage) this.restore();
		});
	}

	get extra(): TExtra | undefined {
		return this.#extra;
	}

	onRestore(listener: (extra: TExtra | undefined) => void): void {
		this.#restoreListeners.add(listener);
	}

	setExtra(extra: TExtra | undefined): void {
		this.#extra = extra;
		this.persist();
	}

	reset(): void {
		restoreControlState(this.root, this.#defaults);
		this.#extra = undefined;
		this.persist();
		this.#restoreListeners.forEach((listener) => listener(undefined));
	}

	persist(): void {
		this.documentModel.setToolbarState(this.stateKey, {
			controls: captureControlState(this.root),
			extra: this.#extra,
		} satisfies DocumentToolbarState<TExtra>);
	}

	private restore(): void {
		const state = this.documentModel.toolbarState<DocumentToolbarState<TExtra>>(
			this.stateKey,
		);
		if (state?.controls) restoreControlState(this.root, state.controls);
		else if (this.restoreDefaultsWhenMissing)
			restoreControlState(this.root, this.#defaults);
		this.#extra = state?.extra;
		this.#restoreListeners.forEach((listener) => listener(this.#extra));
	}
}

export class ToolbarManager {
	readonly toolbars: readonly PersistentDocumentToolbar<unknown>[];
	readonly #byKey = new Map<string, PersistentDocumentToolbar<unknown>>();

	constructor(documentModel: CanvasDocument, root: ParentNode = document) {
		this.toolbars = [
			...root.querySelectorAll<HTMLElement>(
				'.panel[data-panel], [data-toolbar-key]',
			),
		]
			.filter((toolbar) => toolbar.dataset.toolbarManaged !== 'true')
			.map((toolbar) => {
				const key = toolbar.dataset.toolbarKey ?? toolbar.dataset.panel!;
				const managed = new PersistentDocumentToolbar<unknown>(
					toolbar,
					documentModel,
					key,
				);
				this.#byKey.set(key, managed);
				return managed;
			});
	}

	get<TExtra>(key: string): PersistentDocumentToolbar<TExtra> | undefined {
		return this.#byKey.get(key) as
			| PersistentDocumentToolbar<TExtra>
			| undefined;
	}
}
