# Running the MCP server

The VS Code extension does not include an MCP server. If you want Claude Code, Codex or another MCP client to see and draw in the images open in VS Code, you build and run the server from this repository yourself. The extension only processes the requests the server sends it.

```
MCP client ──MCP (stdio or HTTP)──▶ little-image-editor-mcp ──bridge (JSON over HTTP, 127.0.0.1)──▶ VS Code extension ──▶ open editors
```

- **The MCP server** (`src/shells/vscode/assistant/mcpServerMain.ts`) defines the tools: `list_images`, `view_image`, `create_image`, `describe_image`, `draw`, `add_*`, `remove_item`, `undo`, `place_image` and `export_image`.
- **The assistant bridge** (`src/shells/vscode/extension/assistantBridge.ts`) runs inside the extension and is off by default. Its requests are typed in `src/shells/vscode/assistant/bridgeProtocol.ts`. It hands each request to the open editors, which run it through the same layer model and SVG document format as the editor's own tools. Each command is one undo step.

## 1. Turn on the bridge in VS Code

Open the project folder in VS Code and turn on **Little Image Editor › Assistant Bridge: Enabled** (`littleImageEditor.assistantBridge.enabled`) in the settings. You can set it for the workspace only.

While the setting is on, the extension serves the window's first folder and writes a discovery file. The file holds the bridge's address and a private token:

```
~/.little-image-editor/bridges/<folder key>.json      (mode 600)
```

The token is kept in VS Code's secret storage and never goes into the project. The **Little Image Editor** output channel shows the address the bridge listens on. Turning the setting off stops the bridge and removes the file.

## 2. Build the server

```sh
npm install
npm run build:mcp
```

This writes `build/mcp/little-image-editor-mcp.mjs`, a single file that needs only Node 18 or later.

## 3. Register it with your assistant

The server finds the bridge through `--workspace`, which defaults to the folder it starts in. Use the same folder you opened in VS Code. Below, `<repo>` is where you cloned this repository.

**Claude Code** (stdio), from your project folder:

```sh
claude mcp add little-image-editor -- node <repo>/build/mcp/little-image-editor-mcp.mjs
```

or in the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "little-image-editor": {
      "command": "node",
      "args": ["<repo>/build/mcp/little-image-editor-mcp.mjs", "--workspace", "/path/to/project"]
    }
  }
}
```

**Codex** (stdio), in `.codex/config.toml` or `~/.codex/config.toml`:

```toml
[mcp_servers.little-image-editor]
command = "node"
args = ["<repo>/build/mcp/little-image-editor-mcp.mjs", "--workspace", "/path/to/project"]
```

**Clients that connect by address** (Streamable HTTP):

```sh
node <repo>/build/mcp/little-image-editor-mcp.mjs --workspace /path/to/project --transport http --port 47900
```

The server prints its URL and a bearer token to stderr. Pass `--token` to choose the token yourself. Then register the URL with the header `Authorization: Bearer <token>`.

| Option | Default | Meaning |
|---|---|---|
| `--workspace <folder>` | current folder | The project folder open in VS Code |
| `--transport stdio\|http` | `stdio` | How the MCP client connects |
| `--port <port>` | a free port | HTTP only |
| `--token <token>` | random | HTTP only |

## 4. Check it

In Claude Code, `/mcp` should list `little-image-editor` as connected. In Codex, choose **MCP servers** from the gear menu. Then ask, for example, *"Draw a red apple in Little Image Editor"*.

If a tool replies that Little Image Editor is not serving the folder, either the bridge setting is off or VS Code has a different folder open. The server looks up the bridge on every call, so you don't need to restart it after VS Code restarts.

## Security

- The bridge listens on `127.0.0.1` only. It accepts only JSON `POST` requests that carry its token and name the loopback address as their `Host`, so web pages can't reach it, not even through DNS rebinding.
- The discovery file is readable only by your user. Anything that runs as your user can read it and use the bridge while it is on, so leave the setting off when you don't need it.
- The assistant can't save or change your files. `export_image` writes only inside the workspace and never replaces a file unless asked to, and `place_image` reads only from the workspace.

## Adding a tool

Tools that change the image are `AssistantCommand`s (`src/app/features/assistant/assistantCommandTypes.ts`), carried out by `assistantCommandRunner.ts` on the layer model. They must save in the SVG document format through `SVG_ITEM_CODECS`. To expose a new command:

1. Add the command kind and its runner case in `src/app/features/assistant`.
2. Register the MCP tool next to the others (`editingTools.ts`, `placeTools.ts`, `exportTools.ts`). It reaches the editor through `OpenImages`, which the bridge client implements.
3. Only an operation that is not an `AssistantCommand` needs a new `BridgeOperation` in `bridgeProtocol.ts`, with matching cases in `bridgeServer.ts` and `bridgeClient.ts`.
