export const KeyboardKey = {
	ArrowDown: 'ArrowDown',
	ArrowLeft: 'ArrowLeft',
	ArrowRight: 'ArrowRight',
	ArrowUp: 'ArrowUp',
	Backspace: 'Backspace',
	Delete: 'Delete',
	End: 'End',
	Enter: 'Enter',
	Escape: 'Escape',
	Home: 'Home',
	Space: ' ',
	Tab: 'Tab',
} as const;

export const ShortcutKey = {
	Copy: 'c',
	FileMenu: 'f',
	NewImage: 'n',
	OpenImage: 'o',
	Redo: 'y',
	Save: 's',
	Undo: 'z',
} as const;

export type KeyboardKey = (typeof KeyboardKey)[keyof typeof KeyboardKey];

export const VerticalNavigationKeys: ReadonlySet<string> = new Set([
	KeyboardKey.ArrowDown,
	KeyboardKey.ArrowUp,
	KeyboardKey.Home,
	KeyboardKey.End,
]);
