import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { build } from "esbuild";

/** Builds the VS Code extension from the web build in dist/, which must exist. */
const webBuild = "dist";
const extensionDirectory = "vscode-extension";
const webviewDirectory = join(extensionDirectory, "webview");
const pageAssets = new Set([".html", ".css"]);
const sharedOptions = { bundle: true, minify: true, sourcemap: false, legalComments: "none", logLevel: "info" };

await rm(join(extensionDirectory, "dist"), { recursive: true, force: true });
await rm(webviewDirectory, { recursive: true, force: true });
await mkdir(webviewDirectory, { recursive: true });

for (const entry of await readdir(webBuild, { withFileTypes: true }))
  if (entry.isFile() && pageAssets.has(extname(entry.name))) await cp(join(webBuild, entry.name), join(webviewDirectory, entry.name));
await cp(join(webBuild, "assets"), join(webviewDirectory, "assets"), { recursive: true });
await cp("LICENSE", join(extensionDirectory, "LICENSE"));

await build({
  ...sharedOptions,
  entryPoints: ["src/shells/vscode/extension/extension.ts"],
  outfile: join(extensionDirectory, "dist", "extension.js"),
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
});
await build({
  ...sharedOptions,
  entryPoints: ["src/shells/vscode/webview/vscodeEditor.ts"],
  outfile: join(webviewDirectory, "vscodeEditor.js"),
  platform: "browser",
  format: "esm",
  target: "chrome120",
});
