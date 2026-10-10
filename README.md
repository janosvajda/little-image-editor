# Little Image Editor

A small, private Chrome image editor written in TypeScript. All image processing happens locally using the Canvas API; there are no runtime dependencies, analytics, or network permissions.

## Features

- Brush, eraser, lines, rectangles, ellipses, color picker, and crop
- Brightness, contrast, saturation, grayscale, sepia, invert, and sharpen
- Rotate, flip, resize, undo, and redo
- PNG, JPEG, and WebP export
- Editable layers and `.limg` projects that preserve cut-outs and undo history
- Rectangle and lasso Cut and Move: object cuts stay in their layer, photo cuts create a new layer, and source pixels become transparent
- Sprite-sheet builder with configurable columns and padding
- Drag/drop and clipboard paste
- Right-click a webpage image to open its visible rendering in the editor
- Capture the visible page or select a region directly from the browser
- Copy the edited canvas back to the clipboard as PNG
- Draggable, collapsible panels with layouts saved in local storage
- Distraction-free fullscreen canvas mode
- Automatic, light, dark, and high-contrast color themes

## Build and install

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `dist` folder.

### Browser capture workflow

- Right-click an image and choose **Edit in Little Image Editor**.
- Right-click a page and choose **Capture visible area** or **Capture selected region**.
- Press `Alt+Shift+E` (`Control+Shift+E` on macOS) to select a region. Chrome shortcuts can be changed at `chrome://extensions/shortcuts`.
- In the editor, use the copy icon, **File → Copy image**, or `Ctrl/Command+C` while focus is outside a form control.

Editing a webpage image captures its currently visible rendering. It intentionally does not request permission to download arbitrary files from every website.

## Local development

```bash
npm run dev
```

Then open `http://127.0.0.1:5173`. TypeScript, HTML, and CSS changes are watched automatically; refresh the browser to see them. Set `LITTLE_EDITOR_PORT` to use another port.

## Tests

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:contracts
npm run test:all
npm run lint
```

`npm test` runs unit and integration tests with coverage. The build fails below 95% line coverage; statement, function, and branch safety floors are also enforced. `npm run lint` rejects magic numbers in production TypeScript, so domain values must have meaningful names. End-to-end tests use Playwright Chromium against the local development server.

### Immutable test contracts

Passing tests are treated as product-behaviour contracts. `npm run test:contracts` verifies every registered test against its SHA-256 hash in `.github/test-contracts.json`. It fails when a protected test is edited, renamed, or deleted, and when a new test file has not been registered.

When implementing new behaviour, add a new `*.test.ts` or `*.spec.ts` file and register its hash in `.github/test-contracts.json`. After that change is merged, the new test is protected too. If an existing test fails, first investigate the application regression and fix the product code; do not weaken or rewrite the test simply to make CI pass. A genuinely incorrect existing contract may only be corrected deliberately, with explicit owner approval, by updating the test and its hash together in a reviewed change. See [TESTING_POLICY.md](TESTING_POLICY.md) for the complete policy.

Pull requests run the same checks in GitHub Actions: immutable test contracts, magic-number linting, strict TypeScript validation, the production extension build, unit and integration coverage, and Chromium E2E tests. Configure all four `Pull Request Quality Gate` jobs as required status checks in the repository branch-protection rules to prevent merging when a check fails.

## License

MIT
