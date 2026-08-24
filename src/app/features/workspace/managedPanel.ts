export interface ManagedPanelShell {
	readonly element: HTMLElement;
	readonly body: HTMLElement;
}

export interface ManagedPanelOptions {
	readonly className?: string;
	readonly defaultVisible?: boolean;
	readonly autoOpenMode?: string;
	readonly defaultDock?: 'left' | 'right';
}

/** Creates the common shell consumed by WorkspaceUi and ToolbarManager. */
export function createManagedPanel(
	key: string,
	title: string,
	options: ManagedPanelOptions = {},
): ManagedPanelShell {
	const element = document.createElement('section');
	element.className = ['panel', options.className].filter(Boolean).join(' ');
	element.dataset.panel = key;
	element.dataset.ui = '';
	element.toggleAttribute(
		'data-default-visible',
		options.defaultVisible ?? false,
	);
	if (options.autoOpenMode) element.dataset.autoOpenMode = options.autoOpenMode;
	if (options.defaultDock) element.dataset.defaultDock = options.defaultDock;

	const header = document.createElement('header');
	header.className = 'panel-header';
	const heading = document.createElement('span');
	heading.textContent = title;
	const collapse = document.createElement('button');
	collapse.type = 'button';
	collapse.className = 'collapse';
	collapse.textContent = '−';
	header.append(heading, collapse);

	const body = document.createElement('div');
	body.className = 'panel-body';
	element.append(header, body);
	return { element, body };
}
