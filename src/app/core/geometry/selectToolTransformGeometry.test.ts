import { describe, expect, it } from 'vitest';
import { DEFAULT_SHAPE_INTERACTION } from './shapeInteraction';
import {
	hitShapeHandle,
	ROTATION_SNAP_DEGREES,
	rotateGeometryFrom,
	ShapeHandleId,
	ShapeHandleMetrics,
	type TransformableGeometry,
} from './shapeTransformHelpers';

const Frame = { x: 100, y: 100, width: 100, height: 60 } as const;
const Center = { x: 150, y: 130 } as const;
const QUARTER_TURN = 90;
const SMALL_TURN = 7;

function geometry(rotation = 0): TransformableGeometry {
	return { rect: { ...Frame }, rotation };
}

describe('select tool transform geometry', () => {
	it('resizes from corners, rotates just outside the frame, and leaves the inside to moving', () => {
		const shape = geometry();
		expect(hitShapeHandle(shape, { x: 101, y: 99 })).toBe(ShapeHandleId.NorthWest);
		expect(hitShapeHandle(shape, { x: 150, y: 90 })).toBe(ShapeHandleId.Rotate);
		expect(hitShapeHandle(shape, { x: 215, y: 130 })).toBe(ShapeHandleId.Rotate);
		expect(hitShapeHandle(shape, { x: 150, y: 130 })).toBeNull();
		expect(
			hitShapeHandle(shape, { x: 150, y: Frame.y - ShapeHandleMetrics.Offset - 1 }),
		).toBeNull();
	});

	it('follows the rotated frame when deciding where rotation starts', () => {
		const shape = geometry(QUARTER_TURN);
		expect(hitShapeHandle(shape, { x: 150, y: 70 })).toBe(ShapeHandleId.Rotate);
		expect(hitShapeHandle(shape, { x: 150, y: 175 })).toBeNull();
	});

	it('rotates by the pointer turn since the drag began, not to the pointer angle', () => {
		const shape = geometry(SMALL_TURN);
		const origin = { pointer: { x: Center.x + 80, y: Center.y }, rotation: SMALL_TURN };
		rotateGeometryFrom(shape, origin, origin.pointer);
		expect(shape.rotation).toBeCloseTo(SMALL_TURN);
		rotateGeometryFrom(shape, origin, { x: Center.x, y: Center.y + 80 });
		expect(shape.rotation).toBeCloseTo(SMALL_TURN + QUARTER_TURN);
	});

	it('snaps a constrained rotation to fixed steps', () => {
		const shape = geometry();
		const origin = { pointer: { x: Center.x + 80, y: Center.y }, rotation: 0 };
		rotateGeometryFrom(shape, origin, { x: Center.x + 80, y: Center.y + 18 }, true);
		expect(shape.rotation).toBe(ROTATION_SNAP_DEGREES);
		rotateGeometryFrom(shape, origin, { x: Center.x + 80, y: Center.y - 18 }, true);
		expect(shape.rotation).toBe(360 - ROTATION_SNAP_DEGREES);
	});

	it('shows a rotate cursor outside the frame and a move cursor inside it', () => {
		const shape = geometry();
		expect(DEFAULT_SHAPE_INTERACTION.cursor(shape, { x: 150, y: 90 })).toContain(
			'data:image/svg+xml',
		);
		expect(DEFAULT_SHAPE_INTERACTION.cursor(shape, Center)).toBe('move');
		expect(DEFAULT_SHAPE_INTERACTION.cursor(shape, { x: 0, y: 0 })).toBeNull();
	});

	it('routes rotation drags through the policy and keeps absolute rotation available', () => {
		const shape = geometry();
		DEFAULT_SHAPE_INTERACTION.transform(shape, ShapeHandleId.Rotate, { x: Center.x + 50, y: Center.y }, {
			origin: { pointer: { x: Center.x, y: Center.y - 50 }, rotation: 0 },
			constrained: false,
		});
		expect(shape.rotation).toBeCloseTo(QUARTER_TURN);
		const absolute = geometry();
		DEFAULT_SHAPE_INTERACTION.transform(absolute, ShapeHandleId.Rotate, {
			x: Center.x + 50,
			y: Center.y,
		});
		expect(absolute.rotation).toBeCloseTo(QUARTER_TURN);
	});
});
