# Little Image Editor

A layered image editor inside VS Code. Open a PNG, JPEG or WebP, annotate a screenshot, or draw an icon without leaving your project, and let an AI assistant draw with you.

## Features

- **Drawing:** brushes, shapes, arrows, bent elbow arrows, text and numbered markers.
- **Diagrams:** click **Insert Mermaid diagram** in the toolbar, then paste a Mermaid flowchart, state, class or sequence diagram, or import it from a `.mmd` or Markdown file. You get editable shapes and arrows.
- **Layers:** every shape, stroke and text stays a movable, editable object, with undo and redo.
- **Screenshot annotation:** highlights, blur and redaction.
- **Image tools:** cut and move selections, resize, rotate, flip, brightness, contrast, saturation and effects.
- **Formats:** open and save PNG, JPEG and WebP. Save as `.limg` to keep layers editable, and export an image copy at any time.
- **AI assistants:** Claude Code and Codex can look at your images, draw on layers, draw diagrams and export PNG files.

## Getting started

Little Image Editor's commands are in VS Code's **Command Palette**. Open it with **Cmd+Shift+P** on macOS, or **Ctrl+Shift+P** on Windows and Linux, then type part of a command's name, such as `Little Image Editor`.

- **Open an image:** right-click a PNG, JPEG or WebP file in the Explorer and choose **Open With… → Little Image Editor**. `.limg` projects open in the editor directly.
- **Create an image:** run **New Image – Little Image Editor** from the Command Palette, or right-click a folder in the Explorer and choose **New Image – Little Image Editor**.
- **Save:** **Cmd+S** on macOS, **Ctrl+S** on Windows and Linux. Use **Export…** in the toolbar to save an image copy while keeping your layers.

The editor uses VS Code's own menus and shortcuts, and gives the image as much room as possible: tools sit on the left, tool settings in the top bar, and the layers and other panels open from the icons on the right.

## Draw with an AI assistant

Little Image Editor includes an MCP server that lets Claude Code or Codex see the open images, create new ones, draw on named layers, draw diagrams and export PNG files. Everything the assistant draws is a normal editable object that you can move, change or undo.

### Connect to coding agents

Connect **once per project**: the connection belongs to the project open in that VS Code window, so a different project needs its own.

**Claude Code**

1. Open the Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**) and run **Connect to Claude Code – Little Image Editor**.
2. Start a new Claude Code conversation. If Claude Code asks whether to use the project's MCP servers, approve `little-image-editor`.
3. To check, type **`/mcp`** in the Claude Code chat: `little-image-editor` should be listed as connected. If it shows an error, choose **Reconnect** there.

**Codex**

1. Open the Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**) and run **Connect to Codex – Little Image Editor**.
2. If Codex asks for permission, choose **Allow for This Project**.
3. Run **Developer: Reload Window** from the Command Palette, then start a new Codex chat.
4. To check, open the gear menu in the Codex panel and choose **MCP servers**: `little-image-editor` should be listed and enabled.

To switch a connection off, run **Disconnect from Claude Code – Little Image Editor** or **Disconnect from Codex – Little Image Editor**.

After updating the extension, run **Developer: Restart Extension Host** (or reload the window), then reconnect in `/mcp` or start a new chat, so the assistant loads the new tools.

### Ask

Say that you want the result **in Little Image Editor** or **as an image**. Otherwise an assistant may answer in its own way, for example with a diagram in the chat or in a Markdown file.

> In Little Image Editor, create a 512 × 512 icon for this project on a transparent background, with each part on a named layer, and export it to `assets/icon.png`.

> On the open screenshot, put a red box around the error message and an arrow pointing to it, on a new layer.

> Read this project and draw its architecture as a diagram in Little Image Editor.

The assistant writes diagrams in Mermaid (flowcharts, state, class and sequence diagrams), and the editor lays them out into shapes, groups and arrows that you can still edit. A bent arrow is one object, so it moves as a whole.

### Security

The server only accepts connections from your own computer, and only with the access key that the connect command writes into `.mcp.json` (Claude Code) or `.codex/config.toml` (Codex). Keep those files out of version control. The assistant cannot save or change your files: you save the images, and `export_image` writes only inside the workspace.

## Feedback

Report problems and ideas on [GitHub](https://github.com/janosvajda/little-image-editor/issues).
