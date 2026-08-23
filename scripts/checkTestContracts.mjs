import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifestPath = ".github/test-contracts.json";
const protectedInfrastructure = new Set([manifestPath, "scripts/checkTestContracts.mjs", ".github/workflows/quality.yml"]);
const contracts = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

for (const [file, expectedHash] of Object.entries(contracts)) {
  if (!existsSync(file)) { failures.push(`${file}: baseline test was deleted or renamed`); continue; }
  const actualHash = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actualHash !== expectedHash) failures.push(`${file}: existing passing test was modified`);
}

const base = process.env.TEST_CONTRACT_BASE;
if (base && !/^0+$/.test(base)) {
  const changes = execFileSync("git", ["diff", "--name-status", "--find-renames", base, "HEAD"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const change of changes) {
    const [status, ...paths] = change.split("\t");
    for (const file of paths) {
      const isTest = /(?:^|\/)(?:[^/]+\.test\.ts|[^/]+\.spec\.ts)$/.test(file);
      if ((isTest || protectedInfrastructure.has(file)) && !status.startsWith("A")) failures.push(`${file}: ${status} changes to existing test contracts are forbidden; add a new test file instead`);
    }
  }
}

if (failures.length) {
  console.error("Test contract guard failed:\n" + failures.map(failure => `- ${failure}`).join("\n"));
  console.error("Diagnose the product regression. Do not rewrite an existing passing test. Add a separate regression test file for new behavior.");
  process.exit(1);
}

console.log(`Test contract guard passed: ${Object.keys(contracts).length} baseline test files are unchanged.`);
