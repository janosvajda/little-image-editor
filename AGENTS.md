# Repository instructions

## Protected test policy

Existing tracked `*.test.ts` and `*.spec.ts` files are protected.

Before modifying, renaming, deleting, or updating the stored hash of any protected test, the agent MUST:

1. Stop before making the change.
2. Name every affected file.
3. Explain why the requested product behavior conflicts with each test.
4. Describe the exact proposed test change.
5. Ask for explicit user approval.
6. Wait for approval in the current conversation.

Approval applies only to the specifically named files and changes.

The agent MUST NOT:

- Infer approval from a general feature request.
- Modify a protected test and report it afterward.
- Update its hash before approval.
- Introduce a label, environment variable, workflow exception, or other bypass.
- Weaken, skip, delete, or replace a failing test to make CI pass.

New test files may be added without approval. If a protected test fails, diagnose the application code first.
