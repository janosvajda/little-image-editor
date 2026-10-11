import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AssistantCommandKind } from './assistantCommandTypes';
import { DrawScriptError, parseDrawScript } from './drawScript';

describe('the drawing script', () => {
	it('reads a whole picture: a new image, layers, shapes, lines and text', () => {
		const script = parseDrawScript(`image fruit.png 512x512 #fafafa
// the background stays plain
layer Circles
circle 40,40 110 #3a86ff
star 362,40 110x110 #ffbe0b outline 3 opacity 0.5
layer Apple Tree
ellipse 150,215 125x195 #d62828 rotate -12.5
use Circles
arrow 10,10 200,120 #000000 width 6
line 0,0 5,5 #111111
text 20,30 #000000 size 48 "Say \\"hi\\""
`);
		expect(script.image).toEqual({ name: 'fruit.png', spec: { width: 512, height: 512, background: '#fafafa', transparent: false } });
		expect(script.lines).toEqual([3, 4, 5, 6, 7, 9, 10, 11]);
		expect(script.commands).toEqual([
			{ kind: AssistantCommandKind.AddLayer, name: 'Circles' },
			{ kind: AssistantCommandKind.AddShape, shape: ShapeToolId.Ellipse, rect: { x: 40, y: 40, width: 110, height: 110 }, color: '#3a86ff', fill: true, strokeWidth: 4, opacity: 1, rotation: 0 },
			{ kind: AssistantCommandKind.AddShape, shape: ShapeToolId.Star, rect: { x: 362, y: 40, width: 110, height: 110 }, color: '#ffbe0b', fill: false, strokeWidth: 3, opacity: 0.5, rotation: 0 },
			{ kind: AssistantCommandKind.AddLayer, name: 'Apple Tree' },
			{ kind: AssistantCommandKind.AddShape, shape: ShapeToolId.Ellipse, rect: { x: 150, y: 215, width: 125, height: 195 }, color: '#d62828', fill: true, strokeWidth: 4, opacity: 1, rotation: -12.5 },
			{ kind: AssistantCommandKind.AddLine, layer: 'Circles', from: { x: 10, y: 10 }, to: { x: 200, y: 120 }, arrow: true, color: '#000000', width: 6, opacity: 1 },
			{ kind: AssistantCommandKind.AddLine, layer: 'Circles', from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, arrow: false, color: '#111111', width: 4, opacity: 1 },
			{ kind: AssistantCommandKind.AddText, layer: 'Circles', at: { x: 20, y: 30 }, text: 'Say "hi"', color: '#000000', size: 48 },
		]);
	});

	it('makes a transparent image, and an outline without a width uses the default', () => {
		const script = parseDrawScript('image icon.png 64x64 transparent\nrect 0,0 10x10 #000000 outline');
		expect(script.image?.spec).toMatchObject({ transparent: true });
		expect(script.commands[0]).toMatchObject({ fill: false, strokeWidth: 4 });
	});

	it.each([
		['circle 10,10 50 red', 'Line 1: expected a colour such as #d62828 but found "red".'],
		['layer A\nhexagon 0,0 5x5 #000000', 'Line 2: unknown statement "hexagon".'],
		['layer A\nimage b.png 10x10', 'Line 2: image can only be the first statement.'],
		['rect 10 20x20 #000000', 'Line 1: expected a point such as 10,20 but found "10".'],
		['rect 0,0 0x20 #000000', 'Line 1: expected a size such as 100x50 but found "0x20".'],
		['rect 0,0 5x5 #000000 opacity 2', 'Line 1: opacity must be from 0 to 1.'],
		['rect 0,0 5x5 #000000 glow 2', 'Line 1: unknown option "glow"; use outline, opacity, rotate, fill.'],
		['rect 0,0 5x5 #000000 rotate', 'Line 1: rotate needs a number.'],
		['text 0,0 #000000 Hello', 'Line 1: text needs its words in quotes at the end.'],
		['text 0,0 #000000 "Hello', 'Line 1: a quote is not closed.'],
		['use', 'Line 1: use needs a layer name.'],
		['image big.png 99999x10', 'Line 1: an image side can be at most 16384 pixels.'],
		['// only a comment', 'The script draws nothing.'],
	])('refuses %j with a message pointing at the line', (source, message) => {
		expect(() => parseDrawScript(source)).toThrow(new DrawScriptError(message));
	});
});
