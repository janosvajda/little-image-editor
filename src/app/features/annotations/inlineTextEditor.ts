export interface InlineTextEditRequest {
	readonly value: string;
	readonly clientX: number;
	readonly clientY: number;
	readonly fontSize: number;
	readonly color: string;
	readonly onInput: (value: string) => void;
	readonly onCommit: (value: string) => void;
	readonly onCancel: () => void;
}

const EditorKey = { Commit: 'Enter', Cancel: 'Escape' } as const;

export class InlineTextEditor {
	#input: HTMLInputElement | null = null;

	open(request: InlineTextEditRequest): void {
		this.close();
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'annotation-inline-text';
		input.value = request.value;
		input.style.left = `${request.clientX}px`;
		input.style.top = `${request.clientY}px`;
		input.style.fontSize = `${request.fontSize}px`;
		input.style.color = request.color;
		document.body.append(input);
		this.#input = input;

		let completed = false;
		const complete = (commit: boolean) => {
			if (completed) return;
			completed = true;
			const value = input.value.trim();
			input.remove();
			this.#input = null;
			if (commit && value) request.onCommit(value);
			else request.onCancel();
		};
		input.addEventListener('input', () => request.onInput(input.value));
		input.addEventListener('keydown', (event) => {
			if (event.key === EditorKey.Commit) {
				event.preventDefault();
				complete(true);
			} else if (event.key === EditorKey.Cancel) {
				event.preventDefault();
				complete(false);
			}
		});
		input.addEventListener('blur', () => complete(true));
		input.focus();
		input.select();
	}

	close(): void {
		this.#input?.remove();
		this.#input = null;
	}
}
