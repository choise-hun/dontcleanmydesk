import { useLayoutEffect, useRef, useState } from 'react';
import { createCollagePhysics, type InteractionPose } from './collagePhysics';
import { collageConfig, type CanvasSize, type PiecePose, type PreviewPiece, type Spread } from './collageLayout';

const { tickMs, maxCatchupTicks } = collageConfig.physics;

export function useCollageInteraction(
  size: CanvasSize,
  spread: Spread,
  pieces: readonly PreviewPiece[],
  initial: readonly PiecePose[],
  reduceMotion: boolean,
  animateLight: boolean,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const carry = useRef<{ pieces: readonly PreviewPiece[]; poses: readonly InteractionPose[] } | null>(null);
  const [snapshot, setSnapshot] = useState<{ spread: Spread; poses: readonly InteractionPose[] }>(
    () => ({ spread, poses: initial.map((pose) => ({ ...pose, lift: 0 })) }),
  );
  const [sway, setSway] = useState(0);
  const options = useRef({ reduceMotion, animateLight });
  const restart = useRef<(() => void) | null>(null);
  const focused = useRef(true);

  useLayoutEffect(() => {
    options.current = { reduceMotion, animateLight };
    restart.current?.();
  }, [reduceMotion, animateLight]);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    const owner = element?.ownerDocument.defaultView;
    if (!element || !owner) return;
    const surface = element;
    const view = owner;
    const doc = surface.ownerDocument;
    const physics = createCollagePhysics(size, spread, pieces, carry.current?.pieces === pieces ? carry.current.poses : initial);
    let alive = true;
    let pointerId: number | null = null;
    let raf: number | null = null;
    let previousTime = 0;
    let elapsed = 0;
    let lightTime = 0;
    let moving = false;

    const publish = () => {
      const poses = physics.snapshot();
      setSnapshot((previous) => previous.spread === spread && previous.poses === poses ? previous : { spread, poses });
    };
    const matchesSize = (rect: DOMRect) =>
      Math.round(rect.width) === size.width && Math.round(rect.height) === size.height;
    const available = () => alive && focused.current && !doc.hidden && matchesSize(surface.getBoundingClientRect());

    function closeCapture() {
      const id = pointerId;
      pointerId = null;
      if (id !== null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    }

    function pause() {
      closeCapture();
      moving = false;
      elapsed = 0;
      if (raf !== null) view.cancelAnimationFrame(raf);
      raf = null;
      physics.cancel();
    }

    function frame(now: number) {
      raf = null;
      if (!alive) return;
      if (!available()) {
        pause();
        publish();
        return;
      }
      const delta = Math.max(0, Math.min(now - previousTime, tickMs * maxCatchupTicks));
      previousTime = now;
      if (moving) {
        elapsed += delta;
        while (moving && elapsed + 1e-7 >= tickMs) {
          moving = physics.tick(tickMs);
          elapsed = Math.max(0, elapsed - tickMs);
        }
        publish();
      }
      if (!moving) elapsed = 0;
      if (options.current.animateLight) {
        lightTime += delta;
        setSway(lightTime * 0.00035);
      }
      if (moving || options.current.animateLight) raf = view.requestAnimationFrame(frame);
    }

    function wake() {
      if (raf !== null || !available() || !(moving || options.current.animateLight)) return;
      previousTime = view.performance.now();
      raf = view.requestAnimationFrame(frame);
    }

    function getPoint(event: PointerEvent) {
      const rect = surface.getBoundingClientRect();
      return matchesSize(rect) ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
    }

    function onDown(event: PointerEvent) {
      if (pointerId !== null || !event.isPrimary || event.button !== 0 || !available()) return;
      const point = getPoint(event);
      if (!point || physics.begin(point, event.timeStamp) === null) return;
      try {
        surface.setPointerCapture(event.pointerId);
      } catch (error) {
        physics.release(point, event.timeStamp);
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
        return;
      }
      pointerId = event.pointerId;
    }

    function onMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      const point = getPoint(event);
      if (!point) {
        syncAvailability();
        return;
      }
      const samples = event.getCoalescedEvents?.() ?? [];
      const { left, top } = surface.getBoundingClientRect();
      for (const sample of samples) {
        physics.move({ x: sample.clientX - left, y: sample.clientY - top }, sample.timeStamp);
      }
      physics.move(point, event.timeStamp);
      moving = true;
      wake();
    }

    function onUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      const point = getPoint(event);
      if (!point) {
        syncAvailability();
        return;
      }
      const wasHeld = physics.snapshot().some((pose) => pose.lift === 1);
      closeCapture();
      physics.release(point, event.timeStamp);
      if (wasHeld && options.current.reduceMotion) {
        physics.cancel();
        moving = false;
      }
      publish();
      wake();
    }

    function onCancel(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      if (event.type === 'lostpointercapture' && surface.hasPointerCapture(event.pointerId)) return;
      physics.cancel();
      closeCapture();
      moving = false;
      elapsed = 0;
      publish();
    }

    function syncAvailability() {
      if (available()) {
        wake();
      } else {
        pause();
        publish();
      }
    }

    function onBlur() {
      focused.current = false;
      syncAvailability();
    }

    function onFocus() {
      focused.current = true;
      syncAvailability();
    }

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onCancel);
    surface.addEventListener('lostpointercapture', onCancel);
    view.addEventListener('blur', onBlur);
    view.addEventListener('focus', onFocus);
    doc.addEventListener('visibilitychange', syncAvailability);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncAvailability);
    observer?.observe(surface);
    view.addEventListener('resize', syncAvailability);
    restart.current = syncAvailability;
    publish();
    wake();

    return () => {
      alive = false;
      restart.current = null;
      observer?.disconnect();
      view.removeEventListener('resize', syncAvailability);
      doc.removeEventListener('visibilitychange', syncAvailability);
      view.removeEventListener('focus', onFocus);
      view.removeEventListener('blur', onBlur);
      surface.removeEventListener('lostpointercapture', onCancel);
      surface.removeEventListener('pointercancel', onCancel);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerdown', onDown);
      pause();
      carry.current = { pieces, poses: physics.snapshot() };
      physics.dispose();
    };
  }, [size, spread, pieces, initial]);

  useLayoutEffect(() => {
    if (snapshot.spread !== spread) return;
    surfaceRef.current?.dispatchEvent(new CustomEvent('collage-poses', {
      bubbles: true,
      detail: snapshot,
    }));
  }, [snapshot, spread]);

  return { surfaceRef, poses: snapshot.poses, sway: animateLight ? sway : 0 };
}
