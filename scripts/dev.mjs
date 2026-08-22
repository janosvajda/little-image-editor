import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { cp, readFile, stat, watch } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const devPort = Number(process.env.LITTLE_EDITOR_PORT ?? 5173);
const host = "127.0.0.1";
const assets = new Set(["editor.html", "editor.css"]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const initialBuild = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--pretty"], { stdio: "inherit" });
if (initialBuild.status !== 0) process.exit(initialBuild.status ?? 1);
await Promise.all([...assets].map(file => cp(join("src", file), join("dist", file))));

const compiler = spawn(process.execPath, ["node_modules/typescript/bin/tsc", "--watch", "--preserveWatchOutput"], { stdio: "inherit" });
const assetWatcher = watch("src");
void (async () => {
  for await (const event of assetWatcher) {
    if (event.filename && assets.has(event.filename)) {
      await cp(join("src", event.filename), join("dist", event.filename));
      console.log(`[dev] updated ${event.filename}`);
    }
  }
})();

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
    const requested = pathname === "/" ? "editor.html" : pathname.slice(1);
    const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = join("dist", safePath);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(devPort, host, () => {
  console.log(`\nLittle Image Editor: http://${host}:${devPort}`);
  console.log("Press Ctrl+C to stop.\n");
});

function shutdown() {
  compiler.kill();
  void assetWatcher.return();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
