# Little Image Editor

A fast, private image editor with layers, drawing tools, screenshot annotation and AI-assisted drawing. One shared editor runs in three places:

| Edition | What it is for |
|---|---|
| **Web app** | Runs locally in your browser at `http://127.0.0.1:5173`. |
| **Chrome extension** | Edit any image on a web page, or capture the visible page or a region of it. |
| **VS Code extension** | Open and create images inside VS Code, and let Claude Code or Codex look at them and draw in them. |

Everything happens on your computer. Images are never uploaded, and no data is collected or sent anywhere.

## Contents

- [Features](#features)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Install and run](#install-and-run)
- [AI assistants (VS Code)](#ai-assistants-vs-code)
- [Development](#development)
- [Tests and quality gates](#tests-and-quality-gates)
- [License](#license)

## Features

### Drawing and painting

- **Paint tools:** pencil, brush, marker, highlighter, calligraphy ink, spray paint and eraser, with colour, width, opacity and hardness.
- **Shapes:** line, arrow, rectangle, rounded rectangle, ellipse, triangle, diamond and star, filled or outlined.
- **Elbow arrow:** a right-angled, bent arrow for diagrams. Choose what each end has: an arrowhead, an open arrow, a hollow triangle, a hollow or filled diamond, a circle, a cross or nothing. It stays one object when you move or resize it.
- **Mermaid diagrams:** the **Insert Mermaid diagram** toolbar button, in every edition, opens a box to paste a diagram or import it from a file. In the web app and Chrome extension, the **File** menu also has **Insert Mermaid diagram…** and **Import Mermaid diagram…**. An import reads a `.mmd` file or the first mermaid block of a Markdown file. The editor lays it out itself, as editable shapes, lines and text on named layers. With no image open, it creates one sized to the diagram.
  - **Flowcharts** (`flowchart`, `graph`): node shapes, labelled arrows, nested subgraphs.
  - **State diagrams** (`stateDiagram-v2`): start and end dots, composite states, forks, joins, choices, notes, and transitions back to earlier states routed around the diagram.
  - **Class diagrams** (`classDiagram`): classes with attributes and methods, annotations such as «interface», namespaces, notes, and UML relations (inheritance, realisation, composition, aggregation, association, dependency) with multiplicities.
  - **Sequence diagrams** (`sequenceDiagram`): participants and actors, solid and dashed messages with arrow, open or × ends, self messages, activations, notes, `loop`, `alt`/`else`, `opt`, `par`, `critical`, `break` and `rect` frames, and `autonumber`.
- **Fill:** fills a contiguous area, with adjustable tolerance and opacity.
- **Colour picker:** samples a colour from the image to use for painting or fill.

### Screenshot annotation

- **Numbered markers** that count up automatically.
- **Highlight**, **blur** and **redact** areas, to point out or hide information.
- **Text** that stays editable.

### Selecting, moving and cropping

- **Select and transform:** move, resize and rotate any shape, stroke or text, with handles.
- **Cut and move:** rectangle or freehand (lasso) selection. A cut from an object stays in its layer; a cut from the photo becomes a new layer, and the place it came from turns transparent.
- **Crop** the image.
- **Zoom** from 10% to 800%, fit to window, and actual pixels.

### Layers and objects

- Every shape, stroke and text is a separate, editable object on a layer.
- Add, rename, duplicate, reorder (drag and drop), hide, lock, **merge down** and **flatten** layers.
- Per-layer **opacity** and **16 blend modes**: normal, multiply, screen, overlay, darken, lighten, colour dodge, colour burn, hard light, soft light, difference, exclusion, hue, saturation, colour and luminosity.
- Undo and redo across the image and all its layers.

### Adjustments, effects and transforms

- **Adjust:** brightness, contrast and saturation, applied to the whole image or only to a selection.
- **Effects:** monochrome, sepia, invert and sharpen, with intensity, preview and apply.
- **Transform:** rotate 90° left or right, flip horizontally or vertically, and resize.

### Files

- **Open…** PNG, JPEG and WebP images and `.limg` projects from one file picker, by drag and drop, or by pasting an image from the clipboard. In Chrome, Save writes back into the file you opened.
- **New image** with presets (HD, Full HD, 4K, app icon, social media sizes, A4 at 300 DPI…), aspect ratios (including the golden ratio), resolution in PPI, and a transparent or coloured background.
- **Save** writes back to the open file. **Save As…** chooses the file, and its name decides the format: a **`.limg` project**, which keeps layers, objects, cut-outs and undo history editable, or a PNG, JPEG or WebP image. You're asked before layers are flattened into an image. Every edition saves the same way; only the dialog that picks the file differs (the browser's or VS Code's).
- **Export…** saves an image copy without flattening the open project or changing its file.
- **Copy** the image to the clipboard as PNG.
- **Session recovery:** after an accidental reload, the browser editions restore your work.

### Workspace

- Draggable, collapsible toolbars, with their layout remembered.
- Rulers in pixels, millimetres, centimetres or inches.
- Distraction-free **focus mode** for the canvas.
- **Automatic, light, dark and high-contrast** themes.

### QA reporting

A dedicated panel turns an annotated screenshot into an issue report. You fill in a title, ticket URL, steps to reproduce, and expected and actual behaviour. You can then copy the **report as Markdown** and the **annotated screenshot**, ready to paste into a bug tracker.

### Sprite sheets

Builds a sprite sheet from several images, with configurable columns and padding.

### Chrome extension extras

- Right-click an image on a page and choose **Edit in Little Image Editor**. The editor receives the image as it is shown on the page.
- Right-click a page and choose **Capture visible area** or **Capture selected region**, or press `Alt+Shift+E` (`Control+Shift+E` on macOS) to select a region. You can change these keys at `chrome://extensions/shortcuts`.

The extension never asks for permission to download files from arbitrary websites.

### VS Code extension extras

- Opens PNG, JPEG and WebP files (**Open With… → Little Image Editor**), and `.limg` projects directly.
- **New Image – Little Image Editor** in the Command Palette, or on a folder in the Explorer.
- A compact layout for editor tabs: tools on the left, the active tool's settings in the top bar, zoom in the status bar, and panels that open from icons on the right and hide again, so the image gets the most room.
- Uses VS Code's own menus, Save (`Ctrl/Cmd+S`), Save As and unsaved-changes marker.

See the [VS Code extension guide](vscode-extension/README.md) for details.

## Keyboard shortcuts

| Tool | Key | Tool | Key |
|---|---|---|---|
| Pencil | `P` | Numbered marker | `N` |
| Brush | `B` | Highlight area | `G` |
| Marker | `M` | Text | `T` |
| Highlighter | `H` | Blur area | `U` |
| Calligraphy ink | `A` | Redact area | `X` |
| Spray paint | `S` | Select and transform | `V` |
| Eraser | `E` | Colour picker | `I` |
| Line | `L` | Crop | `C` |
| Rectangle | `R` | Zoom (`Alt/Option`-click zooms out) | `Z` |
| Ellipse | `O` | Fill | `F` |
| Elbow arrow | `K` | | |

| Action | Shortcut |
|---|---|
| New image / Open | `Ctrl/Cmd+N` / `Ctrl/Cmd+O` |
| File menu | `Ctrl/Cmd+F` |
| Save / Save As | `Ctrl/Cmd+S` / `Shift+Ctrl/Cmd+S` |
| Copy image | `Ctrl/Cmd+C` (outside text fields) |
| Undo / Redo | `Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z` |
| Zoom in / out | `Ctrl/Cmd++` / `Ctrl/Cmd+-` |
| Fit to window / Actual pixels | `Ctrl/Cmd+0` / `Ctrl/Cmd+1` |
| Delete the selected object | `Delete` or `Backspace` |
| Focus mode on / off | `Tab` |

In VS Code, the file shortcuts are VS Code's own.

## Install and run

All editions are built from this repository with Node.js:

```bash
npm install
```

### Web app

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. Changes to TypeScript, HTML and CSS are rebuilt automatically; refresh the page to see them. Set `LITTLE_EDITOR_PORT` to use another port.

### Chrome extension

```bash
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the `dist` folder.

### VS Code extension

```bash
npm run package:vscode
```

This creates `vscode-extension/little-image-editor-<version>.vsix`. Install it with **Extensions: Install from VSIX…** in the Command Palette.

## AI assistants (VS Code)

The VS Code extension includes an MCP server that lets **Claude Code** or **Codex** look at the open images and draw in them. Everything they draw is a normal, editable object on a layer, and you can undo it.

### Connecting

Open the Command Palette (**Cmd+Shift+P** on macOS, **Ctrl+Shift+P** on Windows and Linux) and run **Connect to Claude Code – Little Image Editor** or **Connect to Codex – Little Image Editor**, once per project. The extension writes the connection into `.mcp.json` (Claude Code) or `.codex/config.toml` (Codex). Codex first asks you to allow the project. **Disconnect** removes the connection again.

To check the connection, type `/mcp` in Claude Code, or open **MCP servers** from the gear menu in the Codex panel. Ask for results *in Little Image Editor* or *as an image*, so the assistant uses the editor instead of answering in the chat.

### What assistants can do

| Tool | Purpose |
|---|---|
| `list_images`, `view_image` | See which images are open, and look at one as you see it. |
| `describe_image` | List an image's layers and objects, with short ids. |
| `draw` | Draw a whole picture in **one call and one undo step**, from a compact drawing script and/or a **Mermaid** flowchart, state, class or sequence diagram. |
| `create_image` | Open a new, unsaved image. |
| `add_layer`, `add_shape`, `add_line`, `add_text`, `remove_item`, `undo` | Small single changes. |
| `export_image` | Save a full-size PNG into the workspace, e.g. `src/assets/icon.png`. |

**Diagrams:** for a request like *"Read this project and draw its architecture as a diagram"*, the assistant writes Mermaid: a flowchart, state, class or sequence diagram. The editor lays it out itself: boxes sized to their text, nested groups, labelled right-angled arrows, and connections routed around boxes. The result is editable layers, such as Groups, Connections and Nodes, or Frames, Lifelines, Messages, Notes and Participants for a sequence diagram.

The diagram and drawing logic is part of the shared editor (`src/app/features/diagrams`, `src/app/features/assistant`), not of the VS Code extension. The web app and Chrome extension use the same code for the Mermaid items in the File menu.

### Security

- The server listens only on `127.0.0.1`, so other computers can't reach it.
- It answers only requests that carry a secret key, and it refuses requests made by web pages.
- The key is stored in VS Code's secret storage and in the connection file. **Keep `.mcp.json` and `.codex/config.toml` out of version control**; this repository already ignores them.
- The assistant can't save or change your files. You save images yourself, and `export_image` writes only inside the workspace and never replaces a file unless asked to.

## Development

### Project structure

```
src/
  app/                 The shared editor, used by every edition
    core/              Document, layers, history, geometry
    features/          Drawing, annotations, layers, effects, files, projects,
                       selection, workspace, capture, assistant, diagrams
    platform/          EditorPlatform: files, clipboard, dialogs and storage per edition
  shells/vscode/       The VS Code extension: extension host, webview, MCP server
  editor.ts            Starts the editor
vscode-extension/      The VS Code extension package
tests/                 End-to-end (Playwright) and integration tests
```

The editor talks to its surroundings only through the `EditorPlatform` interface. The browser and Chrome use one implementation, and the VS Code webview uses another. New features belong in `src/app`, so all editions get them.

### Scripts

| Script | Does |
|---|---|
| `npm run dev` | Web app with automatic rebuilds |
| `npm run build` | Typecheck and build the web app and Chrome extension into `dist/` |
| `npm run build:vscode` | Build the VS Code extension |
| `npm run package:vscode` | Build and package the VS Code `.vsix` |
| `npm run typecheck` | Strict TypeScript checks for the editor, and for the Node code of the VS Code extension |
| `npm run lint` | Biome lint, including the rule against magic numbers |
| `npm run check` | Lint, typecheck and build |

### Dependencies

The editor itself has no runtime dependencies. The VS Code extension bundles the official MCP SDK (`@modelcontextprotocol/sdk`) and `zod` for its assistant server. Everything else is a development tool (TypeScript, esbuild, Biome, Vitest, Playwright).

## Tests and quality gates

```bash
npm test                  # unit and integration tests, with coverage
npm run test:unit
npm run test:integration
npm run test:e2e          # Playwright (Chromium), including the VS Code webview
npm run test:contracts    # immutable test contracts
npm run test:all          # contracts, coverage and end-to-end
```

- **Coverage:** the build fails below **98% of lines**, 90% of statements and functions, and 80% of branches. Key controllers must also reach 98% each.
- **Lint:** production TypeScript may not contain magic numbers; values get meaningful names.
- **Pull requests** run the same checks in GitHub Actions: test contracts, lint, strict typechecking, the production build, coverage, and Chromium end-to-end tests.

### Immutable test contracts

Passing tests describe product behaviour and don't change casually. `npm run test:contracts` checks every registered test against its SHA-256 hash in `.github/test-contracts.json`. It fails when a protected test is edited, renamed or deleted, or when a new test file isn't registered.

- **New behaviour:** add a new `*.test.ts` or `*.spec.ts` file and register its hash.
- **A failing test:** fix the product, not the test.
- **An incorrect test:** it may only be corrected with the owner's explicit approval, updating the test and its hash together in a reviewed change.

See [TESTING_POLICY.md](TESTING_POLICY.md) for the full policy.

## License

MIT
