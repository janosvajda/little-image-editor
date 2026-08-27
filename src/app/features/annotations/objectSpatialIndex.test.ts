import { describe, expect, it } from 'vitest';
import { ObjectSpatialIndex } from './objectSpatialIndex';

const OBJECT_COUNT = 5_000;
const CELL_SIZE = 100;
const OBJECT_SIZE = 10;

describe('ObjectSpatialIndex', () => {
	it('limits hit-test candidates and updates moved object membership', () => {
		const index = new ObjectSpatialIndex(CELL_SIZE);
		for (let object = 0; object < OBJECT_COUNT; object += 1)
			index.set(`object-${object}`, {
				x: object * CELL_SIZE,
				y: object * CELL_SIZE,
				width: OBJECT_SIZE,
				height: OBJECT_SIZE,
			});

		expect(index.size).toBe(OBJECT_COUNT);
		expect([...index.query({ x: 5, y: 5 })]).toEqual(['object-0']);
		expect(index.query({ x: 50, y: 50 }).size).toBe(1);

		index.set('object-0', {
			x: 900,
			y: 900,
			width: OBJECT_SIZE,
			height: OBJECT_SIZE,
		});
		expect(index.query({ x: 5, y: 5 }).size).toBe(0);
		expect(index.query({ x: 905, y: 905 }).has('object-0')).toBe(true);
	});
});
