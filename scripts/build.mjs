import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, sep } from "node:path";
import { build, context } from "esbuild";

const sourceDirectory = "src";
const outputDirectory = "dist";
const manifestPath = "manifest.json";
const entryPoints = ["src/editor.ts", "src/background.ts"];
const serveMode = process.argv.includes("--serve");
const watchMode = serveMode || process.argv.includes("--watch");
const host = "127.0.0.1";
const port = Number(process.env.LITTLE_EDITOR_PORT ?? 5173);
const esbuildOptions = {
  entryPoints, bundle: true, format: "esm", outdir: outputDirectory, platform: "browser",
  target: "chrome120", minify: true, sourcemap: false, legalComments: "none", treeShaking: true, logLevel: "info"
};

await prepareOutput();
if (watchMode) await runWatchMode();
else {
  await build(esbuildOptions);
  await validateOutput();
  await createReleaseArchive();
}

async function prepareOutput() {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await cp(manifestPath, join(outputDirectory, manifestPath));
  await copyStaticDirectory(sourceDirectory);
}

async function copyStaticDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async entry => {
    const sourcePath = join(directory, entry.name);
    if (entry.isDirectory()) return copyStaticDirectory(sourcePath);
    if (!entry.isFile() || extname(entry.name) === ".ts") return;
    const destinationPath = join(outputDirectory, relative(sourceDirectory, sourcePath));
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }));
}

async function runWatchMode() {
  const buildContext = await context(esbuildOptions);
  await buildContext.watch();
  const stopStaticSync = pollStaticAssets();
  const typeChecker = spawn(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--watch", "--preserveWatchOutput"], { stdio: "inherit" });
  const server = serveMode ? startServer() : null;
  const shutdown = () => {
    stopStaticSync();
    typeChecker.kill();
    void buildContext.dispose().then(() => server?.close(() => process.exit(0)) ?? process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`[build] watching production output in ${outputDirectory}`);
}

function pollStaticAssets() {
  let syncing = false;
  let knownFilesPromise = staticFileSnapshot(sourceDirectory);
  let knownManifestPromise = fileSignature(manifestPath);
  const timer = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const knownFiles = await knownFilesPromise;
      const currentFiles = await staticFileSnapshot(sourceDirectory);
      for (const [filename, signature] of currentFiles) {
        if (knownFiles.get(filename) === signature) continue;
        const destinationPath = join(outputDirectory, filename);
        await mkdir(dirname(destinationPath), { recursive: true });
        await cp(join(sourceDirectory, filename), destinationPath);
        console.log(`[build] copied ${filename}`);
      }
      for (const filename of knownFiles.keys()) if (!currentFiles.has(filename)) await rm(join(outputDirectory, filename), { force: true });
      knownFilesPromise = Promise.resolve(currentFiles);
      const knownManifest = await knownManifestPromise;
      const currentManifest = await fileSignature(manifestPath);
      if (currentManifest !== knownManifest) {
        await cp(manifestPath, join(outputDirectory, manifestPath));
        console.log(`[build] copied ${manifestPath}`);
      }
      knownManifestPromise = Promise.resolve(currentManifest);
    } catch (error) {
      console.error("[build] static asset synchronization failed", error);
    } finally { syncing = false; }
  }, 300);
  return () => clearInterval(timer);
}

async function staticFileSnapshot(directory, snapshot = new Map()) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return staticFileSnapshot(path, snapshot);
    if (entry.isFile() && extname(entry.name) !== ".ts") snapshot.set(relative(sourceDirectory, path), await fileSignature(path));
  }));
  return snapshot;
}

async function fileSignature(path) {
  const information = await stat(path);
  return `${information.mtimeMs}:${information.size}`;
}

function startServer() {
  const mimeTypes = {
    ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp"
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
      const requested = pathname === "/" ? "editor.html" : pathname.slice(1);
      const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
      const filePath = join(outputDirectory, safePath);
      if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
      response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  server.listen(port, host, () => console.log(`Little Image Editor: http://${host}:${port}`));
  return server;
}

async function validateOutput() {
  const manifest = JSON.parse(await readFile(join(outputDirectory, manifestPath), "utf8"));
  const required = new Set(["editor.html", manifest.background?.service_worker]);
  Object.values(manifest.icons ?? {}).forEach(path => required.add(path));
  const actionIcon = manifest.action?.default_icon;
  if (typeof actionIcon === "string") required.add(actionIcon);
  else Object.values(actionIcon ?? {}).forEach(path => required.add(path));
  const html = await readFile(join(outputDirectory, "editor.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) required.add(match[1]);
  for (const cssName of [...required].filter(path => path?.endsWith(".css"))) {
    const css = await readFile(join(outputDirectory, cssName), "utf8");
    for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) required.add(join(dirname(cssName), match[1]));
  }
  for (const path of required) {
    if (!path || /^(?:data:|https?:|#)/.test(path)) continue;
    const information = await stat(join(outputDirectory, path)).catch(() => null);
    if (!information?.isFile()) throw new Error(`Production output is missing referenced file: ${path}`);
  }
  const files = await collectFiles(outputDirectory);
  const forbidden = files.find(file => file.name.endsWith(".ts") || file.name.endsWith(".map"));
  if (forbidden) throw new Error(`Production output contains source/development file: ${forbidden.name}`);
  console.log(`[build] validated ${files.length} production files and all referenced assets`);
}

async function createReleaseArchive() {
  const project = JSON.parse(await readFile("package.json", "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (project.version !== manifest.version) throw new Error(`Version mismatch: package.json is ${project.version}, but manifest.json is ${manifest.version}.`);
  const files = await collectFiles(outputDirectory);
  const archivePath = join("release", `${project.name}-v${project.version}.zip`);
  await mkdir("release", { recursive: true });
  await writeFile(archivePath, createZip(files));
  console.log(`[build] created ${archivePath} with ${files.length} production files`);
}

async function collectFiles(root) {
  const collected = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) collected.push({ name: relative(root, path).split(sep).join("/"), content: await readFile(path) });
    }
  }
  await visit(root);
  return collected;
}

function createZip(files) {
  const localRecords = [], centralRecords = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8"), checksum = crc32(file.content), localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(0x0021, 12); localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(file.content.length, 18); localHeader.writeUInt32LE(file.content.length, 22); localHeader.writeUInt16LE(name.length, 26);
    localRecords.push(localHeader, name, file.content);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8); centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16); centralHeader.writeUInt32LE(file.content.length, 20); centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt32LE(offset, 42); centralRecords.push(centralHeader, name);
    offset += localHeader.length + name.length + file.content.length;
  }
  const centralDirectory = Buffer.concat(centralRecords), endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); endRecord.writeUInt16LE(files.length, 8); endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12); endRecord.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralDirectory, endRecord]);
}

function crc32(data) {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
  }
  return (checksum ^ 0xffffffff) >>> 0;
}
