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
7. MUST create senior level high quality code
8. Use types, strong types instead or hard-coding things
9. Every new item, object, tool that affects the image must be compatible with layer system and the .limg file format

Approval applies only to the specifically named files and changes.

The agent MUST NOT:

- Infer approval from a general feature request.
- Modify a protected test and report it afterward.
- Update its hash before approval.
- Introduce a label, environment variable, workflow exception, or other bypass.
- Weaken, skip, delete, or replace a failing test to make CI pass.
- Duplicate the code
- Adding new feature wchis is not use the existing generic classes, functions that already exist
- Causing mess with adding quick, non abstarcted, non solution
- Using hard coded string values if that can be added to Enum or any generic type
- Use ANY type if something CAN BE strongly typed
- Use magic numbers, magic values

New test files may be added without approval. If a protected test fails, diagnose the application code first.
