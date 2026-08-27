import { describe, expect, it } from 'vitest';
import { ObjectSpatialIndex } from './objectSpatialIndex';

describe('spatial index movement performance', () => {
	it('retains cell membership while an object moves inside the same grid range', () => {
		const index = new ObjectSpatialIndex();
		index.set('moving-object', { x: 10, y: 10, width: 40, height: 40 });
		const initialCell = index.query({ x: 20, y: 20 });

		for (let offset = 1; offset < 60; offset += 1)
			index.set('moving-object', {
				x: 10 + offset,
				y: 10 + offset,
				width: 40,
				height: 40,
			});

		expect(index.query({ x: 20, y: 20 })).toBe(initialCell);
		expect(initialCell).toContain('moving-object');
	});

	it('updates membership once movement crosses a cell boundary', () => {
		const index = new ObjectSpatialIndex();
		index.set('moving-object', { x: 10, y: 10, width: 20, height: 20 });
		const initialCell = index.query({ x: 20, y: 20 });

		index.set('moving-object', { x: 150, y: 10, width: 20, height: 20 });

		expect(index.query({ x: 20, y: 20 })).not.toBe(initialCell);
		expect(index.query({ x: 20, y: 20 })).not.toContain('moving-object');
		expect(index.query({ x: 160, y: 20 })).toContain('moving-object');
	});
});
