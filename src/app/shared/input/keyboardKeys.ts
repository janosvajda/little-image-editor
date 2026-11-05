export const KeyboardKey = {
	ArrowDown: 'ArrowDown',
	ArrowLeft: 'ArrowLeft',
	ArrowRight: 'ArrowRight',
	ArrowUp: 'ArrowUp',
	Backspace: 'Backspace',
	Comma: ',',
	Delete: 'Delete',
	End: 'End',
	Enter: 'Enter',
	Escape: 'Escape',
	F5: 'F5',
	F6: 'F6',
	F7: 'F7',
	Home: 'Home',
	Period: '.',
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
