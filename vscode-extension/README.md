# Little Image Editor

Edit images and layered `.limg` projects without leaving VS Code.

- **`.limg` projects** open in the editor directly.
- **PNG, JPEG and WebP images**: right-click the file, choose **Open With…**, then **Little Image Editor**.
- **New images**: run **New Image – Little Image Editor** from the Command Palette, or right-click a folder in the Explorer and choose it there. Pick the size and background; the first save asks where to write it, and the file name's extension (`.png`, `.jpg`, `.webp` or `.limg`) decides the format.
- Draw, add shapes, numbered markers, highlights, text, blur and redaction, and organise everything in layers.
- **Ctrl+S / Cmd+S** saves back into the same file. Saving a layered image as PNG, JPEG or WebP asks before flattening its layers; save as `.limg` to keep them editable.

## Let Claude Code see and draw in your images

Little Image Editor can let an AI assistant such as Claude Code look at the images you have open and draw in them: "what's wrong with this screenshot?", "create a new image with two circles on one layer and an apple on another".

1. Run **Connect to Claude Code – Little Image Editor** from the Command Palette. This starts a small server that only this computer can reach and adds it to the workspace's `.mcp.json`.
2. Start a new Claude Code session in the workspace and approve the `little-image-editor` server when asked.

The assistant can then:

- **look** at the open images, with every layer and object as you see it;
- **create** a new image and **draw** on it: add layers, shapes (rectangles, ellipses and circles, triangles, diamonds, stars…), lines, arrows and text, and remove items;
- **undo**, as Cmd/Ctrl+Z does.

Everything it draws is a normal, editable item in the layers panel: move, recolour or delete it, or undo it. It never saves or changes files itself; you save with Cmd/Ctrl+S.

- It is off until you connect it. **Disconnect from Claude Code – Little Image Editor** switches it off again and removes it from `.mcp.json`.
- Every request needs a secret key kept in VS Code's secret storage. Connecting writes it into `.mcp.json` with this computer's address for the server, so **keep `.mcp.json` out of version control** (add it to `.gitignore`).
- The connection belongs to the project: each project window has its own server and port, so Claude Code sees the images of the project it works in. Connect each project you want to use it in.
