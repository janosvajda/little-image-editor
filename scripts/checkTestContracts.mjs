import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifestPath = ".github/test-contracts.json";
const contracts = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];
const isTestFile = file => /(?:^|\/)[^/]+\.(?:test|spec)\.ts$/.test(file);
const hashFile = file => createHash("sha256").update(readFileSync(file)).digest("hex");

const trackedTests = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter(existsSync)
  .filter(isTestFile);

for (const file of trackedTests) {
  if (!(file in contracts)) failures.push(`${file}: test is not registered in ${manifestPath}`);
}

for (const [file, expectedHash] of Object.entries(contracts)) {
  if (!isTestFile(file)) { failures.push(`${file}: contract entry is not a test file`); continue; }
  if (!existsSync(file)) { failures.push(`${file}: baseline test was deleted or renamed`); continue; }
  const actualHash = hashFile(file);
  if (actualHash !== expectedHash) failures.push(`${file}: existing passing test was modified`);
}

if (failures.length) {
  console.error("Test contract guard failed:\n" + failures.map(failure => `- ${failure}`).join("\n"));
  console.error("Diagnose the product regression. Do not rewrite an existing passing test. Add a separate regression test file for new behavior.");
  process.exit(1);
}

console.log(`Test contract guard passed: ${Object.keys(contracts).length} registered test files are unchanged.`);
