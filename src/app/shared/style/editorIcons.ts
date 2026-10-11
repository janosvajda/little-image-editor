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
} as const;
export type EditorIconId = (typeof EditorIconId)[keyof typeof EditorIconId];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_VIEW_BOX = '0 0 32 32';
const ICON_STROKE_WIDTH = '1.7';
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
	stroke: 'currentColor',
	'stroke-width': ICON_STROKE_WIDTH,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;

/** Only trusted, local vector artwork enters the icon renderer. */
const ICON_SHAPES = {
	[EditorIconId.Pencil]: '<g transform="rotate(40 16 16)"><path class="icon-gold" d="M12 7h8v15h-8z"/><path class="icon-paper" d="M12 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2z"/><path class="icon-wood" d="m12 22 4 7 4-7z"/><path class="icon-ink" d="m14.5 26 1.5 3 1.5-3z"/><path class="icon-shine" d="M14 9v11"/><path d="M12 7h8"/></g>',
	[EditorIconId.Brush]: '<path class="icon-gold" d="m14 18 10-14q2-2 4 1l-8 16z"/><path class="icon-paper" d="m14 18 6 3-3 4-6-4z"/><path class="icon-ink" d="M11 21c-5 0-3 7-8 7 7 4 15 1 14-4z"/><path class="icon-leaf" d="M6 28c4 1 7 0 8-3"/><path class="icon-shine" d="m18 15 6-8"/>',
	[EditorIconId.Marker]: '<g transform="rotate(38 16 16)"><rect class="icon-gold" x="11" y="3" width="10" height="19" rx="2"/><path class="icon-leaf" d="M11 8h10v5H11z"/><path class="icon-paper" d="m11 22 3 6h4l3-6z"/><path class="icon-ink" d="M14 26h4v3h-4z"/><path class="icon-shine" d="M14 5h4"/></g>',
	[EditorIconId.Highlighter]: '<g transform="rotate(38 16 16)"><rect class="icon-gold" x="10" y="3" width="12" height="17" rx="3"/><path class="icon-paper" d="M10 16h12v4H10z"/><path class="icon-ink" d="m12 20 1 5h6l1-5z"/></g><path class="icon-leaf" d="M3 29h24v2H3z"/>',
	[EditorIconId.Calligraphy]: '<path class="icon-gold" d="m16 3 10 12-5 13H11L6 15z"/><path class="icon-paper" d="m16 3 3 12-3 10-3-10z"/><path d="M16 3v10m0 6v9"/><circle class="icon-ink" cx="16" cy="16" r="2.2"/><path class="icon-leaf" d="M11 28h10v3H11z"/>',
	[EditorIconId.Spray]: '<rect class="icon-gold" x="6" y="11" width="15" height="19" rx="3"/><path class="icon-paper" d="M8 11V7h11v4"/><path class="icon-ink" d="M11 7V3h6v4z"/><path class="icon-leaf" d="M6 19h15v7H6z"/><path class="icon-shine" d="M9 14v3"/><circle class="icon-leaf" cx="24" cy="5" r="1"/><circle class="icon-gold" cx="28" cy="3" r="1"/><circle class="icon-gold" cx="29" cy="8" r="1"/>',
	[EditorIconId.Eraser]: '<path class="icon-gold" d="m4 18 13-13q2-2 4 0l7 7q2 2 0 4L17 27H11z"/><path class="icon-paper" d="m4 18 8-8 11 11-6 6h-6z"/><path d="m12 10 11 11M18 28h11"/><path class="icon-shine" d="m19 8 6 6"/>',
	[EditorIconId.Line]: '<path class="icon-green-stroke" stroke-width="3" d="M7 25 25 7"/><rect class="icon-gold" x="3" y="21" width="7" height="7" rx="2"/><rect class="icon-paper" x="22" y="3" width="7" height="7" rx="2"/>',
	[EditorIconId.Arrow]: '<path class="icon-gold" d="m5 25 14-14h-9V5h17v17h-6v-8L9 28z"/><path class="icon-shine" d="M14 8h10v9"/>',
	[EditorIconId.Rectangle]: '<rect class="icon-gold" x="4" y="7" width="24" height="18" rx="2"/><rect class="icon-paper" x="9" y="12" width="14" height="8" rx="1"/><path class="icon-shine" d="M7 10h18"/>',
	[EditorIconId.RoundedRectangle]: '<rect class="icon-gold" x="4" y="7" width="24" height="18" rx="7"/><rect class="icon-paper" x="9" y="12" width="14" height="8" rx="3"/><path class="icon-shine" d="M10 10h12"/>',
	[EditorIconId.Ellipse]: '<ellipse class="icon-gold" cx="16" cy="16" rx="13" ry="10"/><ellipse class="icon-paper" cx="16" cy="16" rx="7" ry="4.5"/><path class="icon-shine" d="M8 11q7-5 15 0"/>',
	[EditorIconId.Triangle]: '<path class="icon-gold" d="m16 3 14 25H2z"/><path class="icon-paper" d="m16 13 5 9H11z"/>',
	[EditorIconId.Diamond]: '<path class="icon-gold" d="m16 2 14 14-14 14L2 16z"/><path class="icon-paper" d="m16 10 6 6-6 6-6-6z"/>',
	[EditorIconId.Star]: '<path class="icon-gold" d="m16 3 4 8 9 1-6 7 1 10-8-5-8 5 1-10-6-7 9-1z"/><path class="icon-shine" d="m16 7 2.5 6 6 .5"/>',
	[EditorIconId.ElbowArrow]: '<path class="icon-gold" d="M5 5h6v14h10v-6l9 9-9 9v-6H5z"/><circle class="icon-leaf" cx="8" cy="6" r="3"/>',
	[EditorIconId.Number]: '<circle class="icon-gold" cx="16" cy="16" r="13"/><path d="m12 12 4-3v14m-4 0h8" stroke-width="2.5"/><path class="icon-shine" d="M8 10q3-4 7-4"/>',
	[EditorIconId.Highlight]: '<rect class="icon-paper" x="3" y="5" width="26" height="22" rx="4"/><path class="icon-gold" d="M6 13h20v8H6z"/><path d="M7 9h11m-11 8h17M7 24h9"/>',
	[EditorIconId.Text]: '<path class="icon-gold" d="M4 4h24v8h-5V9h-5v18h4v3H10v-3h4V9H9v3H4z"/><path class="icon-shine" d="M7 7h18"/>',
	[EditorIconId.Blur]: '<rect class="icon-paper" x="3" y="3" width="26" height="26" rx="5"/><rect class="icon-leaf" x="7" y="7" width="5" height="5" rx="1"/><rect class="icon-gold" x="14" y="7" width="5" height="5" rx="1"/><rect class="icon-leaf" x="21" y="7" width="4" height="5" rx="1" opacity=".5"/><rect class="icon-gold" x="7" y="14" width="5" height="5" rx="1"/><rect class="icon-leaf" x="14" y="14" width="5" height="5" rx="1" opacity=".6"/><rect class="icon-gold" x="21" y="14" width="4" height="5" rx="1" opacity=".5"/><path class="icon-soft" d="M8 24h16"/>',
	[EditorIconId.Redact]: '<rect class="icon-paper" x="3" y="4" width="26" height="24" rx="4"/><path class="icon-soft" d="M7 9h18M7 24h13"/><rect class="icon-ink" x="6" y="13" width="20" height="7" rx="1"/><path class="icon-gold-stroke" d="M10 16.5h12"/>',
	[EditorIconId.Select]: '<path class="icon-gold" d="m6 3 21 15-10 2-5 10z"/><path class="icon-ink" d="m17 20 6 9 4-3-6-8z"/><path class="icon-shine" d="m9 9 10 7"/>',
	[EditorIconId.Picker]: '<path class="icon-paper" d="m6 20 13-13 6 6L12 26l-8 3z"/><path class="icon-leaf" d="m8 23 11-11 3 3-11 11-5 1z"/><path class="icon-ink" d="m18 6 4-4q2-2 4 0l4 4q2 2 0 4l-4 4z"/><path class="icon-gold" d="m15 9 3-3 10 10-3 3z"/><path class="icon-shine" d="m20 5 3-1"/>',
	[EditorIconId.Crop]: '<path class="icon-gold" d="M8 2h5v18h17v5H8z"/><path class="icon-paper" d="M2 8h23v22h-5V13H2z"/><path class="icon-green-stroke" d="M15 17h2v-2"/>',
	[EditorIconId.Zoom]: '<circle class="icon-leaf" cx="13" cy="13" r="10"/><circle class="icon-paper" cx="13" cy="13" r="6"/><path class="icon-gold" d="m20 20 3-3 8 9-5 5z"/><path d="M10 13h6m-3-3v6"/><path class="icon-shine" d="M7 8q2-3 5-3"/>',
	[EditorIconId.Fill]: '<path class="icon-paper" d="m3 15 11-11 12 12-11 11z"/><path class="icon-gold" d="m3 15 12 12 11-11H4z"/><path d="m8 8 10 10M9 3l4 4"/><path class="icon-leaf" d="M27 17s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8Z"/><path class="icon-shine" d="M26 24v2"/>',
	[EditorIconId.Layers]: '<path class="icon-paper" d="m16 16 14 7-14 7L2 23z"/><path class="icon-leaf" d="m16 10 14 7-14 7L2 17z"/><path class="icon-gold" d="m16 2 14 8-14 8L2 10z"/><path class="icon-shine" d="m8 9 8-4 8 4"/>',
	[EditorIconId.Adjust]: '<path d="M4 9h24M4 23h24" stroke-width="2"/><rect class="icon-gold" x="9" y="4" width="7" height="10" rx="3"/><rect class="icon-leaf" x="19" y="18" width="7" height="10" rx="3"/><path class="icon-shine" d="M12 7v4M22 21v4"/>',
	[EditorIconId.Effects]: '<path class="icon-gold" d="m17 3 4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path class="icon-shine" d="m17 8 2 7 7 2"/><path class="icon-leaf" d="m5 1 1.5 4L10 6.5 6.5 8 5 12 3.5 8 0 6.5 3.5 5z"/>',
	[EditorIconId.Transform]: '<rect class="icon-gold" x="10" y="10" width="14" height="14" rx="2"/><path class="icon-green-stroke" stroke-width="2.5" d="M27 8A13 13 0 1 0 26 26"/><path class="icon-leaf" d="m23 2 6 8-9 1z"/><path class="icon-shine" d="M13 13h8"/>',
	[EditorIconId.Open]: '<path class="icon-gold" d="M3 26V7h9l4 4h13v15z"/><path class="icon-paper" d="M2 14h28l-5 13H5z"/><path class="icon-leaf" d="M5 18h22l-3 9H7z"/><path class="icon-shine" d="M8 20h14"/>',
	[EditorIconId.Save]: '<path fill-rule="evenodd" class="icon-gold" d="M4 3h19l5 5v21H4z"/><rect class="icon-paper" x="9" y="3" width="13" height="10"/><rect class="icon-paper" x="9" y="20" width="14" height="9"/><rect class="icon-ink" x="17" y="3" width="3" height="7"/><line class="icon-green-stroke" x1="12" y1="24" x2="20" y2="24"/>',
	[EditorIconId.Export]: '<path class="icon-paper" d="M4 17v12h24V17h-6v5H10v-5z"/><path class="icon-gold" d="M13 3h6v10h6l-9 10-9-10h6z"/><path class="icon-green-stroke" d="M8 27h16"/>',
	[EditorIconId.Diagram]: '<path d="M16 10v7M6 21v-4h20v4"/><rect class="icon-gold" x="10" y="2" width="12" height="9" rx="2"/><rect class="icon-leaf" x="1" y="21" width="10" height="9" rx="2"/><rect class="icon-paper" x="21" y="21" width="10" height="9" rx="2"/>',
	[EditorIconId.Undo]: '<path class="icon-gold" d="M12 3 2 12l10 9v-6h7c6 0 7 6 4 10 8-4 7-16-3-16h-8z"/><path class="icon-shine" d="M15 12h5q6 0 6 5"/>',
	[EditorIconId.Redo]: '<path class="icon-gold" d="m20 3 10 9-10 9v-6h-7c-6 0-7 6-4 10-8-4-7-16 3-16h8z"/><path class="icon-shine" d="M17 12h-5q-6 0-6 5"/>',
	[EditorIconId.Visible]: '<path class="icon-paper" d="M2 16S7 7 16 7s14 9 14 9-5 9-14 9S2 16 2 16Z"/><circle class="icon-leaf" cx="16" cy="16" r="6"/><circle class="icon-ink" cx="16" cy="16" r="2.5"/><circle class="icon-shine-fill" cx="14" cy="14" r="1.2"/>',
	[EditorIconId.Lock]: '<path d="M9 14V9a7 7 0 0 1 14 0v5" stroke-width="3"/><rect class="icon-gold" x="5" y="13" width="22" height="17" rx="4"/><path class="icon-ink" d="M14 20a2 2 0 1 1 4 0l-1 2v3h-2v-3z"/><path class="icon-shine" d="M8 18v7"/>',
	[EditorIconId.Copy]: '<rect class="icon-leaf" x="3" y="3" width="19" height="21" rx="3"/><rect class="icon-paper" x="10" y="9" width="19" height="21" rx="3"/><path class="icon-gold" d="M14 13h11v6H14z"/><path d="M15 23h10m-10 3h6"/>',
	[EditorIconId.NewLayer]: '<path class="icon-leaf" d="m15 12 13 7-13 7L2 19z"/><path class="icon-gold" d="m15 3 13 7-13 7L2 10z"/><circle class="icon-paper" cx="25" cy="25" r="6"/><path d="M25 22v6m-3-3h6"/>',
	[EditorIconId.Close]: '<path d="m9 9 14 14M23 9 9 23" stroke-width="2.5"/>',
	[EditorIconId.Plus]: '<path d="M16 7v18M7 16h18" stroke-width="2.5"/>',
	[EditorIconId.Minus]: '<path d="M7 16h18" stroke-width="2.5"/>',
	[EditorIconId.ChevronRight]: '<path d="m12 7 9 9-9 9" stroke-width="2.5"/>',
	[EditorIconId.ArrowUp]: '<path class="icon-gold" d="m16 4 10 11h-7v13h-6V15H6z"/>',
	[EditorIconId.ArrowDown]: '<path class="icon-gold" d="m16 28 10-11h-7V4h-6v13H6z"/>',
	[EditorIconId.Drag]: '<g class="icon-ink"><circle cx="11" cy="7" r="1.6"/><circle cx="21" cy="7" r="1.6"/><circle cx="11" cy="16" r="1.6"/><circle cx="21" cy="16" r="1.6"/><circle cx="11" cy="25" r="1.6"/><circle cx="21" cy="25" r="1.6"/></g>',
	[EditorIconId.Unlock]: '<path d="M10 14V9a7 7 0 0 1 13-3" stroke-width="3"/><rect class="icon-paper" x="5" y="13" width="22" height="17" rx="4"/><path class="icon-gold" d="M14 20a2 2 0 1 1 4 0l-1 2v3h-2v-3z"/>',
	[EditorIconId.Hidden]: '<path class="icon-paper" d="M2 16S7 7 16 7s14 9 14 9-5 9-14 9S2 16 2 16Z"/><path d="m4 4 24 24" stroke-width="2.5"/>',
	[EditorIconId.Reset]: '<path class="icon-green-stroke" d="M7 10a11 11 0 1 1-1 12" stroke-width="2.5"/><path class="icon-gold" d="M3 3v10h10z"/><path d="M16 10v7l4 2"/>',
	[EditorIconId.RotateLeft]: '<path class="icon-green-stroke" d="M8 10a11 11 0 1 1-1 12" stroke-width="2.5"/><path class="icon-gold" d="M3 3v10h10z"/><rect class="icon-paper" x="13" y="12" width="9" height="9" rx="2"/>',
	[EditorIconId.RotateRight]: '<path class="icon-green-stroke" d="M24 10a11 11 0 1 0 1 12" stroke-width="2.5"/><path class="icon-gold" d="M29 3v10H19z"/><rect class="icon-paper" x="10" y="12" width="9" height="9" rx="2"/>',
	[EditorIconId.FlipHorizontal]: '<path class="icon-gold" d="M4 7v18l9-9z"/><path class="icon-leaf" d="M28 7v18l-9-9z"/><path d="M16 3v3m0 4v3m0 5v3m0 5v3"/>',
	[EditorIconId.FlipVertical]: '<path class="icon-gold" d="M7 4h18l-9 9z"/><path class="icon-leaf" d="M7 28h18l-9-9z"/><path d="M3 16h3m4 0h3m5 0h3m5 0h3"/>',
	[EditorIconId.Resize]: '<rect class="icon-paper" x="4" y="4" width="24" height="24" rx="3"/><path class="icon-leaf" d="M4 16h12v12H4z"/><path class="icon-gold-stroke" d="m12 20 12-12m-7 0h7v7" stroke-width="2.5"/>',
	[EditorIconId.MergeDown]: '<path class="icon-leaf" d="m16 17 14 7-14 7-14-7z"/><path class="icon-paper" d="m6 5 10-4 10 4-10 5z"/><path class="icon-gold" d="M13 9h6v8h5l-8 8-8-8h5z"/>',
	[EditorIconId.Flatten]: '<path class="icon-paper" d="m16 2 14 7-14 7L2 9z"/><path class="icon-leaf" d="m16 8 14 7-14 7L2 15z"/><path class="icon-gold" d="m16 15 14 7-14 7L2 22z"/><path d="M3 31h26"/>',
	[EditorIconId.Ruler]: '<g transform="rotate(-35 16 16)"><rect class="icon-gold" x="2" y="10" width="28" height="12" rx="2"/><path d="M7 10v6m5-6v4m5-4v6m5-6v4m5-4v6"/></g>',
	[EditorIconId.Fit]: '<path d="M11 3H3v8m18-8h8v8M11 29H3v-8m18 8h8v-8"/><rect class="icon-gold" x="10" y="10" width="12" height="12" rx="2"/>',
	[EditorIconId.ActualPixels]: '<rect class="icon-paper" x="3" y="3" width="26" height="26" rx="4"/><path class="icon-gold" d="M9 9h7v7H9z"/><path class="icon-leaf" d="M16 16h7v7h-7z"/>',
	[EditorIconId.Focus]: '<path class="icon-gold" d="M3 12V3h9v4H7v5zm17-9h9v9h-4V7h-5zM3 20h4v5h5v4H3zm22 0h4v9h-9v-4h5z"/><rect class="icon-paper" x="11" y="11" width="10" height="10" rx="2"/>',
	[EditorIconId.SpriteSheet]: '<rect class="icon-paper" x="2" y="2" width="28" height="28" rx="4"/><rect class="icon-gold" x="7" y="7" width="7" height="7" rx="1"/><rect class="icon-leaf" x="18" y="7" width="7" height="7" rx="1"/><rect class="icon-leaf" x="7" y="18" width="7" height="7" rx="1"/><rect class="icon-gold" x="18" y="18" width="7" height="7" rx="1"/>',
	[EditorIconId.Convert]: '<path class="icon-gold" d="M3 7h18V3l8 7-8 7v-4H3z"/><path class="icon-leaf" d="M29 25H11v4l-8-7 8-7v4h18z"/>',
	[EditorIconId.NewImage]: '<path class="icon-paper" d="M4 2h17l7 7v21H4z"/><path class="icon-gold" d="M21 2v7h7z"/><path class="icon-green-stroke" d="M16 13v10m-5-5h10" stroke-width="2.5"/>',
	[EditorIconId.CloseImage]: '<path class="icon-paper" d="M3 27V6h9l4 4h13v17z"/><path class="icon-gold" d="m11 15 3-3 5 5 5-5 3 3-5 5 5 5-3 3-5-5-5 5-3-3 5-5z"/>',
	[EditorIconId.RectangleSelection]: '<path d="M4 12V5h7m10 0h7v7m0 8v7h-7m-10 0H4v-7" stroke-dasharray="3 3"/><rect class="icon-gold" x="10" y="10" width="12" height="12" rx="2"/>',
	[EditorIconId.Lasso]: '<path class="icon-leaf" d="M27 13c0 7-5 12-12 12S3 20 3 13 8 3 15 3s12 3 12 10Z" fill-opacity=".15"/><path d="M15 25c5 0 8 4 4 6"/><circle class="icon-gold" cx="15" cy="25" r="3"/>',
	[EditorIconId.Report]: '<path class="icon-paper" d="M6 4h20v26H6z"/><rect class="icon-gold" x="10" y="2" width="12" height="6" rx="2"/><path class="icon-green-stroke" d="m10 14 2 2 3-4"/><path d="M18 14h5M10 21h13m-13 5h9"/>',
	[EditorIconId.Apply]: '<circle class="icon-leaf" cx="16" cy="16" r="13"/><path d="m8 16 5 5L24 10" stroke-width="2.5"/>',
	[EditorIconId.Toolbars]: '<rect class="icon-gold" x="3" y="3" width="11" height="11" rx="2"/><rect class="icon-paper" x="18" y="3" width="11" height="11" rx="2"/><rect class="icon-paper" x="3" y="18" width="11" height="11" rx="2"/><rect class="icon-leaf" x="18" y="18" width="11" height="11" rx="2"/>',
} as const satisfies Readonly<Record<EditorIconId, string>>;

/** Markup for existing toolbar and panel views that render their own button contents. */
export function editorIconMarkup(id: EditorIconId): string {
	const attributes = Object.entries(SVG_ATTRIBUTES)
		.map(([name, value]) => `${name}="${value}"`)
		.join(' ');
	return `<svg class="${iconClasses(id).join(' ')}" ${ICON_ATTRIBUTE}="${id}" ${attributes}>${ICON_SHAPES[id]}</svg>`;
}

/** A shared SVG element for views built with DOM methods rather than markup. */
export function createEditorIcon(id: EditorIconId): SVGSVGElement {
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	presentIcon(svg, id);
	return svg;
}

/** Resolves static HTML icon placeholders through the same catalog as dynamic controls. */
export function presentEditorIcons(root: ParentNode = document): void {
	for (const svg of root.querySelectorAll<SVGSVGElement>(`svg[${ICON_ATTRIBUTE}]`)) {
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
	svg.innerHTML = ICON_SHAPES[id];
}

function iconClasses(id: EditorIconId): string[] {
	const semanticClass = SEMANTIC_ICON_CLASSES[id];
	return semanticClass ? [ICON_CLASS, semanticClass] : [ICON_CLASS];
}
