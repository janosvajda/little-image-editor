# Testing contract

Passing tests describe existing product behaviour and are immutable by default.

- When an existing test fails, stop and diagnose why the product no longer satisfies that contract.
- Do not modify, rename, weaken, skip, or delete an existing passing test to accommodate a UI change.
- Add new behaviour in a new `*.test.ts` or `*.spec.ts` file and register its SHA-256 hash in `.github/test-contracts.json`.
- A test contract may be intentionally replaced only with explicit owner approval in a dedicated change. The pull request must carry the `test-contract-change-approved` label.
- `npm run test:contracts` verifies every registered test and rejects unregistered test files.
- Pull requests reject removed or changed baseline contracts. New registered tests are allowed and become immutable after merge.
- `npm run test:all` runs the contract guard, coverage suite, and Chromium E2E suite.

The frozen E2E baseline includes interaction semantics, layout measurements, persistence, image-pixel results, keyboard behaviour, and accessibility identities. A visible element alone is not considered sufficient coverage.
