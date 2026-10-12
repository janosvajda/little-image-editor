import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Keep committed standalone SVGs in sync with the original, strongly typed UI artwork.
// Normal builds copy these assets; this command is only needed after artwork edits.
const result = await build({
  entryPoints: ['src/app/shared/style/editorArtwork.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { originalCursorSvg } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const cursors = await build({
  entryPoints: ['src/app/shared/style/editorCursors.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { EditorCursorId } = await import(`data:text/javascript;base64,${Buffer.from(cursors.outputFiles[0].contents).toString('base64')}`);
for (const id of Object.values(EditorCursorId))
  await writeFile(`src/assets/cursors/${id}.svg`, `${originalCursorSvg(id)}\n`);
console.log(`Generated ${Object.keys(EditorCursorId).length} original cursor assets.`);
