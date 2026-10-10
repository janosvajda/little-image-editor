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
	/** Tools may share individual settings while keeping their other profiles independent. */
	profileOwner?: (tool: TTool, controlId: string) => TTool;
	/** Starting values of profiled controls for tools that differ from the panel defaults. */
	toolDefaults?: Readonly<
		Partial<Record<TTool, Readonly<Record<string, PersistedValue>>>>
	>;
}

interface GenericToolbarDocumentState {
	readonly activeTool?: string;
	readonly controls?: Record<string, PersistedValue>;
	readonly controlProfiles?: Record<string, Record<string, PersistedValue>>;
}

/** The button for one tool, shared by every toolbar that offers tools. */
export function createToolButton<TTool extends string>(
	tool: ToolDefinition<TTool>,
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'tool utility-tool';
	button.dataset.tool = tool.id;
	button.title = tool.title;
	button.setAttribute('aria-label', tool.label);
	button.innerHTML = `<span>${tool.icon}</span><small class="tool-label">${tool.label}</small>`;
	return button;
}

/** A stateless view of shared tool definitions. Selection and tool behaviour belong to its owner. */
export class ToolButtonGroup<TTool extends string> {
	constructor(
		private readonly root: HTMLElement,
		definitions: readonly ToolDefinition<TTool>[],
		selectTool: (tool: TTool) => void,
	) {
		root.replaceChildren(...definitions.map(createToolButton));
		root.addEventListener('click', (event) => {
			if (!(event.target instanceof Element)) return;
			const id = event.target.closest<HTMLElement>('[data-tool]')?.dataset.tool;
			const definition = definitions.find((tool) => tool.id === id);
			if (definition) selectTool(definition.id);
		});
	}

	showActiveTool(tool: TTool): void {
		for (const button of this.root.querySelectorAll<HTMLElement>(
			'[data-tool]',
		)) {
			const active = button.dataset.tool === tool;
			button.classList.toggle('active', active);
			button.setAttribute('aria-pressed', String(active));
		}
	}
}

export class GenericToolbar<TTool extends string> {
	readonly restoredControlIds: ReadonlySet<string>;
	#activeTool: TTool;
	#defaultControls: Record<string, PersistedValue> = {};
	readonly #controlProfiles = new Map<TTool, Record<string, PersistedValue>>();
	#listeners = new Set<(tool: TTool) => void>();
	readonly #buttonTools: ToolButtonGroup<TTool>;

	constructor(readonly options: GenericToolbarOptions<TTool>) {
		options.root.dataset.toolbarManaged = 'true';
		this.#buttonTools = new ToolButtonGroup(
			options.buttonContainer,
			options.buttonTools,
			(tool) => this.select(tool),
		);
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

	/** Remembers an explicit setting edit for the tool that owns it. */
	setProfileControl(
		tool: TTool,
		controlId: string,
		value: PersistedValue,
	): void {
		if (!this.options.profiledControlIds?.includes(controlId)) return;
		this.writeProfileControl(tool, controlId, value);
		if (
			this.profileOwner(tool, controlId) ===
			this.profileOwner(this.#activeTool, controlId)
		)
			restoreControlState(this.options.root, { [controlId]: value });
		this.persist();
	}

	private render(): void {
		this.options.selectGroups.forEach((group) => {
			group.select.replaceChildren(
				...group.tools.map((tool) => new Option(tool.label, tool.id)),
			);
			group.select.value = group.defaultTool;
		});
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
		this.#buttonTools.showActiveTool(this.#activeTool);
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
		this.restoreProfile(this.#activeTool, state?.controls);
		this.captureActiveProfile();
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
		for (const id of this.options.profiledControlIds) {
			const value = controls[id];
			if (value !== undefined)
				this.writeProfileControl(this.#activeTool, id, value);
		}
	}

	private profileOwner(tool: TTool, controlId: string): TTool {
		return this.options.profileOwner?.(tool, controlId) ?? tool;
	}

	private writeProfileControl(
		tool: TTool,
		controlId: string,
		value: PersistedValue,
	): void {
		const owner = this.profileOwner(tool, controlId);
		const profile = this.#controlProfiles.get(owner) ?? {};
		profile[controlId] = value;
		this.#controlProfiles.set(owner, profile);
	}

	private restoreProfile(
		tool: TTool,
		restoredControls?: Readonly<Record<string, PersistedValue>>,
	): void {
		if (!this.options.profiledControlIds?.length) return;
		const defaults: Record<string, PersistedValue> = {};
		const toolDefaults = this.options.toolDefaults?.[tool];
		for (const id of this.options.profiledControlIds) {
			const profile = this.#controlProfiles.get(this.profileOwner(tool, id));
			const value =
				profile?.[id] ??
				restoredControls?.[id] ??
				toolDefaults?.[id] ??
				this.#defaultControls[id];
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
		if (this.restoreDefaultsWhenMissing)
			restoreControlState(this.root, { ...this.#defaults, ...state?.controls });
		else if (state?.controls) restoreControlState(this.root, state.controls);
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
