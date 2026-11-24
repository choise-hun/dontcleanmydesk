import { Bodies, Body, Composite, Detector, Engine } from 'matter-js';
import { clamp } from '../../core/random';
import { cardDims, hitTest } from '../geometry';
import {
  collageConfig, getDensity, SKIN_BY_TYPE, toCanvasPoint, toSpreadPoint,
  type CanvasSize, type PiecePose, type Point2D, type PreviewPiece, type Spread,
} from './collageLayout';

export interface InteractionPose extends PiecePose {
  readonly lift: number;
}

type Phase = 'resting' | 'held' | 'thrown' | 'pushed';
type Sample = Point2D & { time: number };
type Card = {
  // Matter 0.20 keeps its position solver's warm-start impulse on the body.
  body: Body & { positionImpulse: Point2D };
  w: number;
  h: number;
  pose: InteractionPose;
  phase: Phase;
  quietTicks: number;
  restingAt: Point2D & { angle: number };
};
type Gesture = {
  card: Card;
  start: Point2D;
  offset: Point2D;
  target: Point2D;
  samples: Sample[];
};

const config = collageConfig.physics;
const driverCategory = 1;
const targetCategory = 2;
const wallCategory = 4;
const origin = { x: 0, y: 0 };

function setPhase(card: Card, phase: Phase) {
  const drives = phase === 'held' || phase === 'thrown';
  Body.setMass(card.body, drives ? config.driverMass : config.targetMass);
  card.body.collisionFilter.category = drives ? driverCategory : targetCategory;
  card.body.collisionFilter.mask = (drives ? targetCategory : driverCategory) | wallCategory;
  card.phase = phase;
  card.quietTicks = 0;
  if (phase === 'resting') card.restingAt = { ...card.body.position, angle: card.body.angle };
}

function stop(card: Card) {
  Body.setVelocity(card.body, origin);
  Body.setAngularVelocity(card.body, 0);
  Object.assign(card.body.positionImpulse, origin);
  setPhase(card, 'resting');
}

export function createCollagePhysics(
  size: CanvasSize, spread: Spread, pieces: readonly PreviewPiece[], poses: readonly PiecePose[],
) {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const { width, height } = size;
  const bounded = ({ x, y }: Point2D) => ({ x: clamp(x, 0, width), y: clamp(y, 0, height) });
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const { unit } = getDensity(size, pieces.length);
  const cards = poses.map((pose): Card => {
    const piece = byId.get(pose.id);
    if (!piece) throw new Error(`Unknown collage piece: ${pose.id}`);
    const { w, h } = cardDims(SKIN_BY_TYPE[piece.type], unit * pose.scale);
    const input = toCanvasPoint(spread, pose);
    const center = bounded(input);
    const body = Bodies.rectangle(center.x, center.y, w, h, {
      angle: pose.rotation,
      frictionAir: config.frictionAir,
      restitution: config.restitution,
    }) as Card['body'];
    const position = center.x === input.x && center.y === input.y ? pose : toSpreadPoint(spread, center);
    const card: Card = {
      body, w, h, pose: { ...pose, x: position.x, y: position.y, lift: 0 },
      phase: 'resting', quietTicks: 0, restingAt: { ...center, angle: pose.rotation },
    };
    setPhase(card, 'resting');
    return card;
  });
  const byBody = new Map(cards.map((card) => [card.body.id, card]));
  const marginX = width * config.wallMargin;
  const marginY = height * config.wallMargin;
  const padding = Math.max(width, height);
  const wall = (x: number, y: number, w: number, h: number) => Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    collisionFilter: { category: wallCategory, mask: driverCategory | targetCategory },
  });
  Composite.add(engine.world, [
    ...cards.map((card) => card.body),
    wall(-marginX - padding / 2, height / 2, padding, height + 2 * marginY),
    wall(width + marginX + padding / 2, height / 2, padding, height + 2 * marginY),
    wall(width / 2, -marginY - padding / 2, width + 2 * marginX, padding),
    wall(width / 2, height + marginY + padding / 2, width + 2 * marginX, padding),
  ]);

  let gesture: Gesture | null = null;
  let driver: Card | null = null;
  let disposed = false;
  let topZ = cards.reduce((highest, { pose }) => Math.max(highest, pose.z), -Infinity);
  let contacts = new Set<Card>();
  let frame = cards.map((card) => card.pose);

  function resetContacts() {
    contacts.clear();
    Engine.clear(engine);
    Detector.setBodies(engine.detector, Composite.allBodies(engine.world));
  }

  function simulate(dt: number, nextContacts: Set<Card>) {
    Engine.update(engine, dt);
    for (const pair of engine.pairs.list) {
      if (!pair.isActive || !driver) continue;
      const other = pair.bodyA === driver.body ? pair.bodyB : pair.bodyB === driver.body ? pair.bodyA : null;
      const target = other && byBody.get(other.id);
      if (!target) continue;
      if (target.phase === 'resting') setPhase(target, 'pushed');
      nextContacts.add(target);
    }
    for (const { body, phase, restingAt } of cards) {
      if (phase === 'resting') {
        // A wall can overlap an idle card at narrow sizes. Only a driver wakes it.
        if (body.position.x !== restingAt.x || body.position.y !== restingAt.y) Body.setPosition(body, restingAt);
        if (body.angle !== restingAt.angle) Body.setAngle(body, restingAt.angle);
        if (body.speed) Body.setVelocity(body, origin);
        if (body.angularVelocity) Body.setAngularVelocity(body, 0);
        Object.assign(body.positionImpulse, origin);
        continue;
      }
      const center = bounded(body.position);
      const { x, y } = body.velocity;
      const vx = center.x === 0 ? Math.max(0, x) : center.x === width ? Math.min(0, x) : x;
      const vy = center.y === 0 ? Math.max(0, y) : center.y === height ? Math.min(0, y) : y;
      if (center.x !== body.position.x || center.y !== body.position.y) Body.setPosition(body, center);
      if (vx !== x || vy !== y) Body.setVelocity(body, { x: vx, y: vy });
    }
  }

  function advance(dt: number) {
    const nextContacts = new Set<Card>();
    const held = gesture?.card.phase === 'held' ? gesture : null;
    if (held) {
      const { body, pose } = held.card;
      const start = { ...body.position };
      const dx = held.target.x - start.x;
      const dy = held.target.y - start.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / config.maxDragStep));
      const slice = dt / steps;
      for (let i = 1; i <= steps; i++) {
        const target = { x: start.x + dx * i / steps, y: start.y + dy * i / steps };
        // Compensate for air drag so the integrated held body reaches this sample.
        const rate = (config.tickMs / slice) / (1 - config.frictionAir * slice / config.tickMs);
        Body.setVelocity(body, { x: (target.x - body.position.x) * rate, y: (target.y - body.position.y) * rate });
        simulate(slice, nextContacts);
        Body.setPosition(body, target);
        Body.setAngle(body, pose.rotation);
        Body.setVelocity(body, origin);
        Body.setAngularVelocity(body, 0);
        Object.assign(body.positionImpulse, origin);
      }
    } else {
      simulate(dt, nextContacts);
    }
    const newContact = [...nextContacts].some((card) => !contacts.has(card));
    for (const card of cards) {
      if (card.phase !== 'thrown' && card.phase !== 'pushed') continue;
      if (card.body.speed >= config.stopSpeed ||
          (nextContacts.has(card) && !contacts.has(card)) ||
          (card === driver && newContact)) {
        card.quietTicks = 0;
      } else if (++card.quietTicks >= config.stopTicks) {
        stop(card);
        if (card === driver) driver = null;
      }
    }
    contacts = nextContacts;
  }

  function begin(point: Point2D, time: number) {
    if (disposed || gesture) return null;
    let top: Card | undefined;
    for (const card of cards) {
      const { body, pose, w, h } = card;
      if ((!top || pose.z > top.pose.z) && hitTest(point.x, point.y, {
        ...body.position, rot: body.angle, w, h,
      })) top = card;
    }
    if (!top) return null;
    const offset = { x: top.body.position.x - point.x, y: top.body.position.y - point.y };
    gesture = { card: top, start: point, offset, target: { ...top.body.position }, samples: [{ ...point, time }] };
    return top.pose.id;
  }

  function move(point: Point2D, time: number) {
    if (!gesture) return;
    const { card, start, offset, samples } = gesture;
    const last = samples[samples.length - 1];
    if (time < last.time) return;
    if (point.x !== last.x || point.y !== last.y) {
      samples.push({ ...point, time });
      gesture.samples = samples.filter((sample) => time - sample.time <= config.sampleWindowMs);
    }
    if (card.phase !== 'held') {
      if (Math.hypot(point.x - start.x, point.y - start.y) < config.dragThreshold) return;
      if (driver && driver !== card) setPhase(driver, 'pushed');
      stop(card);
      resetContacts();
      setPhase(card, 'held');
      card.pose = { ...card.pose, z: ++topZ, lift: 1 };
      driver = card;
    }
    gesture.target = bounded({ x: point.x + offset.x, y: point.y + offset.y });
  }

  function release(point: Point2D, time: number) {
    if (!gesture) return;
    const { card } = gesture;
    // Pointer-up can supply a final position only after a drag has been confirmed.
    if (card.phase === 'held') {
      move(point, time);
      const { samples, target } = gesture;
      if (card.body.position.x !== target.x || card.body.position.y !== target.y) advance(config.tickMs);
      const last = samples[samples.length - 1];
      const first = samples.find((sample) => time - sample.time <= config.sampleWindowMs);
      const elapsed = first ? last.time - first.time : 0;
      const dx = first ? last.x - first.x : 0;
      const dy = first ? last.y - first.y : 0;
      const distance = Math.hypot(dx, dy);
      const rate = elapsed > 0 && distance > 0 && time - last.time < config.sampleWindowMs
        ? Math.min(config.tickMs / elapsed, config.maxThrowSpeed / distance)
        : 0;
      card.pose = { ...card.pose, lift: 0 };
      setPhase(card, 'thrown');
      Body.setVelocity(card.body, { x: dx * rate, y: dy * rate });
    }
    gesture = null;
  }

  function cancel() {
    if (disposed) return;
    gesture = null;
    driver = null;
    for (const card of cards) {
      if (card.pose.lift) card.pose = { ...card.pose, lift: 0 };
      stop(card);
    }
    resetContacts();
  }

  function tick(dtMs: number) {
    if (disposed || cards.every((card) => card.phase === 'resting')) return false;
    advance(dtMs);
    return cards.some((card) => card.phase !== 'resting');
  }

  function snapshot(): readonly InteractionPose[] {
    let changed = false;
    for (const [i, card] of cards.entries()) {
      const { body, pose } = card;
      const { x, y } = toSpreadPoint(spread, body.position);
      const previous = toCanvasPoint(spread, pose);
      if (Math.abs(previous.x - body.position.x) > 1e-8 ||
          Math.abs(previous.y - body.position.y) > 1e-8 || pose.rotation !== body.angle) {
        card.pose = { ...pose, x, y, rotation: body.angle };
      }
      changed ||= frame[i] !== card.pose;
    }
    if (changed) frame = cards.map((card) => card.pose);
    return frame;
  }

  return {
    begin, move, release, cancel, tick, snapshot,
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
    },
  };
}
