import { describe, expect, it } from 'vitest';
import { collageConfig, getFixturePieces, getSpread, placePieces } from './collageLayout';

describe('placePieces small canvas fallback', () => {
  it('places performance fixture on 320x568 without throwing', () => {
    const pieces = getFixturePieces('performance');
    const poses = placePieces({ width: 320, height: 568 }, pieces, collageConfig.seed);
    expect(poses).toHaveLength(pieces.length);
  });

  it('places default fixture on 320x360 without throwing', () => {
    const pieces = getFixturePieces('default');
    const poses = placePieces({ width: 320, height: 360 }, pieces, collageConfig.seed);
    expect(poses).toHaveLength(pieces.length);
  });

  it('places default fixture on 1280x800', () => {
    const pieces = getFixturePieces('default');
    const poses = placePieces({ width: 1280, height: 800 }, pieces, collageConfig.seed);
    expect(poses).toHaveLength(pieces.length);
  });

  it('adapts fallback scale on very small canvases (120x120)', () => {
    for (const mode of ['default', 'performance'] as const) {
      const pieces = getFixturePieces(mode);
      const poses = placePieces({ width: 120, height: 120 }, pieces, collageConfig.seed);
      expect(poses).toHaveLength(pieces.length);
      expect(poses.every((p) => p.scale > 0)).toBe(true);
    }
  });

  it('uses 2-page spread for wide/tablet-landscape viewports and 1-page for narrow/portrait mobile', () => {
    const desktop = getSpread({ width: 1280, height: 900 });
    expect(desktop.pages).toBe(2);
    expect(desktop.width / desktop.height).toBeCloseTo(1.55, 1);

    const foldWide = getSpread({ width: 840, height: 700 });
    expect(foldWide.pages).toBe(2);
    expect(foldWide.width).toBeGreaterThan(foldWide.height);

    const tabletPortrait = getSpread({ width: 768, height: 1024 });
    expect(tabletPortrait.pages).toBe(1);
    expect(tabletPortrait.cx).toBeCloseTo(768 * 0.09, 1);
    expect(tabletPortrait.cx - tabletPortrait.width / 2).toBeLessThan(0);

    const foldPortrait = getSpread({ width: 600, height: 750 });
    expect(foldPortrait.pages).toBe(1);
    expect(foldPortrait.cx).toBeCloseTo(600 * 0.09, 1);

    const mobilePortrait = getSpread({ width: 390, height: 900 });
    expect(mobilePortrait.pages).toBe(1);
    expect(mobilePortrait.cx).toBeCloseTo(390 * 0.09, 1);
    expect(mobilePortrait.width / mobilePortrait.height).toBeCloseTo(1.55, 1);
  });
});
