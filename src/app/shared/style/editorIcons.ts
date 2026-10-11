/** The shared ant-inspired UI artwork. Icons are presentation only, never document content. */
export const EditorIconId = {
	Pencil: 'pencil',
	Brush: 'brush',
	Marker: 'marker',
	Highlighter: 'highlighter',
	Calligraphy: 'calligraphy',
	Spray: 'spray',
	Eraser: 'eraser',
	Line: 'line',
	Arrow: 'arrow',
	Rectangle: 'rectangle',
	RoundedRectangle: 'rounded-rectangle',
	Ellipse: 'ellipse',
	Triangle: 'triangle',
	Diamond: 'diamond',
	Star: 'star',
	ElbowArrow: 'elbow-arrow',
	Number: 'number',
	Highlight: 'highlight',
	Text: 'text',
	Blur: 'blur',
	Redact: 'redact',
	Select: 'select',
	Picker: 'picker',
	Crop: 'crop',
	Zoom: 'zoom',
	Fill: 'fill',
	Layers: 'layers',
	Adjust: 'adjust',
	Effects: 'effects',
	Transform: 'transform',
	Open: 'open',
	Save: 'save',
	Export: 'export',
	Diagram: 'diagram',
	Undo: 'undo',
	Redo: 'redo',
	Visible: 'visible',
	Lock: 'lock',
	Copy: 'copy',
	NewLayer: 'new-layer',
	Close: 'close',
	Plus: 'plus',
	Minus: 'minus',
	ChevronRight: 'chevron-right',
	ArrowUp: 'arrow-up',
	ArrowDown: 'arrow-down',
	Drag: 'drag',
	Unlock: 'unlock',
	Hidden: 'hidden',
	Reset: 'reset',
	RotateLeft: 'rotate-left',
	RotateRight: 'rotate-right',
	FlipHorizontal: 'flip-horizontal',
	FlipVertical: 'flip-vertical',
	Resize: 'resize',
	MergeDown: 'merge-down',
	Flatten: 'flatten',
	Ruler: 'ruler',
	Fit: 'fit',
	ActualPixels: 'actual-pixels',
	Focus: 'focus',
	SpriteSheet: 'sprite-sheet',
	Convert: 'convert',
	NewImage: 'new-image',
	CloseImage: 'close-image',
	RectangleSelection: 'rectangle-selection',
	Lasso: 'lasso',
	Report: 'report',
	Apply: 'apply',
	Toolbars: 'toolbars',
	Pen: 'pen',
	Polyline: 'polyline',
	Clip: 'clip',
	ReleaseClip: 'release-clip',
	SwapColors: 'swap-colors',
	ShapeOutline: 'shape-outline',
	ShapeFill: 'shape-fill',
	ShapeOutlineAndFill: 'shape-outline-and-fill',
	PlaceImage: 'place-image',
} as const;
export type EditorIconId = (typeof EditorIconId)[keyof typeof EditorIconId];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_VIEW_BOX = '0 0 24 24';
const ICON_STROKE_WIDTH = '0.75';
const ICON_ATTRIBUTE = 'data-editor-icon';
const ICON_CLASS = 'editor-icon';
const SEMANTIC_ICON_CLASSES: Readonly<Partial<Record<EditorIconId, string>>> = {
	[EditorIconId.Eraser]: 'eraser-icon',
	[EditorIconId.Picker]: 'eyedropper-icon',
};
const SVG_ATTRIBUTES = {
	viewBox: ICON_VIEW_BOX,
	'aria-hidden': 'true',
	focusable: 'false',
	fill: 'none',
	stroke: '#1b2634',
	'stroke-width': ICON_STROKE_WIDTH,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;

/** Only trusted, local vector artwork enters the icon renderer. */
const ICON_SHAPES = {
	[EditorIconId.Pencil]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" fill="url(#__ART__-gold)" stroke="none"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" fill="none" stroke="#1b2634"/><path d="m15 5 4 4" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Brush]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z" fill="url(#__ART__-gold)" stroke="none"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15Z" fill="url(#__ART__-green)" stroke="none"/><path d="m14.622 17.897-10.68-2.913" fill="none" stroke="#1b2634"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z" fill="none" stroke="#1b2634"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15Z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Marker]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" fill="url(#__ART__-green)" stroke="none"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" fill="none" stroke="#1b2634"/><path d="m15 5 4 4" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Highlighter]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><g transform="translate(1.8 1.8)"><path d="M4.53333 11.33333s0 0 0 0l0-2.53938c0-0.54187 0.255-1.04833 0.69062-1.36708L14.89625 0.2975C15.15833 0.10271 15.47708 0 15.80292 0c0.40375 0 0.79333 0.15937 1.08021 0.44625l1.94083 1.94083c0.28687 0.28687 0.44625 0.67292 0.44625 1.08021c0 0.32583-0.10271 0.64458-0.2975 0.90667L11.84333 14.04271c-0.31875 0.43563-0.82875 0.69062-1.36708 0.69062L7.93333 14.73333l-0.89958 0.89958c-0.44271 0.44271-1.16167 0.44271-1.60437 0l-1.79563-1.79563c-0.44271-0.44271-0.44271-1.16167 0-1.60437L4.53333 11.33333z" fill="url(#__ART__-gold)" /><path d="M11.15625 11.15625l5.61-7.61458L15.72854 2.50042 8.11042 8.11042 11.15625 11.15625z" fill="url(#__ART__-green)" stroke-width=".55"/><path d="M0.24792 16.51479l2.23125-2.23125 2.50042 2.50042-1.09792 1.09792c-0.15937 0.15937-0.37542 0.24792-0.60208 0.24792L0.85 18.13333c-0.47104 0-0.85-0.37896-0.85-0.85l0-0.16646c0-0.22667 0.08854-0.44271 0.24792-0.60208z" fill="#1b2634" stroke="#1b2634"/><path d="m15.9 1.5 2.1 2.1" fill="none" stroke="#fffef0" stroke-width="0.7" opacity=".8"/><path d="m8.9 11.1 5.7-7.9" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/><path d="m8.2 12.1 2.3 2.3m-3-1.7 2.3 2.3" fill="none" stroke="#b48a29" stroke-width=".35"/></g></g></g>',
	[EditorIconId.Calligraphy]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z" fill="url(#__ART__-gold)" stroke="none"/><path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z" fill="none" stroke="#1b2634"/><path d="M16 8 2 22" fill="none" stroke="#1b2634"/><path d="M17.488 15H9" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Spray]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="4" height="4" x="15" y="5" fill="url(#__ART__-green)" stroke="none"/><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2Z" fill="url(#__ART__-gold)" stroke="none"/><rect x="13" y="13" width="8" height="5" rx="0" fill="url(#__ART__-green)" stroke="none"/><path d="M3 3h.01" fill="none" stroke="#1b2634"/><path d="M7 5h.01" fill="none" stroke="#1b2634"/><path d="M11 7h.01" fill="none" stroke="#1b2634"/><path d="M3 7h.01" fill="none" stroke="#1b2634"/><path d="M7 9h.01" fill="none" stroke="#1b2634"/><path d="M3 11h.01" fill="none" stroke="#1b2634"/><rect width="4" height="4" x="15" y="5" fill="none" stroke="#1b2634"/><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2Z" fill="none" stroke="#1b2634"/><path d="m13 14 8-2" fill="none" stroke="#1b2634"/><path d="m13 19 8-2" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Eraser]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21Z" fill="url(#__ART__-gold)" stroke="none"/><path d="M5.082 11.09l8.828 8.828L12.8 21H8a2 2 0 0 1-1.4-.6L2.6 16.4q-1.4-1.4 0-2.8z" fill="url(#__ART__-paper)" stroke="none"/><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21Z" fill="none" stroke="#1b2634"/><path d="m5.082 11.09 8.828 8.828" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Line]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M22 2 2 22" fill="none" stroke="#62c238"/><rect x="2" y="18" width="4" height="4" rx="1.25" fill="url(#__ART__-gold)" /><rect x="18" y="2" width="4" height="4" rx="1.25" fill="url(#__ART__-paper)" /></g></g>',
	[EditorIconId.Arrow]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M7 7h10v10" fill="none" stroke="#ffc400"/><path d="M7 17 17 7" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Rectangle]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="20" height="12" x="2" y="6" rx="2" fill="url(#__ART__-gold)" stroke="none"/><rect width="20" height="12" x="2" y="6" rx="2" fill="none" stroke="#1b2634"/><rect x="6" y="9" width="12" height="6" rx="0.5" fill="url(#__ART__-paper)" stroke="#1b2634"/><path d="M4 8h16" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.RoundedRectangle]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="20" height="12" x="2" y="6" rx="5" fill="url(#__ART__-gold)" stroke="none"/><rect width="20" height="12" x="2" y="6" rx="5" fill="none" stroke="#1b2634"/><rect x="6" y="9" width="12" height="6" rx="2.5" fill="url(#__ART__-paper)" stroke="#1b2634"/><path d="M4 8h16" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Ellipse]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><g transform="translate(0 3.6) scale(1 .7)"><circle cx="12" cy="12" r="10" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="12" r="10" fill="none" stroke="#1b2634"/><circle cx="12" cy="12" r="6" fill="url(#__ART__-paper)" /></g></g></g>',
	[EditorIconId.Triangle]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="url(#__ART__-green)" stroke="none"/><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Diamond]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" fill="url(#__ART__-gold)" stroke="none"/><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Star]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="url(#__ART__-gold)" stroke="none"/><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.ElbowArrow]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m15 10 5 5-5 5" fill="none" stroke="#ffc400"/><path d="M4 4v7a4 4 0 0 0 4 4h12" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Number]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="12" cy="12" r="10" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="12" r="10" fill="none" stroke="#1b2634"/><path d="M9 9l3-2v10m-3 0h6" fill="none" stroke-width="1.75"/></g></g>',
	[EditorIconId.Highlight]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" fill="url(#__ART__-paper)" stroke="none"/><rect x="7" y="11" width="10" height="5" rx="1" fill="url(#__ART__-gold)" stroke="none"/><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" fill="none" stroke="#1b2634"/><path d="M14 2v5a1 1 0 0 0 1 1h5" fill="none" stroke="#1b2634"/><path d="M10 9H8" fill="none" stroke="#1b2634"/><path d="M16 13H8" fill="none" stroke="#1b2634"/><path d="M16 17H8" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Text]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12 4v16" fill="none" stroke="#ffc400"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" fill="none" stroke="#ffc400"/><path d="M9 20h6" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Blur]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="3" width="18" height="18" rx="2" fill="url(#__ART__-gold)" stroke="none"/><path d="M12 3v18" fill="none" stroke="#1b2634"/><path d="M3 12h18" fill="none" stroke="#1b2634"/><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#1b2634"/><circle cx="7.5" cy="7.5" r="2" fill="url(#__ART__-green)" stroke="none"/><circle cx="16.5" cy="7.5" r="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="7.5" cy="16.5" r="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="16.5" cy="16.5" r="2" fill="url(#__ART__-green)" stroke="none" opacity=".6"/><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Redact]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" fill="url(#__ART__-gold)" stroke="none"/><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" fill="none" stroke="#1b2634"/><path d="M14 2v5a1 1 0 0 0 1 1h5" fill="none" stroke="#1b2634"/><path d="M10 9H8" fill="none" stroke="#1b2634"/><path d="M16 13H8" fill="none" stroke="#1b2634"/><path d="M16 17H8" fill="none" stroke="#1b2634"/><rect x="6" y="11" width="13" height="6" rx="1" fill="#1b2634" stroke="none"/></g></g>',
	[EditorIconId.Select]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="url(#__ART__-gold)" /><path d="m6.4 6.4 11.2 4.6" fill="none" stroke="#fffef0" stroke-width="0.8" opacity=".8"/><path d="M6.4 6.8 10.3 17.1 11.4 13.3 12.9 11.7z" fill="#fff9bd" stroke="none" opacity=".4"/></g></g>',
	[EditorIconId.Picker]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12Z" fill="url(#__ART__-paper)" /><path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" fill="url(#__ART__-gold)" /><path d="m5 18 7-7" fill="none" stroke="#62c238" stroke-width="2.1"/><path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12Z" fill="none" stroke="#1b2634"/><path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" fill="none" stroke="#1b2634"/><path d="m2 22 .414-.414" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Crop]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M6 2v14a2 2 0 0 0 2 2h14" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M18 22V8a2 2 0 0 0-2-2H2" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.Zoom]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m21 21-4.34-4.34" fill="none" stroke="#1b2634" stroke-width="4.4"/><path d="m21 21-4.34-4.34" fill="none" stroke="#ffc400" stroke-width="2.7"/><circle cx="11" cy="11" r="8" fill="url(#__ART__-green)" /><circle cx="11" cy="11" r="5.9" fill="url(#__ART__-glass)" /><path d="M8.4 11h5.2" fill="none" stroke-width="1.6"/><path d="M6.5 7.4a5.8 5.8 0 0 1 4.6-2.2" fill="none" stroke="#fffef0" stroke-width="0.8" opacity=".8"/><path d="m17.8 17.2 3.2 3.2" fill="none" stroke="#fffef0" stroke-width="0.65" opacity=".8"/><path d="M7 9q2-4 6-3l2 2q-4-1-6 3z" fill="#fff" stroke="none" opacity=".38"/></g></g>',
	[EditorIconId.Fill]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33Z" fill="url(#__ART__-paper)" /><path d="M3 12h15l-6 6q-2 2-4 0z" fill="url(#__ART__-gold)" stroke="none"/><path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595Z" fill="url(#__ART__-green)" /><path d="M11 7 6 2" fill="none" stroke="#1b2634"/><path d="M18.992 12H2.041" fill="none" stroke="#1b2634"/><path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" fill="none" stroke="#1b2634"/><path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33Z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Layers]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" fill="url(#__ART__-gold)" stroke="none"/><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" fill="none" stroke="#62c238"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" fill="none" stroke="#62c238"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Adjust]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M10 5H3" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M12 19H3" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M14 3v4" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M16 17v4" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M21 12h-9" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M21 19h-5" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M21 5h-7" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M8 10v4" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M8 12H3" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.Effects]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" fill="url(#__ART__-gold)" stroke="none"/><circle cx="4" cy="20" r="2" fill="url(#__ART__-gold)" stroke="none"/><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" fill="none" stroke="#1b2634"/><path d="M20 2v4" fill="none" stroke="#1b2634"/><path d="M22 4h-4" fill="none" stroke="#1b2634"/><circle cx="4" cy="20" r="2" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Transform]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M21 3v5h-5" fill="none" stroke="var(--realistic-icon-neutral)"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="url(#__ART__-gold)" /></g></g>',
	[EditorIconId.Open]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="10" y="2" width="9" height="10" rx="1.5" fill="url(#__ART__-paper)" /><circle cx="16" cy="5" r="1.2" fill="url(#__ART__-gold)" /><path d="m11 10 3-3 4 4h-7z" fill="url(#__ART__-green)" /><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2Z" fill="url(#__ART__-gold)" stroke="none"/><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2Z" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Save]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path fill-rule="evenodd" d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="url(#__ART__-gold)" stroke="none"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7Z" fill="url(#__ART__-paper)" stroke="none"/><rect x="7" y="3" width="8" height="5" rx="1" fill="url(#__ART__-green)" /><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="#1b2634"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7Z" fill="none" stroke="#1b2634"/><path d="M7 3v4a1 1 0 0 0 1 1h7" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Export]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12 3v12" fill="none" stroke="#62c238"/><path d="m17 8-5-5-5 5" fill="none" stroke="#62c238"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Diagram]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="8" height="8" x="3" y="3" rx="2" fill="url(#__ART__-gold)" stroke="none"/><rect width="8" height="8" x="13" y="13" rx="2" fill="url(#__ART__-green)" stroke="none"/><rect width="8" height="8" x="3" y="3" rx="2" fill="none" stroke="#1b2634"/><path d="M7 11v4a2 2 0 0 0 2 2h4" fill="none" stroke="#1b2634"/><rect width="8" height="8" x="13" y="13" rx="2" fill="none" stroke="#1b2634"/><path d="M5 5h4" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Undo]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M9 14 4 9l5-5" fill="none" stroke="#ffc400"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Redo]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m15 14 5-5-5-5" fill="none" stroke="#62c238"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Visible]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="12" cy="12" r="3" fill="url(#__ART__-green)" stroke="none"/><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" fill="none" stroke="#1b2634"/><circle cx="12" cy="12" r="3" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Lock]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="10" width="18" height="12" rx="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="16" r="1" fill="#1b2634" stroke="none"/><circle cx="12" cy="16" r="1" fill="none" stroke="#1b2634"/><rect x="3" y="10" width="18" height="12" rx="2" fill="none" stroke="#1b2634"/><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M5 12h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Copy]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" fill="url(#__ART__-paper)" stroke="none"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2" fill="none" stroke="#62c238"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" fill="none" stroke="#62c238"/><path d="M10 10h10" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.NewLayer]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z" fill="url(#__ART__-gold)" stroke="none"/><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z" fill="none" stroke="#62c238"/><path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845" fill="none" stroke="#62c238"/><circle cx="18" cy="18" r="4" fill="url(#__ART__-green)" /><path d="M16 18h4m-2-2v4" fill="none" stroke-width="1.15"/></g></g>',
	[EditorIconId.Close]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M18 6 6 18" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="m6 6 12 12" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.Plus]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M5 12h14" fill="none" stroke="#ffc400"/><path d="M12 5v14" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Minus]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M5 12h14" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.ChevronRight]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m9 18 6-6-6-6" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.ArrowUp]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m5 12 7-7 7 7" fill="none" stroke="#ffc400"/><path d="M12 19V5" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.ArrowDown]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12 5v14" fill="none" stroke="#62c238"/><path d="m19 12-7 7-7-7" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Drag]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="9" cy="12" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="9" cy="5" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="9" cy="19" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="15" cy="12" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="15" cy="5" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="15" cy="19" r="1" fill="url(#__ART__-green)" stroke="none"/><circle cx="9" cy="12" r="1" fill="none" stroke="#62c238"/><circle cx="9" cy="5" r="1" fill="none" stroke="#62c238"/><circle cx="9" cy="19" r="1" fill="none" stroke="#62c238"/><circle cx="15" cy="12" r="1" fill="none" stroke="#62c238"/><circle cx="15" cy="5" r="1" fill="none" stroke="#62c238"/><circle cx="15" cy="19" r="1" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Unlock]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="12" x="3" y="10" rx="2" fill="url(#__ART__-green)" stroke="none"/><circle cx="12" cy="16" r="1" fill="#1b2634" stroke="none"/><circle cx="12" cy="16" r="1" fill="none" stroke="#1b2634"/><rect width="18" height="12" x="3" y="10" rx="2" fill="none" stroke="#1b2634"/><path d="M7 10V7a5 5 0 0 1 9.33-2.5" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M5 12h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Hidden]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="m2 2 20 20" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.Reset]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="#62c238"/><path d="M3 3v5h5" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.RotateLeft]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="#62c238"/><path d="M3 3v5h5" fill="none" stroke="#62c238"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="url(#__ART__-gold)" /></g></g>',
	[EditorIconId.RotateRight]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="#62c238"/><path d="M21 3v5h-5" fill="none" stroke="#62c238"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="url(#__ART__-gold)" /></g></g>',
	[EditorIconId.FlipHorizontal]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M10 5 3 19h7z" fill="url(#__ART__-gold)" /><path d="M14 5l7 14h-7z" fill="url(#__ART__-green)" /><path d="M12 3v18" fill="none" stroke="var(--realistic-icon-neutral)" stroke-dasharray="1.8 2.4"/></g></g>',
	[EditorIconId.FlipVertical]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><g transform="rotate(90 12 12)"><path d="M10 5 3 19h7z" fill="url(#__ART__-gold)" /><path d="M14 5l7 14h-7z" fill="url(#__ART__-green)" /><path d="M12 3v18" fill="none" stroke="var(--realistic-icon-neutral)" stroke-dasharray="1.8 2.4"/></g></g></g>',
	[EditorIconId.Resize]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M15 3h6v6" fill="none" stroke="#62c238"/><path d="m21 3-7 7" fill="none" stroke="#62c238"/><path d="m3 21 7-7" fill="none" stroke="#62c238"/><path d="M9 21H3v-6" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.MergeDown]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12 17V3" fill="none" stroke="#ffc400"/><path d="m6 11 6 6 6-6" fill="none" stroke="#ffc400"/><path d="M19 21H5" fill="none" stroke="#ffc400"/></g></g>',
	[EditorIconId.Flatten]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M12 22v-6" fill="none" stroke="#62c238"/><path d="M12 8V2" fill="none" stroke="#62c238"/><path d="M4 12H2" fill="none" stroke="#62c238"/><path d="M10 12H8" fill="none" stroke="#62c238"/><path d="M16 12h-2" fill="none" stroke="#62c238"/><path d="M22 12h-2" fill="none" stroke="#62c238"/><path d="m15 19-3-3-3 3" fill="none" stroke="#62c238"/><path d="m15 5-3 3-3-3" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Ruler]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" fill="url(#__ART__-gold)" stroke="none"/><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" fill="none" stroke="#1b2634"/><path d="m14.5 12.5 2-2" fill="none" stroke="#1b2634"/><path d="m11.5 9.5 2-2" fill="none" stroke="#1b2634"/><path d="m8.5 6.5 2-2" fill="none" stroke="#1b2634"/><path d="m17.5 15.5 2-2" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Fit]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M3 7V5a2 2 0 0 1 2-2h2" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M17 3h2a2 2 0 0 1 2 2v2" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M21 17v2a2 2 0 0 1-2 2h-2" fill="none" stroke="var(--realistic-icon-neutral)"/><path d="M7 21H5a2 2 0 0 1-2-2v-2" fill="none" stroke="var(--realistic-icon-neutral)"/><rect x="7" y="8" width="10" height="8" rx="2" fill="url(#__ART__-gold)" /></g></g>',
	[EditorIconId.ActualPixels]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="3" width="18" height="18" rx="2" fill="url(#__ART__-paper)" stroke="none"/><path d="M12 3v18" fill="none" stroke="#1b2634"/><path d="M3 12h18" fill="none" stroke="#1b2634"/><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#1b2634"/><rect x="5" y="5" width="5" height="5" rx="1" fill="url(#__ART__-gold)" /><rect x="14" y="5" width="5" height="5" rx="1" fill="url(#__ART__-green)" /><rect x="5" y="14" width="5" height="5" rx="1" fill="url(#__ART__-green)" /><rect x="14" y="14" width="5" height="5" rx="1" fill="url(#__ART__-gold)" /><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Focus]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M8 3H5a2 2 0 0 0-2 2v3" fill="none" stroke="#62c238"/><path d="M21 8V5a2 2 0 0 0-2-2h-3" fill="none" stroke="#62c238"/><path d="M3 16v3a2 2 0 0 0 2 2h3" fill="none" stroke="#62c238"/><path d="M16 21h3a2 2 0 0 0 2-2v-3" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.SpriteSheet]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><g><rect width="18" height="18" x="3" y="3" rx="2" fill="url(#__ART__-paper)" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="#1b2634"/><path d="M3 9h18" fill="none" stroke="#1b2634"/><path d="M3 15h18" fill="none" stroke="#1b2634"/><path d="M9 3v18" fill="none" stroke="#1b2634"/><path d="M15 3v18" fill="none" stroke="#1b2634"/></g><circle cx="6" cy="6" r="1.65" fill="url(#__ART__-gold)" stroke="none"/><circle cx="6" cy="12" r="1.65" fill="url(#__ART__-green)" stroke="none"/><circle cx="6" cy="18" r="1.65" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="6" r="1.65" fill="url(#__ART__-green)" stroke="none"/><circle cx="12" cy="12" r="1.65" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="18" r="1.65" fill="url(#__ART__-green)" stroke="none"/><circle cx="18" cy="6" r="1.65" fill="url(#__ART__-gold)" stroke="none"/><circle cx="18" cy="12" r="1.65" fill="url(#__ART__-green)" stroke="none"/><circle cx="18" cy="18" r="1.65" fill="url(#__ART__-gold)" stroke="none"/><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Convert]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="14" width="7" height="7" rx="1" fill="url(#__ART__-paper)" stroke="none"/><path d="M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" fill="none" stroke="#62c238"/><path d="M14 4a1 1 0 0 1 1-1" fill="none" stroke="#62c238"/><path d="M15 10a1 1 0 0 1-1-1" fill="none" stroke="#62c238"/><path d="M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" fill="none" stroke="#62c238"/><path d="M21 4a1 1 0 0 0-1-1" fill="none" stroke="#62c238"/><path d="M21 9a1 1 0 0 1-1 1" fill="none" stroke="#62c238"/><path d="m3 7 3 3 3-3" fill="none" stroke="#62c238"/><path d="M6 10V5a2 2 0 0 1 2-2h2" fill="none" stroke="#62c238"/><rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.NewImage]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="3" width="18" height="18" rx="2" fill="url(#__ART__-paper)" stroke="none"/><circle cx="9" cy="9" r="2" fill="url(#__ART__-gold)" stroke="none"/><path d="M16 5h6" fill="none" stroke="#1b2634"/><path d="M19 2v6" fill="none" stroke="#1b2634"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" fill="none" stroke="#1b2634"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" fill="none" stroke="#1b2634"/><circle cx="9" cy="9" r="2" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.CloseImage]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="9" cy="9" r="2" fill="url(#__ART__-gold)" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2" fill="none" stroke="#1b2634"/><circle cx="9" cy="9" r="2" fill="none" stroke="#1b2634"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" fill="none" stroke="#1b2634"/><path d="M11 12h7V8l4.5 6-4.5 6v-4h-7z" fill="url(#__ART__-gold)" /><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.RectangleSelection]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="M3 7V5a2 2 0 0 1 2-2h2" fill="none" stroke-dasharray="2.4 2.4" stroke="var(--realistic-icon-neutral)"/><path d="M17 3h2a2 2 0 0 1 2 2v2" fill="none" stroke-dasharray="2.4 2.4" stroke="var(--realistic-icon-neutral)"/><path d="M21 17v2a2 2 0 0 1-2 2h-2" fill="none" stroke-dasharray="2.4 2.4" stroke="var(--realistic-icon-neutral)"/><path d="M7 21H5a2 2 0 0 1-2-2v-2" fill="none" stroke-dasharray="2.4 2.4" stroke="var(--realistic-icon-neutral)"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="url(#__ART__-gold)" /></g></g>',
	[EditorIconId.Lasso]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="5" cy="16" r="2" fill="url(#__ART__-gold)" stroke="none"/><path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" fill="none" stroke="#62c238"/><path d="M7 22a5 5 0 0 1-2-3.994" fill="none" stroke="#62c238"/><circle cx="5" cy="16" r="2" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Report]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" fill="url(#__ART__-paper)" stroke="none"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1" fill="none" stroke="#1b2634"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="none" stroke="#1b2634"/><path d="M12 11h4" fill="none" stroke="#1b2634"/><path d="M12 16h4" fill="none" stroke="#1b2634"/><path d="M8 11h.01" fill="none" stroke="#1b2634"/><path d="M8 16h.01" fill="none" stroke="#1b2634"/><path d="M10 4h4" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Apply]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="12" cy="12" r="10" fill="url(#__ART__-green)" stroke="none"/><circle cx="12" cy="12" r="10" fill="none" stroke="#1b2634"/><path d="m16 9-5.5 5.5L8 12" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.Toolbars]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="18" x="3" y="3" rx="2" fill="url(#__ART__-paper)" stroke="none"/><rect x="3" y="3" width="18" height="6" rx="1.5" fill="url(#__ART__-gold)" stroke="none"/><rect x="3" y="9" width="6" height="12" rx="0.5" fill="url(#__ART__-green)" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="#1b2634"/><path d="M3 9h18" fill="none" stroke="#1b2634"/><path d="M9 21V9" fill="none" stroke="#1b2634"/><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Pen]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><path d="m18 13-.654-4.736a4 4 0 00-2.756-3.266l-9.163-2.9a2 2 0 00-2.017.493l-.82.819a2 2 0 00-.492 2.017l2.9 9.163a4 4 0 003.266 2.756L13 18Z" fill="url(#__ART__-gold)" /><path d="M18.648 12.352a1.205 1.205 0 011.704 0l1.296 1.296a1.205 1.205 0 010 1.704l-6.296 6.296a1.205 1.205 0 01-1.704 0l-1.296-1.296a1.205 1.205 0 010-1.704zZ" fill="url(#__ART__-metal)" /><path d="m3 3 6.586 6.586" fill="none" stroke-width="1.1"/><circle cx="11" cy="11" r="1.5" fill="#1b2634" stroke="none"/><path d="M5.8 5.2 8.6 6.1" fill="none" stroke="#fffef0" stroke-width="0.8" opacity=".8"/><path d="m15.1 19.5 4.3-4.3" fill="none" stroke="#fffef0" stroke-width="0.75" opacity=".8"/><path d="m7 7.7-1.3-1.3m1.9 8.1 1.9.6m-2.6-1.9 1.9.6M12 6.8l2.2.7" fill="none" stroke="#93711c" stroke-width=".45"/><path d="m4.4 9.1 1.6 4.8" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.Polyline]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="12" cy="20" r="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="12" cy="4" r="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="20" cy="12" r="2" fill="url(#__ART__-gold)" stroke="none"/><circle cx="4" cy="12" r="2" fill="url(#__ART__-gold)" stroke="none"/><path d="m10.586 5.414-5.172 5.172" fill="none" stroke="#62c238"/><path d="m18.586 13.414-5.172 5.172" fill="none" stroke="#62c238"/><path d="M6 12h12" fill="none" stroke="#62c238"/><circle cx="12" cy="20" r="2" fill="none" stroke="#62c238"/><circle cx="12" cy="4" r="2" fill="none" stroke="#62c238"/><circle cx="20" cy="12" r="2" fill="none" stroke="#62c238"/><circle cx="4" cy="12" r="2" fill="none" stroke="#62c238"/></g></g>',
	[EditorIconId.Clip]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><circle cx="15" cy="9" r="7" fill="url(#__ART__-gold)" stroke="none"/><circle cx="9" cy="15" r="7" fill="url(#__ART__-green)" stroke="none"/><circle cx="15" cy="9" r="7" fill="none" stroke="#1b2634"/><circle cx="9" cy="15" r="7" fill="none" stroke="#1b2634"/></g></g>',
	[EditorIconId.ReleaseClip]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="11" y="14" width="10" height="7" rx="2" fill="url(#__ART__-paper)" stroke="none"/><rect x="3" y="3" width="10" height="7" rx="2" fill="url(#__ART__-green)" stroke="none"/><rect x="11" y="14" width="10" height="7" rx="2" fill="none" stroke="#1b2634"/><rect x="3" y="3" width="10" height="7" rx="2" fill="none" stroke="#1b2634"/><path d="M13 16h6" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.SwapColors]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="2" y="2" width="11" height="11" rx="2.5" fill="url(#__ART__-gold)" /><rect x="11" y="11" width="11" height="11" rx="2.5" fill="url(#__ART__-green)" /><path d="M16 3h5v5m-5 0 5-5M8 21H3v-5m5 0-5 5" fill="none" stroke="var(--realistic-icon-neutral)"/></g></g>',
	[EditorIconId.ShapeOutline]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="#62c238" stroke-width="2"/></g></g>',
	[EditorIconId.ShapeFill]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="18" x="3" y="3" rx="2" fill="url(#__ART__-gold)" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="#ffc400"/><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.ShapeOutlineAndFill]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect width="18" height="18" x="3" y="3" rx="2" fill="url(#__ART__-gold)" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="#62c238" stroke-width="2"/><path d="M5 5h14" fill="none" stroke="#fffef0" stroke-width="0.55" opacity=".8"/></g></g>',
	[EditorIconId.PlaceImage]:
		'<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)"><rect x="3" y="3" width="18" height="18" rx="2" fill="url(#__ART__-paper)" stroke="none"/><circle cx="9" cy="9" r="2" fill="url(#__ART__-gold)" stroke="none"/><path d="M16 5h6" fill="none" stroke="#1b2634"/><path d="M19 2v6" fill="none" stroke="#1b2634"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" fill="none" stroke="#1b2634"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" fill="none" stroke="#1b2634"/><circle cx="9" cy="9" r="2" fill="none" stroke="#1b2634"/><path d="M12 10v7m-3-3 3 3 3-3" fill="none" stroke="#62c238" stroke-width="1.6"/></g></g>',
} as const satisfies Readonly<Record<EditorIconId, string>>;

/** Markup for existing toolbar and panel views that render their own button contents. */
export function editorIconMarkup(id: EditorIconId): string {
	const attributes = Object.entries(SVG_ATTRIBUTES)
		.map(([name, value]) => `${name}="${value}"`)
		.join(' ');
	return `<svg class="${iconClasses(id).join(' ')}" ${ICON_ATTRIBUTE}="${id}" ${attributes}>${iconArtwork(id)}</svg>`;
}

/** A shared SVG element for views built with DOM methods rather than markup. */
export function createEditorIcon(id: EditorIconId): SVGSVGElement {
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	presentIcon(svg, id);
	return svg;
}

/** Resolves static HTML icon placeholders through the same catalog as dynamic controls. */
export function presentEditorIcons(root: ParentNode = document): void {
	for (const svg of root.querySelectorAll<SVGSVGElement>(
		`svg[${ICON_ATTRIBUTE}]`,
	)) {
		const id = svg.getAttribute(ICON_ATTRIBUTE);
		if (!isEditorIconId(id)) throw new Error(`Unknown editor icon: ${id}`);
		presentIcon(svg, id);
	}
}

function isEditorIconId(value: string | null): value is EditorIconId {
	return value !== null && Object.hasOwn(ICON_SHAPES, value);
}

function presentIcon(svg: SVGSVGElement, id: EditorIconId): void {
	svg.classList.add(...iconClasses(id));
	svg.setAttribute(ICON_ATTRIBUTE, id);
	for (const [name, value] of Object.entries(SVG_ATTRIBUTES))
		svg.setAttribute(name, value);
	svg.innerHTML = iconArtwork(id);
}

function iconClasses(id: EditorIconId): string[] {
	const semanticClass = SEMANTIC_ICON_CLASSES[id];
	return semanticClass ? [ICON_CLASS, semanticClass] : [ICON_CLASS];
}

/** Scope paint servers to each SVG, including repeated icons in menus and panels. */
const ARTWORK_ID_TOKEN = '__ART__';
const ICON_MATERIALS =
	'<defs><linearGradient id="__ART__-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ae730f"/><stop offset=".2" stop-color="#f5c13b"/><stop offset=".4" stop-color="#fff0ae"/><stop offset=".49" stop-color="#ffdf77"/><stop offset=".65" stop-color="#f6bd1c"/><stop offset="1" stop-color="#ba8210"/></linearGradient><linearGradient id="__ART__-green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#255c2e"/><stop offset=".25" stop-color="#5eba3b"/><stop offset=".4" stop-color="#a2e277"/><stop offset=".6" stop-color="#70c344"/><stop offset="1" stop-color="#326631"/></linearGradient><linearGradient id="__ART__-paper" x2="0" y2="1"><stop stop-color="#fffef5"/><stop offset="1" stop-color="#e9ecdd"/></linearGradient><linearGradient id="__ART__-glass" x2="1" y2="1"><stop stop-color="#f8fffb"/><stop offset=".35" stop-color="#d2e5de"/><stop offset=".55" stop-color="#f4fff9"/><stop offset="1" stop-color="#8baa9e"/></linearGradient><linearGradient id="__ART__-metal" x2="1" y2="1"><stop stop-color="#54645f"/><stop offset=".3" stop-color="#eef3e9"/><stop offset=".45" stop-color="#fffef5"/><stop offset=".6" stop-color="#9daea7"/><stop offset="1" stop-color="#374740"/></linearGradient><filter id="__ART__-shadow" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36"><feDropShadow dx="0" dy=".5" stdDeviation="0.45" flood-color="#101e18" flood-opacity="0.28"/></filter><filter id="__ART__-halo" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36"><feMorphology in="SourceAlpha" operator="dilate" radius="0.5" result="expanded"/><feFlood flood-color="#eff3e7" result="rim"/><feComposite in="rim" in2="expanded" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
let artworkInstance = 0;

function iconArtwork(id: EditorIconId): string {
	const namespace = `editor-art-${++artworkInstance}`;
	return `${ICON_MATERIALS}${ICON_SHAPES[id]}`.replaceAll(
		ARTWORK_ID_TOKEN,
		namespace,
	);
}
