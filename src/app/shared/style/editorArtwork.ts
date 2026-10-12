import { EditorIconId } from './editorIconIds';
import { EDITOR_CURSOR_HOTSPOTS, EditorCursorId } from './editorCursors';

/**
 * Original vectors drawn for Little Image Editor; no icon-library geometry.
 * Coordinates below are SVG artwork on a 24-unit drawing grid, not application values.
 * Tools use an axial construction: the shaft, grip and working tip share one centreline.
 */
const Material = {
	Gold: 'gold',
	Green: 'green',
	Paper: 'paper',
	Glass: 'glass',
	Metal: 'metal',
} as const;
type Material = (typeof Material)[keyof typeof Material];
const Stroke = {
	Ink: '#1b2634',
	Neutral: 'var(--realistic-icon-neutral)',
	Leaf: '#43862f',
	Shine: '#fff9e6',
} as const;
type Stroke = (typeof Stroke)[keyof typeof Stroke];
export const ARTWORK_ID_TOKEN = '__ART__';

function surface(d: string, material: Material, extra = ''): string {
	return `<path d="${d}" fill="url(#${ARTWORK_ID_TOKEN}-${material})" ${extra}/>`;
}
function line(d: string, stroke: Stroke = Stroke.Ink, width = '.8'): string {
	return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
}
function rect(
	bounds: readonly [string, string, string, string],
	material: Material,
	radius = '1',
): string {
	const [x, y, width, height] = bounds;
	return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="url(#${ARTWORK_ID_TOKEN}-${material})"/>`;
}
function circle(
	center: readonly [string, string],
	radius: string,
	material: Material,
): string {
	const [cx, cy] = center;
	return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#${ARTWORK_ID_TOKEN}-${material})"/>`;
}
function group(transform: string, content: string): string {
	return `<g transform="${transform}">${content}</g>`;
}
function shine(d: string): string {
	return line(d, Stroke.Shine, '.55');
}
function neutral(d: string): string {
	return line(d, Stroke.Neutral, '1.1');
}
function solid(d: string): string {
	return `<path d="${d}" fill="${Stroke.Ink}"/>`;
}

// Each writing tool starts at its working point; rotations cannot skew the handle alignment.
const PENCIL = group(
	'translate(2.25 21.75) rotate(45)',
	rect(['-1.8', '-22', '3.6', '17'], Material.Gold, '.6') +
		rect(['-1.8', '-22', '3.6', '2.8'], Material.Green, '.6') +
		surface('M-1.8-5 0 0 1.8-5Z', Material.Paper) +
		solid('M-.65-1.8 0 0 .65-1.8Z') +
		shine('M-.8-18.3V-6.2'),
);
const BRUSH = group(
	'translate(2.25 13.5) rotate(45)',
	rect(['-1.15', '-16.8', '2.3', '10'], Material.Gold, '1.1') +
		rect(['-2.2', '-8', '4.4', '3'], Material.Metal, '.5') +
		surface('M-2.2-5C-3-3.2-2.4-.8 0 0 2.4-.8 3-3.2 2.2-5Z', Material.Green) +
		line('M-1-4.6-.5-1.8M.7-4.6.4-1.5', Stroke.Ink, '.4') +
		shine('M-.45-14.5V-9.3'),
);
const MARKER = group(
	'translate(2.25 21.75) rotate(45)',
	rect(['-2.45', '-22', '4.9', '17.5'], Material.Green, '1.3') +
		rect(['-2.45', '-13.7', '4.9', '5.6'], Material.Paper, '.3') +
		surface('M-1.8-4.5-.85-.8 0 0 .85-.8 1.8-4.5Z', Material.Metal) +
		solid('M-.85-1.8-.85-.8 0 0 .85-.8 .85-1.8Z') +
		shine('M-1.3-19.5V-15'),
);
const HIGHLIGHTER = group(
	'translate(2.25 19.5) rotate(45)',
	rect(['-3', '-18', '6', '12.5'], Material.Gold, '1.3') +
		rect(['-3', '-12.6', '6', '3.2'], Material.Green, '.4') +
		surface('M-3-5.5-2.6-2.7 2.6-2.7 3-5.5Z', Material.Metal) +
		solid('M-2.6-2.7-2.6-1.2 0 0 2.6-1.8 2.6-2.7Z') +
		shine('M-1.8-16V-14.1M-1.8-8.1V-6.7'),
);
const PEN = group(
	'translate(3 3) rotate(-45)',
	surface(
		'M0 0C-1 3-3.9 6.3-3.9 10L-2.3 12.3H2.3L3.9 10C3.9 6.3 1 3 0 0Z',
		Material.Gold,
	) +
		line('M0 0V7', Stroke.Ink, '.65') +
		`<circle cx="0" cy="7.8" r=".85" fill="${Stroke.Ink}" stroke="none"/>` +
		rect(['-3.2', '12.3', '6.4', '3.3'], Material.Green, '.5') +
		shine('M-2.8 8.8-1.5 11.2'),
);
const PICKER = group(
	'translate(2.25 21) rotate(45)',
	surface('M0 0-1.65-2.5V-12H1.65V-2.5Z', Material.Glass) +
		line('M0-2V-10.5', Stroke.Leaf, '1.5') +
		rect(['-3.2', '-14.6', '6.4', '2.6'], Material.Gold, '.6') +
		surface(
			'M-2.2-14.6V-19.2Q-2.2-22 0-22 2.2-22 2.2-19.2V-14.6Z',
			Material.Green,
		) +
		shine('M-.9-18.8V-16.3'),
);
const ERASER = group(
	'translate(3 15) rotate(45)',
	surface('M0 0-3-2.4V-13Q-3-15-1-15H1Q3-15 3-13V-2.4Z', Material.Gold) +
		surface('M-3-5.1H3V-2.4L0 0-3-2.4Z', Material.Paper) +
		shine('M-1.7-12.8V-7'),
);
const BUCKET =
	surface(
		'M3.5 8.5 10.5 2.5 18.8 10.8 11.8 17.8Q10.8 18.8 9.8 17.8L3.5 11.5Q2 10 3.5 8.5Z',
		Material.Paper,
	) +
	surface('M3.3 10.4H17.7L11.8 17.8Q10.8 18.8 9.8 17.8Z', Material.Gold) +
	line('M7 5.5 13.6 12.1M8.7 1.7 11.8 4.8') +
	surface(
		'M19.7 12.8C18.4 14.7 17.2 15.7 17.2 17.1A2.5 2.5 0 0 0 22.2 17.1C22.2 15.7 21 14.7 19.7 12.8Z',
		Material.Green,
	) +
	shine('M18.7 16.6V17.6');

function magnifier(zoomOut = false): string {
	return (
		group(
			'rotate(-45 11 11)',
			rect(['9.45', '17.5', '3.1', '5.3'], Material.Gold, '1.2') +
				shine('M10.3 18.7V21.3'),
		) +
		circle(['11', '11'], '7.35', Material.Green) +
		circle(['11', '11'], '5.45', Material.Glass) +
		line(
			zoomOut ? 'M8.2 11H13.8' : 'M8.2 11H13.8M11 8.2V13.8',
			Stroke.Ink,
			'1.15',
		) +
		shine('M7.5 8.4Q9.1 6.9 11 6.9')
	);
}
function photo(): string {
	return (
		rect(['4.2', '4.5', '15.6', '15'], Material.Paper, '1.3') +
		circle(['15.8', '8.3'], '1.7', Material.Gold) +
		surface('M5.8 17.8 10 11.7 13.2 15.2 15.4 13.5 18.2 17.8Z', Material.Green)
	);
}
function documentSheet(): string {
	return (
		surface('M5.2 2.8H14.6L19 7.2V21.2H5.2Z', Material.Paper) +
		surface('M14.6 2.8V7.2H19Z', Material.Gold)
	);
}
function upArrow(material: Material = Material.Gold): string {
	return (
		surface('M12 2.5 19 10H14.3V21.5H9.7V10H5Z', material) +
		shine('M12 5.3 15.8 9.2')
	);
}
function plus(): string {
	return line('M12 7V17M7 12H17', Stroke.Ink, '1.5');
}
function check(): string {
	return line('M6.4 12.4 10.1 16 17.8 8.1', Stroke.Ink, '1.4');
}
function layers(): string {
	return (
		surface('M2.8 15.5 12 20.8 21.2 15.5 12 10.2Z', Material.Paper) +
		surface('M2.8 10.9 12 16.2 21.2 10.9 12 5.6Z', Material.Green) +
		surface('M2.8 6.3 12 11.6 21.2 6.3 12 1Z', Material.Gold) +
		shine('M6 6.3 12 2.8 18 6.3')
	);
}
function turnArrow(reverse = false): string {
	const drawing =
		line(
			'M18.7 17.7C13.3 22.5 4 18.8 4 11.3 4 6.9 7.8 3.2 12.5 3.2 15 3.2 17.2 4.3 18.7 6',
			Stroke.Leaf,
			'2.1',
		) + surface('M19.8 2.8 20.5 10.2 13.1 8.9Z', Material.Gold);
	return reverse ? group('translate(24 0) scale(-1 1)', drawing) : drawing;
}
function lock(unlocked = false): string {
	return (
		line(
			unlocked
				? 'M7.2 10.1V6.8C7.2 1.2 17.5 1.2 17.5 6.8'
				: 'M7.2 11.2V6.8C7.2 1.2 16.8 1.2 16.8 6.8V11.2',
			Stroke.Neutral,
			'1.8',
		) +
		rect(
			['4.4', '10.2', '15.2', '11.2'],
			unlocked ? Material.Paper : Material.Gold,
			'2',
		) +
		solid(
			'M10.9 14.2Q12 13.1 13.1 14.2 14.2 15.3 12.8 16.4V18.6H11.2V16.4Q9.8 15.3 10.9 14.2Z',
		) +
		shine('M6.2 13.3V18.1')
	);
}
function eye(): string {
	return (
		surface(
			'M2.8 12Q7.1 6.2 12 6.2 16.9 6.2 21.2 12 16.9 17.8 12 17.8 7.1 17.8 2.8 12Z',
			Material.Paper,
		) +
		circle(['12', '12'], '4.2', Material.Green) +
		circle(['12', '12'], '1.65', Material.Metal) +
		shine('M10.4 9.6H11.3')
	);
}
function handleSquare(): string {
	return rect(['2', '2', '3.5', '3.5'], Material.Gold, '.4');
}

const UNDO =
	surface(
		'M9.2 3.7 2 10.6 9.2 17.5V13.2H14.1C19.5 13.2 20.7 16.9 18.6 20.8 25 15.6 21.8 8.3 14.1 8.3H9.2Z',
		Material.Gold,
	) + shine('M11.2 10.1H14.3Q19 10.1 20.3 13.3');

/** Every registry entry is constructed from the original geometry above or drawn below. */
export const ORIGINAL_ICON_SHAPES: Readonly<Record<EditorIconId, string>> = {
	[EditorIconId.Pencil]: PENCIL,
	[EditorIconId.Brush]: BRUSH,
	[EditorIconId.Marker]: MARKER,
	[EditorIconId.Highlighter]: HIGHLIGHTER,
	[EditorIconId.Calligraphy]: PEN,
	[EditorIconId.Pen]: PEN,
	[EditorIconId.Picker]: PICKER,
	[EditorIconId.Eraser]: ERASER,
	[EditorIconId.Fill]: BUCKET,
	[EditorIconId.Zoom]: magnifier(),
	[EditorIconId.Spray]:
		rect(['6.3', '8.8', '11.4', '13'], Material.Gold, '2') +
		rect(['6.3', '13.2', '11.4', '5.1'], Material.Green, '.2') +
		rect(['8.7', '5.9', '6.6', '2.9'], Material.Metal, '.6') +
		rect(['10.3', '3.3', '3.4', '2.6'], Material.Green, '.4') +
		line('M16.1 4.5H17.2M19.2 2.7H20.3M19.2 6.4H20.3') +
		shine('M8 10.9V12.1'),
	[EditorIconId.Line]:
		line('M3.75 3.75 20.25 20.25', Stroke.Leaf, '2') +
		handleSquare() +
		group('translate(16.5 16.5)', handleSquare()),
	[EditorIconId.Arrow]: group('rotate(45 12 12)', upArrow()),
	[EditorIconId.Rectangle]:
		rect(['3', '5.8', '18', '12.4'], Material.Gold, '.7') +
		rect(['6', '8.8', '12', '6.4'], Material.Paper, '.2') +
		shine('M4.5 7.3H19.5'),
	[EditorIconId.RoundedRectangle]:
		rect(['3', '5.8', '18', '12.4'], Material.Gold, '4') +
		rect(['6', '8.8', '12', '6.4'], Material.Paper, '2'),
	[EditorIconId.Ellipse]:
		'<ellipse cx="12" cy="12" rx="9.2" ry="6.8" fill="url(#__ART__-gold)"/><ellipse cx="12" cy="12" rx="6.2" ry="3.8" fill="url(#__ART__-paper)"/>' +
		shine('M6.2 7.5Q12 3.9 17.8 7.5'),
	[EditorIconId.Triangle]:
		surface('M12 3.3 21 20.7H3Z', Material.Gold) +
		surface('M12 9.7 16 17.8H8Z', Material.Paper),
	[EditorIconId.Diamond]:
		surface('M12 2.3 21.7 12 12 21.7 2.3 12Z', Material.Gold) +
		surface('M12 8 16 12 12 16 8 12Z', Material.Paper),
	[EditorIconId.Star]:
		surface(
			'M12 2.4 14.8 8.5 21.5 9.2 16.4 13.8 17.8 20.5 12 17.1 6.2 20.5 7.6 13.8 2.5 9.2 9.2 8.5Z',
			Material.Gold,
		) + shine('M12 5.5 13.9 10.1 18 10.5'),
	[EditorIconId.ElbowArrow]:
		surface('M3.5 3.2H8V15.5H15V10.8L22 17.8 15 23V19.7H3.5Z', Material.Gold) +
		rect(['3.5', '3.2', '4.5', '4.5'], Material.Green, '.5'),
	[EditorIconId.Polyline]:
		line('M4.1 19.3 9.6 5.1 15 17 20.2 4.4', Stroke.Leaf, '1.8') +
		rect(['2.5', '17.7', '3.2', '3.2'], Material.Gold, '.4') +
		rect(['8', '3.5', '3.2', '3.2'], Material.Paper, '.4') +
		rect(['13.4', '15.4', '3.2', '3.2'], Material.Gold, '.4') +
		rect(['18.6', '2.8', '3.2', '3.2'], Material.Paper, '.4'),
	[EditorIconId.Number]:
		circle(['12', '12'], '9.1', Material.Gold) +
		line('M9.1 8.5 12.3 6.9V17.1M9.3 17.1H15.3', Stroke.Ink, '1.3') +
		shine('M5.5 8.3Q7.1 5.2 10.5 4.8'),
	[EditorIconId.Highlight]:
		rect(['3.3', '3.8', '17.4', '16.4'], Material.Paper, '1.4') +
		rect(['5.3', '9.5', '13.4', '6.1'], Material.Gold, '.2') +
		line('M6 6.7H14.8M6 12.6H17.8M6 18H13.2'),
	[EditorIconId.Text]:
		surface(
			'M3.3 3.7H20.7V8.9H18V6.5H13.6V18.6H16.8V21.1H7.2V18.6H10.4V6.5H6V8.9H3.3Z',
			Material.Gold,
		) + shine('M5 5H19'),
	[EditorIconId.Blur]:
		rect(['3', '3', '18', '18'], Material.Paper, '3') +
		rect(['6', '6', '4.4', '4.4'], Material.Gold, '.7') +
		rect(['13.6', '6', '4.4', '4.4'], Material.Green, '.7') +
		'<g opacity=".65">' +
		rect(['6', '13.6', '4.4', '4.4'], Material.Green, '.7') +
		rect(['13.6', '13.6', '4.4', '4.4'], Material.Gold, '.7') +
		'</g>',
	[EditorIconId.Redact]:
		documentSheet() +
		rect(['7', '9.4', '10', '5.6'], Material.Metal, '.5') +
		line('M7.8 17.4H16.2', Stroke.Leaf),
	[EditorIconId.Select]:
		surface('M4.7 2.9 21 13.5 13.5 15 10.1 22Z', Material.Gold) +
		surface('M13.5 15 18.1 21.8 21.1 19.8 16.7 13.2Z', Material.Green) +
		shine('M7 7.1 14.9 12.2'),
	[EditorIconId.Crop]:
		neutral('M7.1 2.6V16.9H21.4M2.6 7.1H16.9V21.4') +
		surface('M7.1 14.2V16.9H9.8V14.2Z', Material.Gold),
	[EditorIconId.Layers]: layers(),
	[EditorIconId.Adjust]:
		neutral('M2.8 6.8H21.2M2.8 17.2H21.2') +
		rect(['7.2', '3.2', '4.1', '7.2'], Material.Gold, '1.5') +
		rect(['14.1', '13.6', '4.1', '7.2'], Material.Green, '1.5') +
		shine('M8.6 4.8V7.5'),
	[EditorIconId.Effects]:
		surface(
			'M12 2.8 14.7 9.3 21.2 12 14.7 14.7 12 21.2 9.3 14.7 2.8 12 9.3 9.3Z',
			Material.Gold,
		) +
		surface(
			'M20 1.8 20.8 4 23 4.8 20.8 5.6 20 7.8 19.2 5.6 17 4.8 19.2 4Z',
			Material.Green,
		) +
		shine('M12 6.2 13.8 10.2 17.8 12'),
	[EditorIconId.Transform]:
		turnArrow() + rect(['8', '8', '8', '8'], Material.Gold, '1'),
	[EditorIconId.Open]:
		rect(['8.4', '2.2', '11.8', '13.4'], Material.Paper, '1') +
		circle(['16.9', '5.4'], '1.3', Material.Gold) +
		surface('M10 12 13 7.8 15.4 10.3 18.5 8.6V13Z', Material.Green) +
		surface('M2.6 20.4V6.7H7.3L9.5 9H19.5V20.4Z', Material.Gold) +
		surface('M2.6 20.4 5.6 12.1H22L18.9 20.4Z', Material.Gold) +
		shine('M7 13.5H19.5'),
	[EditorIconId.Save]:
		surface(
			'M3.4 2.8H17.3L20.6 6.1V21.2H3.4Z',
			Material.Gold,
			'fill-rule="evenodd"',
		) +
		rect(['6.7', '2.8', '9.4', '6.1'], Material.Metal, '.2') +
		rect(['13.5', '3.4', '1.6', '4.7'], Material.Green, '.1') +
		rect(['6.7', '13.9', '10.6', '7.3'], Material.Paper, '.6') +
		line('M8.5 16.2H15.5M8.5 18.5H15.5', Stroke.Leaf, '.65'),
	[EditorIconId.Export]:
		surface('M3.8 15.6H7.1V19.4H16.9V15.6H20.2V22H3.8Z', Material.Paper) +
		group('translate(0 -1.3) scale(1 .9)', upArrow(Material.Green)),
	[EditorIconId.Diagram]:
		neutral('M12 7.2V12M5.6 16V12H18.4V16') +
		rect(['7.5', '2.4', '9', '5.3'], Material.Gold, '1') +
		rect(['1.6', '16', '8', '5.3'], Material.Green, '1') +
		rect(['14.4', '16', '8', '5.3'], Material.Paper, '1'),
	[EditorIconId.Undo]: UNDO,
	[EditorIconId.Redo]: group('translate(24 0) scale(-1 1)', UNDO),
	[EditorIconId.Visible]: eye(),
	[EditorIconId.Hidden]: eye() + line('M3.9 20.1 20.1 3.9', Stroke.Ink, '1.6'),
	[EditorIconId.Lock]: lock(),
	[EditorIconId.Unlock]: lock(true),
	[EditorIconId.Copy]:
		rect(['3.2', '2.5', '12.3', '15.3'], Material.Green, '1.1') +
		rect(['8.5', '6.2', '12.3', '15.3'], Material.Paper, '1.1') +
		rect(['10.4', '8.3', '8.5', '4.3'], Material.Gold, '.2') +
		line('M10.4 15.3H18.9M10.4 18.1H16.4'),
	[EditorIconId.NewLayer]:
		group('translate(-1.3 -1.3) scale(.86)', layers()) +
		circle(['18.8', '18.8'], '4.3', Material.Paper) +
		group('translate(10.4 10.4) scale(.7)', plus()),
	[EditorIconId.Close]: neutral('M6.3 6.3 17.7 17.7M17.7 6.3 6.3 17.7'),
	[EditorIconId.Plus]: plus(),
	[EditorIconId.Minus]: neutral('M6.2 12H17.8'),
	[EditorIconId.ChevronRight]: neutral('M9 5.8 15.2 12 9 18.2'),
	[EditorIconId.ArrowUp]: upArrow(),
	[EditorIconId.ArrowDown]: group('rotate(180 12 12)', upArrow()),
	[EditorIconId.Drag]:
		circle(['8', '5'], '1.35', Material.Metal) +
		circle(['16', '5'], '1.35', Material.Metal) +
		circle(['8', '12'], '1.35', Material.Metal) +
		circle(['16', '12'], '1.35', Material.Metal) +
		circle(['8', '19'], '1.35', Material.Metal) +
		circle(['16', '19'], '1.35', Material.Metal),
	[EditorIconId.Reset]: turnArrow(true),
	[EditorIconId.RotateLeft]: turnArrow(true),
	[EditorIconId.RotateRight]: turnArrow(),
	[EditorIconId.FlipHorizontal]:
		neutral('M12 2.9V21.1') +
		surface('M3.1 6 9.2 12 3.1 18Z', Material.Gold) +
		surface('M20.9 6 14.8 12 20.9 18Z', Material.Green),
	[EditorIconId.FlipVertical]:
		neutral('M2.9 12H21.1') +
		surface('M6 3.1 12 9.2 18 3.1Z', Material.Gold) +
		surface('M6 20.9 12 14.8 18 20.9Z', Material.Green),
	[EditorIconId.Resize]:
		rect(['3.3', '3.3', '17.4', '17.4'], Material.Paper, '1.6') +
		group('rotate(45 12 12) translate(3 3) scale(.75)', upArrow()) +
		line('M7 17H11M7 17V13', Stroke.Leaf, '1.2'),
	[EditorIconId.MergeDown]:
		layers() + group('translate(8 8) scale(.58) rotate(180 12 12)', upArrow()),
	[EditorIconId.Flatten]:
		surface('M2.7 17.6 12 22 21.3 17.6 12 13.2Z', Material.Green) +
		surface('M2.7 11.4 12 15.8 21.3 11.4 12 7Z', Material.Paper) +
		surface('M2.7 5.2 12 9.6 21.3 5.2 12 .8Z', Material.Gold) +
		line('M2.7 21.8H21.3', Stroke.Neutral, '1.5'),
	[EditorIconId.Ruler]: group(
		'rotate(-35 12 12)',
		rect(['2.5', '7.5', '19', '9'], Material.Gold, '.8') +
			line('M5.2 8V12.5M8.6 8V10.8M12 8V12.5M15.4 8V10.8M18.8 8V12.5') +
			shine('M4.2 14.8H19.8'),
	),
	[EditorIconId.Fit]:
		neutral('M3.4 8V3.4H8M16 3.4H20.6V8M20.6 16V20.6H16M8 20.6H3.4V16') +
		rect(['7.3', '7.3', '9.4', '9.4'], Material.Gold, '1'),
	[EditorIconId.ActualPixels]:
		rect(['3.3', '3.3', '17.4', '17.4'], Material.Paper, '1.2') +
		rect(['7.2', '7.2', '9.6', '9.6'], Material.Green, '.2') +
		shine('M8.7 8.7H15.3'),
	[EditorIconId.Focus]: neutral(
		'M8.1 2.8H2.8V8.1M15.9 2.8H21.2V8.1M21.2 15.9V21.2H15.9M8.1 21.2H2.8V15.9',
	),
	[EditorIconId.SpriteSheet]:
		rect(['2.8', '2.8', '18.4', '18.4'], Material.Paper, '1.5') +
		rect(['5.6', '5.6', '5', '5'], Material.Gold, '.5') +
		rect(['13.4', '5.6', '5', '5'], Material.Green, '.5') +
		rect(['5.6', '13.4', '5', '5'], Material.Green, '.5') +
		rect(['13.4', '13.4', '5', '5'], Material.Gold, '.5'),
	[EditorIconId.Convert]:
		surface('M3.1 5.5H16.1V2.1L22 8.2 16.1 13.2V9.8H3.1Z', Material.Gold) +
		surface('M20.9 18.5H7.9V21.9L2 15.8 7.9 10.8V14.2H20.9Z', Material.Green),
	[EditorIconId.NewImage]:
		documentSheet() + group('translate(3.6 8) scale(.7)', plus()),
	[EditorIconId.CloseImage]:
		group('translate(-1.5 -1) scale(.85)', photo()) +
		surface('M10.4 12.2H17.4V8.2L23 14.3 17.4 20.4V16.4H10.4Z', Material.Gold),
	[EditorIconId.RectangleSelection]:
		'<rect x="3.7" y="3.7" width="16.6" height="16.6" rx="1.1" stroke="var(--realistic-icon-neutral)" stroke-dasharray="2.3 2"/>' +
		rect(['8.3', '8.3', '7.4', '7.4'], Material.Gold, '.4'),
	[EditorIconId.Lasso]:
		line(
			'M12 18.2C1.8 18.2 1.8 3.3 12 3.3 22.2 3.3 22.2 18.2 12 18.2 8.3 18.2 8.3 22.3 12 22.3',
			Stroke.Leaf,
			'1.2',
		) + circle(['12', '18.2'], '1.6', Material.Gold),
	[EditorIconId.Report]:
		rect(['4.3', '3.9', '15.4', '17.8'], Material.Paper, '1.2') +
		rect(['8', '2.1', '8', '4.1'], Material.Gold, '.8') +
		line('M7 10 8.2 11.2 10.3 8.8', Stroke.Leaf, '1.1') +
		line('M12.5 10H17M7 15H17M7 18.4H14'),
	[EditorIconId.Apply]:
		circle(['12', '12'], '9.1', Material.Green) +
		check() +
		shine('M5.8 7.9Q7.3 5.3 10.1 4.7'),
	[EditorIconId.Toolbars]:
		rect(['3', '3.6', '18', '16.8'], Material.Paper, '1.3') +
		rect(['3', '3.6', '18', '4.2'], Material.Gold, '1.3') +
		rect(['3', '7.8', '5.6', '12.6'], Material.Green, '.1') +
		line('M10.9 10.4H18.7M10.9 13.5H18.7M10.9 16.6H16.2', Stroke.Ink, '.6'),
	[EditorIconId.Clip]:
		rect(['3.2', '8.7', '12.1', '12.1'], Material.Paper, '1.3') +
		circle(['15.8', '8.2'], '5.8', Material.Green) +
		surface('M10.1 8.7H15.3V13.9Q10.8 13.8 10.1 8.7Z', Material.Gold),
	[EditorIconId.ReleaseClip]:
		rect(['2.2', '11.6', '10.2', '10.2'], Material.Paper, '1.2') +
		circle(['17.5', '6.5'], '4.4', Material.Green) +
		line('M9.8 14.2 14.2 9.8M10.1 9.8H14.2V13.9', Stroke.Neutral, '1.2'),
	[EditorIconId.SwapColors]:
		rect(['2.7', '2.7', '11.8', '11.8'], Material.Gold, '1.2') +
		rect(['9.5', '9.5', '11.8', '11.8'], Material.Paper, '1.2') +
		line(
			'M17 3.6Q21 3.6 21 7.6M18.8 5.6 21 7.6 23.2 5.6M7 20.4Q3 20.4 3 16.4M.8 18.4 3 16.4 5.2 18.4',
			Stroke.Leaf,
			'1.1',
		),
	[EditorIconId.ShapeOutline]:
		'<rect x="3.8" y="5.4" width="16.4" height="13.2" rx="2.1" stroke="var(--realistic-icon-neutral)" stroke-width="2"/>',
	[EditorIconId.ShapeFill]:
		rect(['3.8', '5.4', '16.4', '13.2'], Material.Gold, '2.1') +
		shine('M6.1 7.2H17.9'),
	[EditorIconId.ShapeOutlineAndFill]:
		rect(['3.8', '5.4', '16.4', '13.2'], Material.Gold, '2.1') +
		'<rect x="3.8" y="5.4" width="16.4" height="13.2" rx="2.1" fill="none" stroke="var(--realistic-icon-neutral)" stroke-width="1.8"/>',
	[EditorIconId.PlaceImage]:
		photo() +
		circle(['19.1', '19.1'], '4.1', Material.Gold) +
		group('translate(10.7 10.7) scale(.7)', plus()),
};

/** Locally authored material shading, shared by toolbar artwork and cursor SVGs. */
export const ARTWORK_MATERIALS =
	'<defs>' +
	'<linearGradient id="__ART__-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ae730f"/><stop offset=".2" stop-color="#f5c13b"/><stop offset=".4" stop-color="#fff0ae"/><stop offset=".49" stop-color="#ffdf77"/><stop offset=".65" stop-color="#f6bd1c"/><stop offset="1" stop-color="#ba8210"/></linearGradient>' +
	'<linearGradient id="__ART__-green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#255c2e"/><stop offset=".25" stop-color="#5eba3b"/><stop offset=".4" stop-color="#a2e277"/><stop offset=".6" stop-color="#70c344"/><stop offset="1" stop-color="#326631"/></linearGradient>' +
	'<linearGradient id="__ART__-paper" x2="0" y2="1"><stop stop-color="#fffef5"/><stop offset="1" stop-color="#e9ecdd"/></linearGradient>' +
	'<linearGradient id="__ART__-glass" x2="1" y2="1"><stop stop-color="#f8fffb"/><stop offset=".35" stop-color="#d2e5de"/><stop offset=".55" stop-color="#f4fff9"/><stop offset="1" stop-color="#8baa9e"/></linearGradient>' +
	'<linearGradient id="__ART__-metal" x2="1" y2="1"><stop stop-color="#54645f"/><stop offset=".3" stop-color="#eef3e9"/><stop offset=".45" stop-color="#fffef5"/><stop offset=".6" stop-color="#9daea7"/><stop offset="1" stop-color="#374740"/></linearGradient>' +
	'<filter id="__ART__-shadow" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36"><feDropShadow dx="0" dy=".5" stdDeviation=".45" flood-color="#101e18" flood-opacity=".28"/></filter>' +
	'<filter id="__ART__-halo" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36"><feMorphology in="SourceAlpha" operator="dilate" radius=".5" result="expanded"/><feFlood flood-color="#eff3e7" result="rim"/><feComposite in="rim" in2="expanded" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

export function originalIconArtwork(id: EditorIconId): string {
	return `<g class="editor-icon-halo" filter="url(#__ART__-halo)"><g filter="url(#__ART__-shadow)">${ORIGINAL_ICON_SHAPES[id]}</g></g>`;
}

const CURSOR_SIZE = { Standard: '32', Rotation: '24' } as const;
const PRECISION_MARK =
	line(
		'M19.5 16.3V18.1M19.5 20.9V22.7M16.3 19.5H18.1M20.9 19.5H22.7',
		Stroke.Ink,
		'.85',
	) + '<circle cx="19.5" cy="19.5" r=".45" fill="#1b2634" stroke="none"/>';
const TWO_WAY_ARROW =
	surface(
		'M2.1 12 7.8 6.3V9.8H16.2V6.3L21.9 12 16.2 17.7V14.2H7.8V17.7Z',
		Material.Gold,
	) + shine('M9.3 11H14.7');
const MOVE_ARROWS = surface(
	'M12 2.2 16.2 6.7H13.7V10.3H17.3V7.8L21.8 12 17.3 16.2V13.7H13.7V17.3H16.2L12 21.8 7.8 17.3H10.3V13.7H6.7V16.2L2.2 12 6.7 7.8V10.3H10.3V6.7H7.8Z',
	Material.Gold,
);
const GRAB_HAND =
	surface(
		'M7.1 20.6C6.2 18.8 3.7 15.8 3.5 14.2 3.3 12.7 4.7 12.2 5.8 13.2L7.5 15V8.6Q7.5 6.5 9.1 6.5 10.3 6.5 10.3 8.6V11.5 5.6Q10.3 3.5 11.9 3.5 13.3 3.5 13.3 5.6V11.5 6.7Q13.3 4.8 14.8 4.8 16.3 4.8 16.3 6.7V12.1 9.4Q16.3 7.6 17.8 7.6 19.3 7.6 19.3 9.4V15.4Q19.3 19.1 17.5 20.6Z',
		Material.Paper,
	) + rect(['7.1', '19.1', '10.4', '3'], Material.Green, '.5');

/** Standalone SVGs use the same original geometry as the shared icon registry. */
export function originalCursorSvg(id: EditorCursorId): string {
	const body: Readonly<Record<EditorCursorId, string>> = {
		[EditorCursorId.Pencil]: PENCIL,
		[EditorCursorId.Brush]: BRUSH,
		[EditorCursorId.Marker]: MARKER,
		[EditorCursorId.Highlighter]: HIGHLIGHTER,
		[EditorCursorId.Pen]: PEN,
		[EditorCursorId.Eraser]: ERASER,
		[EditorCursorId.Picker]: PICKER,
		[EditorCursorId.Fill]:
			group(
				'translate(1 1) scale(.68)',
				BUCKET.replace(
					'fill="url(#__ART__-paper)"',
					'fill="{{ColorPalette.White}}" stroke="{{ColorPalette.MidnightBlue}}"',
				),
			) + PRECISION_MARK,
		[EditorCursorId.Crosshair]:
			'<circle cx="12" cy="12" r="3.3" fill="none"/>' +
			line('M12 3.6V7M12 17V20.4M3.6 12H7M17 12H20.4', Stroke.Ink, '1.1'),
		[EditorCursorId.Text]: line(
			'M12 3.5V20.5M8.2 3.5H15.8M8.2 20.5H15.8',
			Stroke.Ink,
			'1.2',
		),
		[EditorCursorId.Move]: MOVE_ARROWS,
		[EditorCursorId.Grab]: GRAB_HAND,
		[EditorCursorId.ZoomIn]: magnifier(),
		[EditorCursorId.ZoomOut]: magnifier(true),
		[EditorCursorId.ResizeHorizontal]: TWO_WAY_ARROW,
		[EditorCursorId.ResizeVertical]: group('rotate(90 12 12)', TWO_WAY_ARROW),
		[EditorCursorId.ResizeDiagonal]: group('rotate(45 12 12)', TWO_WAY_ARROW),
		[EditorCursorId.ResizeDiagonalReverse]: group(
			'rotate(-45 12 12)',
			TWO_WAY_ARROW,
		),
		[EditorCursorId.Rotate]: turnArrow(),
		[EditorCursorId.Lasso]:
			group(
				'translate(1 1) scale(.68)',
				ORIGINAL_ICON_SHAPES[EditorIconId.Lasso],
			) + PRECISION_MARK,
	};
	const size =
		id === EditorCursorId.Rotate ? CURSOR_SIZE.Rotation : CURSOR_SIZE.Standard;
	const hotspot = EDITOR_CURSOR_HOTSPOTS[id];
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${Stroke.Ink}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"><!-- Original Little Image Editor artwork. Hotspot: ${hotspot.x}, ${hotspot.y}. -->${ARTWORK_MATERIALS}<g filter="url(#__ART__-halo)">${body[id]}</g></svg>`
		.replaceAll(ARTWORK_ID_TOKEN, `editor-cursor-${id}`)
		.replaceAll(Stroke.Neutral, Stroke.Ink);
}
