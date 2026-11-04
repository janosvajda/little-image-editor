# Little Animation file format, version 1

This document specifies the `.anim.json` animation file written by Little Image
Editor. It is normative: a program that follows it can read, validate and play
these files without any of the editor's code. The schema in
`src/app/features/animation/format/animationSchema.ts` and the reference player
`evaluateFrame` in `src/app/features/animation/format/evaluateFrame.ts` implement
it; the golden fixtures in `tests/fixtures/animation/` let any implementation
check itself (see [Conformance](#conformance)).

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. The file

| Property | Value |
| --- | --- |
| Extension | `.anim.json` |
| Media type | `application/json` |
| Encoding | UTF-8 JSON (RFC 8259) |
| Identity | `format` is `"little-animation"`, `version` is `1` |

The file is both the editable document and the playable animation. A file
written by the editor, opened by it and written again is byte-for-byte the same.

### 1.1 Coordinates and units

* Lengths are **stage pixels**. The origin is the top-left corner of the stage,
  x grows to the right and **y grows downwards**, as on a canvas.
* Angles are **radians**. A positive rotation turns **clockwise** on screen.
* Colours are `Rgba`: an array `[red, green, blue, alpha]`, each from 0 to 1, in
  sRGB, not premultiplied.
* Frames are counted **from 0**. Frame `f` of a stage at `fps` frames per second
  is shown from time `f / fps` seconds.
* Matrices are `[a, b, c, d, e, f]`, mapping a point `(x, y)` to
  `(a·x + c·y + e, b·x + d·y + f)`, as in canvas `setTransform` and SVG `matrix()`.

### 1.2 Canonical form

Writers SHOULD write files in canonical form, and the editor always does:

* keys in the order this document lists them;
* numbers rounded to 6 decimal places, written as JSON numbers without
  trailing zeros, and without negative zero;
* indented by two spaces, ending with a newline;
* optional fields left out rather than written as `null`, unless `null` is a
  listed value.

Readers MUST NOT depend on key order or formatting.

### 1.3 Unknown fields and versions

* Readers MUST ignore fields this document does not define. A future minor
  revision of version 1 may add optional fields; older readers stay correct.
* Readers MUST reject a file whose `format` is not `"little-animation"`, and a
  file whose `version` is not a major version they implement. This document
  defines version `1` only.
* A change that an older reader would misplay, such as a new item kind, a new
  tween kind or a changed rule, is a new major `version`.

**Migration policy.** A reader that implements version *n* SHOULD also read
every earlier version, converting it to *n* on reading; the conversion of each
earlier version is specified in the document of the version that changed it. A
writer writes only the newest version it implements. The editor will keep
reading version 1 files in every later version.

## 2. The document

```ts
interface AnimationFile {
  format: 'little-animation';
  version: 1;
  stage: Stage;
  library: SymbolDef[];
  timeline: Timeline;
}
```

### 2.1 Stage

| Field | Type | Range | Meaning |
| --- | --- | --- | --- |
| `width` | integer | ≥ 1 | Stage width, in pixels. |
| `height` | integer | ≥ 1 | Stage height, in pixels. |
| `background` | `Rgba` or `null` | | Colour under every layer; `null` is transparent. |
| `fps` | integer | 1 to 120 | Frames shown per second. |
| `frames` | integer | 1 to 10 000 | Frames the animation has. Players play frames `0` to `frames − 1`. Writers write the length of the longest layer. |

### 2.2 Timeline

```ts
interface Timeline { layers: AnimLayer[]; labels: FrameLabel[] }
```

`layers` are listed **bottom first**: later layers are drawn over earlier ones.

| `AnimLayer` field | Type | Range | Meaning |
| --- | --- | --- | --- |
| `id` | string | non-empty, unique in its timeline | |
| `name` | string | | Shown to people; any text. |
| `visible` | boolean | | A hidden layer draws nothing. |
| `locked` | boolean | | Editing only; players ignore it. |
| `opacity` | number | 0 to 1 | The layer's opacity, applied to the layer as one group. |
| `blendMode` | string | see below | How the layer is composited over what is under it. |
| `length` | integer | 1 to 10 000 | Frames the layer has. It draws nothing from frame `length` on. |
| `keyframes` | `AnimKeyframe[]` | | Sorted by `frame`, each frame at most once, each `< length`. |

`blendMode` is one of `normal`, `multiply`, `screen`, `overlay`, `darken`,
`lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`,
`difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, with the
meanings of the CSS `mix-blend-mode` values of those names.

| `FrameLabel` field | Type | Range | Meaning |
| --- | --- | --- | --- |
| `name` | string | non-empty | A name for a range of frames, such as `walk`. |
| `frame` | integer | 0 to 9 999 | Its first frame. |
| `length` | integer | ≥ 1 | How many frames it covers. |

Labels name parts of an animation; they do not change what is drawn.

### 2.3 Keyframes

| `AnimKeyframe` field | Type | Meaning |
| --- | --- | --- |
| `frame` | integer, 0 to 9 999 | The frame where the layer's content is defined. |
| `items` | `AnimItem[]` | The layer's items from this frame, **bottom first**; ids unique in the keyframe. |
| `tween` | `MotionTween` or `null` | How the frames up to the next keyframe are drawn; `null` holds this keyframe. |

A keyframe lasts until the layer's next keyframe, or the layer's `length`.

```ts
interface MotionTween {
  kind: 'motion';
  ease: { kind: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' }
      | { kind: 'custom'; points: [x1, y1, x2, y2] };  // x1, x2 in 0..1
  rotate: 'auto' | 'clockwise' | 'counterClockwise';
  extraTurns: integer;  // ≥ 0
}
```

### 2.4 Items

Every item has these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string, non-empty | Identifies the item across a layer's keyframes: the same id on two keyframes is the same object, which a tween moves from one to the other. |
| `name` | string, optional | Shown to people. |
| `transform` | `Transform` | Places the item's own coordinates in its parent's. |
| `opacity` | number, 0 to 1 | Multiplies into everything the item draws. |
| `visible` | boolean | A hidden item draws nothing. |
| `frame` | `{ width, height }`, optional | The size of the frame the item's content is laid out in, in its own coordinates, from `(0, 0)`. Tweens change it; see [§4.4](#44-frame-scaling). |
| `editor` | string, optional | The item as Little Image Editor edits it. Opaque: players MUST ignore it. |

```ts
interface Transform {
  x: number; y: number;          // where the pivot lies in the parent
  rotation: number;              // radians, clockwise
  scaleX: number; scaleY: number;
  skewX: number;                 // radians
  pivot: { x: number; y: number };  // in the item's own coordinates
}
```

An item's matrix, mapping its own coordinates to its parent's, is

```
M = translate(x, y) · rotate(rotation) · skewX(skewX) · scale(scaleX, scaleY) · translate(−pivot.x, −pivot.y)
```

where `rotate(θ) = [cos θ, sin θ, −sin θ, cos θ, 0, 0]`,
`skewX(k) = [1, 0, tan k, 1, 0, 0]` and `scale(sx, sy) = [sx, 0, 0, sy, 0, 0]`.

Items are one of five kinds, told apart by `kind`.

#### `path`

| Field | Type | Meaning |
| --- | --- | --- |
| `contours` | `{ closed: boolean; commands: PathCommand[] }[]` | The outline. |
| `fill` | `Paint` or `null` | Fills the closed area, or nothing. |
| `fillRule` | `"nonzero"` or `"evenodd"` | As SVG `fill-rule`. |
| `stroke` | `Stroke` or `null` | Draws the outline, or nothing. |

A `PathCommand` is an array: `["M", x, y]` starts a contour, `["L", x, y]` draws a
line, `["C", x1, y1, x2, y2, x, y]` a cubic Bézier, `["Q", x1, y1, x, y]` a
quadratic Bézier, `["Z"]` closes the contour back to its start. Coordinates are
the item's own. A contour with `closed` true is closed whether or not it ends
with `Z`. Contours are filled as SVG fills open subpaths: implicitly closed.

```ts
interface Stroke {
  paint: Paint;
  width: number;                 // > 0, in the item's own coordinates
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';   // miter limit 10, as canvas and SVG
  dash: number[];                // dash and gap lengths, as SVG stroke-dasharray; [] is solid
}
```

The fill is drawn first, then the stroke over it.

#### `text`

| Field | Type | Meaning |
| --- | --- | --- |
| `text` | string | One line of text. |
| `font` | `{ family, size, weight, style }` | `family` as CSS `font-family`; `size` in pixels, > 0; `weight` 1 to 1000; `style` `"normal"` or `"italic"`. |
| `color` | `Rgba` | |
| `align` | `"left"`, `"center"` or `"right"` | Where the text lies against x = 0. |
| `baseline` | `"alphabetic"`, `"top"`, `"middle"` or `"bottom"` | Which line of the text lies at y = 0, as canvas `textBaseline`. |
| `maxWidth` | number, optional | When the text would be wider, its glyphs are narrowed to fit, as canvas `fillText` `maxWidth` and SVG `textLength` with `lengthAdjust="spacingAndGlyphs"`. |

The text is drawn at `(0, 0)` of its own coordinates. Fonts are not embedded:
players use the named family, or their own fallback.

#### `image`

| Field | Type | Meaning |
| --- | --- | --- |
| `width`, `height` | number, > 0 | The picture's size in its own coordinates. |
| `png` | string | The picture as base64 PNG, without a `data:` prefix. |

The picture fills the rectangle from `(0, 0)` to `(width, height)`.

#### `group`

| Field | Type | Meaning |
| --- | --- | --- |
| `items` | `AnimItem[]` | The group's items, bottom first, in the group's own coordinates. |

#### `instance`

A placed symbol, playing its own timeline.

| Field | Type | Meaning |
| --- | --- | --- |
| `symbol` | string | The `id` of a symbol in `library`. |
| `play` | `"loop"`, `"once"` or `"single"` | How its time runs; see [§3.3](#33-instance-time). |
| `firstFrame` | integer, `< symbol.frames` | The symbol frame it starts at. |
| `tint` | `{ color: Rgba; amount: 0..1 }` or `null` | Mixes every colour it draws towards `color`. |

### 2.5 Paint

```ts
type Paint =
  | { kind: 'solid'; color: Rgba }
  | { kind: 'linear' | 'radial'; stops: { offset: 0..1; color: Rgba }[]; from: Point; to: Point };
```

A gradient has at least two stops, in the order written. `from` and `to` are in
the coordinates of what is painted. A **linear** gradient runs from `from` to
`to`, padded beyond them. A **radial** gradient is centred on `from`, offset 1
on the circle through `to`, padded beyond it. Colours between stops are
interpolated in non-premultiplied sRGB.

### 2.6 Symbols

```ts
interface SymbolDef { id: string; name: string; timeline: Timeline; frames: integer }
```

`id` is unique in `library`. `frames` (1 to 10 000) is how many frames the
symbol's timeline plays. A symbol's timeline follows every rule of the main
timeline. A symbol MUST NOT place itself, directly or through other symbols.

## 3. Evaluating a frame

To draw frame `f`:

1. Fill the stage with `background`, if any.
2. For each **visible** layer, bottom first, find what it shows at `f`
   ([§3.1](#31-what-a-layer-shows)) and draw its items, bottom first, each with
   the matrix and opacity of [§3.2](#32-drawing-an-item). Composite the layer
   as one group with its `opacity` and `blendMode`.

### 3.1 What a layer shows

1. If `f < 0` or `f ≥ length`, the layer shows nothing.
2. The **active keyframe** A is the last keyframe with `A.frame ≤ f`. Without
   one, the layer shows nothing.
3. If `f = A.frame`, A has no tween, or A is the layer's last keyframe, the
   layer shows A's items as they are.
4. Otherwise A's tween runs to the next keyframe B. With
   `t = (f − A.frame) / (B.frame − A.frame)` and `e = ease(t)`
   ([§4.1](#41-eases)), each item of A is shown:
   * tweened towards the item of B with the same `id` and the same `kind`, at
     `e` ([§4](#4-motion-tweens)), when B has one;
   * unchanged otherwise.

   Items only in B are not shown until frame B.

### 3.2 Drawing an item

An item is drawn under its parent's matrix `P` and opacity `p`. A hidden item
draws nothing. Otherwise its matrix is `P · M` (§2.4) and its opacity `p ·
opacity`:

* a **path**, **text** or **image** draws itself with that matrix and opacity;
* a **group** draws each of its items under its own matrix and opacity;
* an **instance** draws its symbol's timeline at the symbol frame of
  [§3.3](#33-instance-time): each visible layer of the symbol, bottom first, its
  items under the instance's matrix and the opacity `instance opacity × layer
  opacity`. Inside a symbol, layers' blend modes are not applied.

**Opacity** multiplies down through groups, instances and symbol layers.

**Tint.** Each instance with a tint mixes every colour drawn inside it, through
any depth, towards the tint's colour: `rgb' = rgb + (tint.rgb − rgb) × amount`,
for red, green and blue; alpha is kept. Nested tints apply innermost first.
Pictures are tinted the same way, pixel by pixel.

### 3.3 Instance time

Let `k` be the frame of the keyframe that holds the instance, `f` the frame of
the timeline the instance is on, and `n = symbol.frames`. The instance shows
symbol frame:

* `single`: `firstFrame`, always;
* `loop`: `(firstFrame + (f − k)) mod n`;
* `once`: `min(firstFrame + (f − k), n − 1)`.

## 4. Motion tweens

Between items `a` (in keyframe A) and `b` (in keyframe B) at eased progress `e`:

| Value | At `e` |
| --- | --- |
| `transform.x`, `transform.y` | `lerp(a, b, e)` |
| `transform.rotation` | `a.rotation + Δ(a.rotation, b.rotation) × e` ([§4.2](#42-rotation)) |
| `transform.scaleX`, `scaleY`, `skewX` | `lerp(a, b, e)` |
| `transform.pivot` | see [§4.4](#44-frame-scaling) |
| `opacity` | `lerp(a, b, e)` |
| `frame` | `lerp(a, b, e)` for width and height, when both have one |
| path `fill`, stroke `paint` | [§4.3](#43-paints), when both have one |
| text `color` | channel by channel |
| group items | paints of the items in the same position, when both groups hold as many items of the same kinds in the same order |
| instance `tint` | colour channel by channel, `amount` by `lerp`, when both have one |

where `lerp(a, b, e) = a + (b − a) × e`. Everything else, including the content
of paths, text, pictures and groups, is item `a`'s.

### 4.1 Eases

For `t` in 0..1 (values outside are clamped):

| Ease | `ease(t)` |
| --- | --- |
| `linear` | `t` |
| `easeIn` | `t²` |
| `easeOut` | `1 − (1 − t)²` |
| `easeInOut` | `2t²` when `t < 0.5`, otherwise `1 − (−2t + 2)² / 2` |
| `custom` | the CSS `cubic-bezier(x1, y1, x2, y2)` at `t` |

A custom ease is the cubic Bézier through `(0, 0)`, `(x1, y1)`, `(x2, y2)` and
`(1, 1)`. Its value at `t` is its y at the curve parameter `s` whose x is `t`:

```
x(s) = 3(1 − s)²s·x1 + 3(1 − s)s²·x2 + s³        y(s) likewise with y1, y2
```

Find `s` to within `1e−7` in x: Newton–Raphson from `s = t` for up to 8 steps,
stopping if the slope `x′(s)` falls below `1e−6`; then bisection on 0..1 for up
to 64 steps. `ease(0) = 0` and `ease(1) = 1` exactly.

### 4.2 Rotation

`Δ(from, to)` is the angle the item turns. Let `c = (to − from) mod 2π`, in
`[0, 2π)`, and `T = 2π × extraTurns`.

| `rotate` | `Δ` |
| --- | --- |
| `clockwise` | `c + T` |
| `counterClockwise` | `(c = 0 ? 0 : c − 2π) − T` |
| `auto` | the shorter way: `s = (c > π ? c − 2π : c)`; then `s − T` when `s < 0`, otherwise `s + T` |

Half a turn on `auto` goes clockwise.

### 4.3 Paints

* Two `solid` paints: the colour changes channel by channel (red, green, blue
  and alpha each by `lerp`), in non-premultiplied sRGB.
* Two gradients of the same `kind` with as many stops: each stop's `offset` by
  `lerp`, its colour channel by channel, and `from` and `to` by `lerp`.
* Anything else holds `a`'s paint.

### 4.4 Frame scaling

When both items have a `frame`, the frame changes during the tween, and `a`'s
content is laid out in the changing frame, as the editor lays out a resized
item. With `sx = frame.width / a.frame.width` and
`sy = frame.height / a.frame.height` (1 where `a`'s side is 0), content is
scaled along the item's own axes:

* path command coordinates are multiplied by `(sx, sy)`; stroke widths and
  dash lengths are **not** scaled;
* text `font.size` is multiplied by `sy`, and `maxWidth` by `sx`;
* picture `width` by `sx` and `height` by `sy`;
* a group's items have `transform.x` multiplied by `sx` and `transform.y` by
  `sy`, and their content scaled by the same rule;
* instances are not scaled.

The pivot keeps its share of the frame: on each axis, when both frames are
non-zero, `pivot = lerp(a.pivot / a.frame, b.pivot / b.frame, e) × frame`;
otherwise `lerp(a.pivot, b.pivot, e)`.

Without frames, the pivot changes by `lerp` and content is not scaled.

## 5. Validation

A file is valid when every field has the type and range above, and:

1. each layer's keyframes are sorted by frame with no frame twice, and each
   keyframe's frame is below the layer's `length`;
2. layer ids are unique within each timeline;
3. item ids are unique within each keyframe (children of a group are not
   counted with their group's siblings);
4. symbol ids are unique in `library`;
5. every instance names a symbol in `library`, with `firstFrame` below that
   symbol's `frames`;
6. no symbol places itself, directly or through other symbols.

Readers MUST reject invalid files, and SHOULD say which rule failed and where.

## 6. The draw list

`evaluateFrame(file, f)` returns what frame `f` draws:

```ts
interface DrawList { frame: number; width: number; height: number; background: Rgba | null; layers: DrawLayer[] }
interface DrawLayer { id: string; blendMode: BlendMode; opacity: number; items: DrawPrimitive[] }
type DrawPrimitive =
  | { kind: 'path';  matrix; opacity; contours; fill; fillRule; stroke }
  | { kind: 'text';  matrix; opacity; text; font; color; align; baseline; maxWidth? }
  | { kind: 'image'; matrix; opacity; width; height; png; tints };
```

Only visible layers are listed, bottom first; each lists its primitives in
drawing order, groups and instances already flattened into them. `matrix` maps
the primitive's own coordinates to the stage; `opacity` is final; paths' and
texts' colours are already tinted; a picture lists the tints still to apply to
its pixels, innermost first. Tweened values (frame scaling included) are
already applied.

## 7. Little Image Editor's own items

The editor writes each of its items as one file item, and keeps the item
itself, exactly, in `editor`: an SVG document holding the item's group as the
editor's SVG documents write it (`docs/drawing-architecture.md`), with the
item's id in `data-id`. Opening a file the editor wrote reads items back from
`editor`; a file without it is read from what its items draw.

The file item's content is what the editor's own renderer draws for the item,
laid out unturned in its frame from `(0, 0)`; its transform puts the frame
where the item is, its pivot at the item's pivot, and its `frame` is the item's
frame size. What the renderer draws becomes:

| Drawn as | File item |
| --- | --- |
| A filled path, a filled rectangle | `path` with `fill` |
| An outlined path | `path` with `stroke`; an outline of the path filled just before it joins that path |
| A solid colour, a linear gradient, a radial gradient from its centre | `Paint` |
| Text | `text` |
| A picture of its own | `image` |
| More than one of these, or one placed by its own matrix | `group` of them |

How each kind of editor item is written:

| Editor item | File item |
| --- | --- |
| Shape: rectangle, rounded rectangle, ellipse, triangle, diamond, star | `path` |
| Path, drawn with the Pen or Polyline | `path` |
| Box, highlight, redaction | `path` |
| Flood fill | `path` of its rows of pixels |
| Hard-edged brush stroke: pencil, marker, highlighter, spray | `path` |
| Arrow, connector | `group` of the line and its heads, each a `path` |
| Numbered marker | `group` of its circle `path` and its number `text` |
| Text | `group` holding the `text`, placed at its baseline |
| Placed picture, cut-out piece | `image` |
| Blur area | baked |
| Soft-edged brush stroke | baked |
| Any item with effects (blur, drop shadow), a clip, erasures or pixel cut-outs | baked |
| Any item painted with a pattern, or drawn other than normally composited | baked |

Ellipses and arcs are written as cubic Bézier arcs of at most a quarter turn
each, with handles `4/3 · tan(θ/4)` of the radius long — the standard
approximation, `κ ≈ 0.5523` for a quarter turn.

**Baked items.** An item whose drawing uses anything this format cannot say is
written as the **picture it draws** instead: one `image` in a `group`, cropped
to what it covers, in the item's frame coordinates.

Baked items still move, turn, scale and fade in tweens, and keep everything in
`editor`, so the editor opens them as editable as before. Nothing the editor
draws is left out.

**Not kept.** Pixels painted on the stage itself, such as by an image effect,
are not part of any layer and are not written; the editor says so before it
saves. Symbols and instances are part of the format; this version of the editor
reads files with instances but leaves them out, saying so.

## 8. Conformance

`tests/fixtures/animation/` holds, for each fixture `name`:

* `name.anim.json`, a valid file in canonical form;
* `name.frames.json`, `{ "frames": { "<f>": DrawList, … } }`, the draw lists of
  chosen frames, numbers rounded to 6 decimal places.

Between them the fixtures use every item kind, every play mode, tints, nested
symbols, every ease and rotation direction, extra turns, paint and opacity
tweens, frame scaling, holds, layer lengths, hidden layers, layer opacity and
blend modes, and skew. An implementation conforms when it accepts every fixture
and, for each listed frame, draws what its draw list says (within `1e−6`).

## 9. Changes from the first draft

The first draft of this format, before version 1 was fixed, differed as follows:

* `AnimLayer.length` was added: layers end, and the editor keeps where.
* `frame` was added to items, so a tween can resize an item's frame without
  thickening its lines, as the editor does.
* The `group` item kind was added: one editor item may draw several primitives.
* Text gained `baseline` and `maxWidth`, which the editor's text uses.
* The draft's `stroke` item kind for brush strokes was not adopted. Brushes are
  written as the exact paths they draw, or as pictures, so that every player
  draws them exactly as the editor does without implementing its brushes.
