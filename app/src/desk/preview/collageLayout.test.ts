import { describe, expect, it } from 'vitest';
import { collageConfig, getFixturePieces, placePieces } from './collageLayout';

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
});
