import { cp, mkdir, rm } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await Promise.all([
  cp("manifest.json", "dist/manifest.json"),
  cp("src/editor.html", "dist/editor.html"),
  cp("src/editor.css", "dist/editor.css")
]);
