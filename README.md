# Little Image Editor

A small, private Chrome image editor written in TypeScript. All image processing happens locally using the Canvas API; there are no runtime dependencies, analytics, or network permissions.

## Features

- Brush, eraser, lines, rectangles, ellipses, color picker, and crop
- Brightness, contrast, saturation, grayscale, sepia, invert, and sharpen
- Rotate, flip, resize, undo, and redo
- PNG, JPEG, and WebP export
- Sprite-sheet builder with configurable columns and padding
- Drag/drop and clipboard paste
- Draggable, collapsible panels with layouts saved in local storage
- Distraction-free fullscreen canvas mode
- Automatic, light, dark, and high-contrast color themes

## Build and install

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `dist` folder.

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
npm run test:all
```

`npm test` runs unit and integration tests with coverage. The build fails below 95% line coverage; statement, function, and branch safety floors are also enforced. End-to-end tests use Playwright Chromium against the local development server.

## License

MIT
