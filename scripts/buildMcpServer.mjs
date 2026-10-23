import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

/** Builds the MCP server that developers run themselves (docs/mcp-server.md); the extension does not ship it. */
const outputDirectory = join("build", "mcp");
const extensionManifest = join("vscode-extension", "package.json");
const { version } = JSON.parse(await readFile(extensionManifest, "utf8"));

await build({
  entryPoints: ["src/shells/vscode/assistant/mcpServerMain.ts"],
  outfile: join(outputDirectory, "little-image-editor-mcp.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  define: { LITTLE_IMAGE_EDITOR_VERSION: JSON.stringify(version) },
  // Bundled CommonJS dependencies may still call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
