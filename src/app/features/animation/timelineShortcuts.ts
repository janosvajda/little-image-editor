import { KeyboardKey } from '../../shared/input/keyboardKeys';

/** Everything the timeline can be asked to do from its menu, its buttons or the keyboard. */
export const TimelineCommand = {
	InsertKeyframe: 'insertKeyframe',
	InsertBlankKeyframe: 'insertBlankKeyframe',
	InsertFrame: 'insertFrame',
	RemoveFrame: 'removeFrame',
	ClearKeyframe: 'clearKeyframe',
	PreviousFrame: 'previousFrame',
	NextFrame: 'nextFrame',
	TogglePlayback: 'togglePlayback',
	CreateMotionTween: 'createMotionTween',
	RemoveTween: 'removeTween',
	CopyFrames: 'copyFrames',
	PasteFrames: 'pasteFrames',
} as const;
export type TimelineCommand = (typeof TimelineCommand)[keyof typeof TimelineCommand];

export interface TimelineShortcut {
	readonly key: KeyboardKey;
	readonly shift: boolean;
}

/** The timeline's keys, as in Flash. */
export const TIMELINE_SHORTCUTS: Readonly<Partial<Record<TimelineCommand, TimelineShortcut>>> = {
	[TimelineCommand.InsertKeyframe]: { key: KeyboardKey.F6, shift: false },
	[TimelineCommand.InsertBlankKeyframe]: { key: KeyboardKey.F7, shift: false },
	[TimelineCommand.InsertFrame]: { key: KeyboardKey.F5, shift: false },
	[TimelineCommand.RemoveFrame]: { key: KeyboardKey.F5, shift: true },
	[TimelineCommand.ClearKeyframe]: { key: KeyboardKey.F6, shift: true },
	[TimelineCommand.PreviousFrame]: { key: KeyboardKey.Comma, shift: false },
	[TimelineCommand.NextFrame]: { key: KeyboardKey.Period, shift: false },
	[TimelineCommand.TogglePlayback]: { key: KeyboardKey.Enter, shift: false },
};

const SHIFT_PREFIX = 'Shift+';

/** The command a key press asks for, if it is one of the timeline's keys. */
export function timelineCommandFor(key: string, shift: boolean): TimelineCommand | null {
	return (
		Object.values(TimelineCommand).find((command) => {
			const shortcut = TIMELINE_SHORTCUTS[command];
			return shortcut?.key === key && shortcut.shift === shift;
		}) ?? null
	);
}

/** A command's key as menus and tooltips show it, such as `Shift+F5`; empty when it has none. */
export function timelineShortcutLabel(command: TimelineCommand): string {
	const shortcut = TIMELINE_SHORTCUTS[command];
	return shortcut ? `${shortcut.shift ? SHIFT_PREFIX : ''}${shortcut.key}` : '';
}
