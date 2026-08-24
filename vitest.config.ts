import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/app/**/*.ts'],
			exclude: ['src/app/models/appTypes.ts'],
			reporter: ['text', 'html', 'lcov'],
			thresholds: {
				statements: 90,
				branches: 80,
				functions: 90,
				lines: 98,
				'src/app/features/workspace/workspaceController.ts': { lines: 98, perFile: true },
				'src/app/features/drawing/drawingController.ts': { lines: 98, perFile: true },
				'src/app/features/files/fileController.ts': { lines: 98, perFile: true },
				'src/app/features/annotations/annotationController.ts': { lines: 98, perFile: true },
			},
		},
	},
});
