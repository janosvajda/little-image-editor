# Little Image Editor

A layered image editor inside VS Code. Open a PNG, JPEG or WebP, annotate a screenshot, or draw an icon without leaving your project, and let an AI assistant draw with you.

## Features

- **Drawing:** brushes, shapes, arrows, bent elbow arrows, vector paths with the Pen tool (with point editing), linear and radial gradient fills, placed pictures (**Place image** in the toolbar), text and numbered markers.
- **Diagrams:** click **Insert Mermaid diagram** in the toolbar, then paste a Mermaid flowchart, state, class or sequence diagram, or import it from a `.mmd` or Markdown file. You get editable shapes and arrows.
- **Layers:** every shape, stroke and text stays a movable, editable object, with undo and redo.
- **Screenshot annotation:** highlights, blur and redaction.
- **Image tools:** cut and move selections, resize, rotate, flip, brightness, contrast, saturation and effects.
- **Vector tools:** Pen and Polyline paths, gradient and pattern fills, blur and drop-shadow effects, and clipping with a shape. They are saved in the SVG as standard SVG.
- **Formats:** SVG is the document format: an SVG opens as editable layers and items, and Save keeps everything editable in it. Open PNG, JPEG and WebP images too, and export a PNG, JPEG, WebP or SVG copy at any time.
- **AI assistants:** with an MCP server you run yourself, Claude Code and Codex can look at your images, draw on layers, draw diagrams and export PNG or SVG files.

## Getting started

Little Image Editor's commands are in VS Code's **Command Palette**. Open it with **Cmd+Shift+P** on macOS, or **Ctrl+Shift+P** on Windows and Linux, then type part of a command's name, such as `Little Image Editor`.

- **Open an image:** right-click a PNG, JPEG, WebP or SVG file in the Explorer and choose **Open With… → Little Image Editor**.
- **Create an image:** run **New Image – Little Image Editor** from the Command Palette, or right-click a folder in the Explorer and choose **New Image – Little Image Editor**.
- **Save:** **Cmd+S** on macOS, **Ctrl+S** on Windows and Linux. Use **Export…** in the toolbar to save a copy while keeping your layers: choose the format, size, JPEG/WebP quality, transparency or background colour, and see the estimated file size.

The editor uses VS Code's own menus and shortcuts, and gives the image as much room as possible: tools sit on the left, tool settings in the top bar, and the layers and other panels open from the icons on the right.

## Draw with an AI assistant

The extension does not include an MCP server. Developers who want Claude Code, Codex or another MCP client to see the open images, create new ones, draw on named layers, draw diagrams and export PNG or SVG files can run the MCP server from the [Little Image Editor repository](https://github.com/janosvajda/little-image-editor). The extension processes its requests. Everything the assistant draws is a normal editable object that you can move, change or undo.

### Set up

1. Turn on the **Little Image Editor › Assistant Bridge: Enabled** setting (`littleImageEditor.assistantBridge.enabled`) for the project. It is off by default.
2. Build and register the MCP server as described in the repository's [MCP server guide](https://github.com/janosvajda/little-image-editor/blob/main/docs/mcp-server.md).
3. To check, type **`/mcp`** in Claude Code, or open **MCP servers** from the gear menu in the Codex panel: `little-image-editor` should be listed as connected.

### Ask

Say that you want the result **in Little Image Editor** or **as an image**. Otherwise an assistant may answer in its own way, for example with a diagram in the chat or in a Markdown file.

> In Little Image Editor, create a 512 × 512 icon for this project on a transparent background, with each part on a named layer, and export it to `assets/icon.png`.

> On the open screenshot, put a red box around the error message and an arrow pointing to it, on a new layer.

> Read this project and draw its architecture as a diagram in Little Image Editor.

The assistant writes diagrams in Mermaid (flowcharts, state, class and sequence diagrams), and the editor lays them out into shapes, groups and arrows that you can still edit. A bent arrow is one object, so it moves as a whole.

### Security

The bridge is off until you turn it on. It only accepts requests from your own computer, and only with an access key kept in VS Code's secret storage and in a file under `~/.little-image-editor/` that only your user can read. The assistant cannot save or change your files: you save the images, and `export_image` writes only inside the workspace.

## Feedback

Report problems and ideas on [GitHub](https://github.com/janosvajda/little-image-editor/issues).
