import { Body, Composite, Engine } from 'matter-js';
import { describe, expect, it, vi } from 'vitest';
import { createCollagePhysics } from './collagePhysics';
import { collageConfig, getSpread, toCanvasPoint, toSpreadPoint, type PreviewPiece } from './collageLayout';

const size = { width: 900, height: 600 };
const spread = getSpread(size);
const dt = collageConfig.physics.tickMs;

function setup(points: { x: number; y: number; rotation?: number }[]) {
  const pieces: PreviewPiece[] = points.map((_, i) => ({
    id: String(i), type: 'text', title: '', caption: '', seed: i,
  }));
  const create = vi.spyOn(Engine, 'create');
  const physics = createCollagePhysics(size, spread, pieces, points.map((point, z) => ({
    id: String(z), ...toSpreadPoint(spread, point), rotation: point.rotation ?? 0, scale: 1, z,
  })));
  const engine = create.mock.results[0].value;
  create.mockRestore();
  const bodies = Composite.allBodies(engine.world).filter((body) => !body.isStatic);
  return { physics, bodies, engine, center: (i: number) => toCanvasPoint(spread, physics.snapshot()[i]) };
}

describe('W1-05 collage physics', () => {
  it('keeps exact idle overlap, selects the top rotated card and drives targets without chaining', () => {
    const { physics, bodies, center } = setup([
      { x: 130, y: 310, rotation: -0.17 },
      { x: 150, y: 300, rotation: 0.2 },
      { x: 325, y: 300 },
      { x: 467, y: 300 },
      { x: 700, y: 500 },
    ]);
    const initial = physics.snapshot();
    for (let i = 0; i < 20; i++) expect(physics.tick(dt)).toBe(false);
    expect(physics.snapshot()).toBe(initial);
    expect(physics.begin({ x: 156, y: 300 }, 0)).toBe('1');
    physics.move({ x: 163, y: 300 }, 10);
    physics.release({ x: 163, y: 300 }, 15);
    expect(physics.snapshot()).toBe(initial);
    expect(physics.begin({ x: 156, y: 300 }, 100)).toBe('1');
    expect(physics.begin({ x: 700, y: 500 }, 105)).toBeNull();
    physics.move({ x: 273, y: 300 }, 120);
    expect(physics.tick(dt)).toBe(true);
    expect(center(1)).toEqual({ x: 267, y: 300 });
    expect(physics.snapshot()[1]).toMatchObject({ z: 5, lift: 1, rotation: 0.2, scale: 1 });
    const { targetMass, driverMass } = collageConfig.physics;
    expect(bodies.map((body) => body.mass)).toEqual([targetMass, driverMass, targetMass, targetMass, targetMass]);
    expect(center(2).x).toBeGreaterThan(325);
    for (let i = 0; i < 40; i++) physics.tick(dt);
    expect(center(3)).toEqual({ x: 467, y: 300 });
    expect(center(4)).toEqual({ x: 700, y: 500 });
    expect(physics.snapshot().filter(({ id }) => id !== '1').map(({ z }) => z)).toEqual([0, 2, 3, 4]);
    const beforeCancel = center(1);
    physics.cancel();
    expect(physics.snapshot()[1].lift).toBe(0);
    expect(physics.tick(dt)).toBe(false);
    expect(center(1)).toEqual(beforeCancel);
    physics.dispose();
  });

  it('caps and damps throws, transfers driver ownership and requires ten consecutive quiet ticks', () => {
    const { physics, bodies: [first, second], engine, center } = setup([{ x: 160, y: 200 }, { x: 240, y: 450 }]);
    physics.begin({ x: 160, y: 200 }, 0);
    physics.move({ x: 250, y: 200 }, 10);
    physics.release({ x: 250, y: 200 }, 12);
    const { targetMass, driverMass, maxThrowSpeed, frictionAir } = collageConfig.physics;
    expect(first.velocity.x).toBeCloseTo(maxThrowSpeed);
    expect(physics.snapshot()[0].lift).toBe(0);
    expect(physics.tick(dt)).toBe(true);
    expect(first.velocity.x).toBeCloseTo(maxThrowSpeed * (1 - frictionAir));
    physics.begin({ x: 240, y: 450 }, 50);
    physics.move({ x: 260, y: 450 }, 60);
    expect([first.mass, second.mass]).toEqual([targetMass, driverMass]);
    physics.tick(dt);
    physics.release({ x: 260, y: 450 }, 140);
    expect(second.speed).toBe(0);
    for (let i = 0; i < 9; i++) physics.tick(dt);
    expect(second.mass).toBe(1);
    Body.setVelocity(second, { x: 0.1, y: 0 });
    physics.tick(dt);
    Body.setVelocity(second, { x: 0, y: 0 });
    for (let i = 0; i < 9; i++) physics.tick(dt);
    expect(second.mass).toBe(driverMass);
    physics.tick(dt);
    expect(second.mass).toBe(targetMass);
    expect(second.speed).toBe(0);
    expect(second.angularVelocity).toBe(0);

    physics.begin(center(1), 300);
    physics.move({ x: 1400, y: 450 }, 310);
    physics.release({ x: 1400, y: 450 }, 311);
    physics.tick(dt);
    expect(center(1).x).toBe(size.width);
    expect(second.velocity.x).toBe(0);
    physics.dispose();
    expect(Composite.allBodies(engine.world)).toHaveLength(0);
    expect(physics.tick(dt)).toBe(false);
    expect(physics.begin(center(1), 400)).toBeNull();
  });
});
