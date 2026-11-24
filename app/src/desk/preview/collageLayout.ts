// WP-1-1 콜라주 미리보기 순수 배치·밀도·좌표 변환 모듈 (H-ARCH-09: 시드 주입 순수 함수 + collageConfig 일원화)
import { clamp, seededRng } from '../../core/random';
import type { ItemType } from '../../core/types';
import { cardDims } from '../geometry';
import type { SkinKind } from '../../themes/types';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface Spread {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface PreviewPiece {
  readonly id: string;
  readonly type: ItemType;
  readonly title: string;
  readonly caption: string;
  readonly seed: number;
}

export interface PiecePose {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  readonly z: number;
}

export type LightMode = 'afternoon' | 'morning' | 'night';
export type FixtureMode = 'default' | 'empty' | 'performance';
export type PaperMode = 'plain' | 'grid';

export interface DensityResult {
  unit: number;
  target: number;
  visible: number;
}

export const collageConfig = {
  seed: 20261123,
  // §5.1 조각 기준 치수·밀도
  unitRatio: 0.22,
  unitMin: 96,
  unitMax: 220,
  targetAreaRatio: 0.35,
  targetMin: 8,
  targetMax: 15,
  // 시안 1-C 확정: 와이드 점유 (+10%)
  spreadWidthRatioW: 0.94,
  spreadWidthRatioH: 1.15,
  spreadHeightRatioH: 0.74,
  spreadHeightRatioW: 1.14,
  // 무책상 A/B 확정: 단색 기본 UI 바탕(#f0eeea) + 양면 노트(#faf9f6) + 저채도 웜 차콜 2단 접촉 그림자(#1f1d1b)
  palette: {
    backdrop: '#f0eeea',
    paper: '#faf9f6',
    paperEdge: '#e6e3dc',
    paperBorder: '#dbd8d0',
    paperCrease: '#5c5a55',
    gridLine: '#1d1d1f',
    shadow: '#1f1d1b',
    ink: '#1d1d1f',
    muted: '#5c5a55',
    accent: '#c4622d',
  },
  gridStepPx: 18,
  // §3 배치 제약
  edgeFraction: 0.3,
  maxRotationDeg: 12,
  scaleMin: 0.85,
  scaleMax: 1.15,
  maxOcclusion: 0.7,
  maxRetries: 10,
  occlusionSamples: 12,
} as const;

export const SKIN_BY_TYPE: Record<ItemType, SkinKind> = {
  text: 'memo',
  image: 'polaroid',
  video: 'film',
  music: 'cassette',
  link: 'newspaper',
};

export const previewPieces: readonly PreviewPiece[] = Object.freeze([
  Object.freeze({ id: 'image-1', type: 'image', title: '창가', caption: '오후 햇살이 비치는 창가 풍경', seed: 101 }),
  Object.freeze({ id: 'image-2', type: 'image', title: '바다', caption: '잔잔한 수평선과 옅은 파도', seed: 102 }),
  Object.freeze({ id: 'text-1', type: 'text', title: '느린 오후', caption: '창가에 남은 오후의 빛.', seed: 201 }),
  Object.freeze({ id: 'text-2', type: 'text', title: '산책 메모', caption: '길 끝에서 커피 향이 났다.', seed: 202 }),
  Object.freeze({ id: 'music-1', type: 'music', title: 'Afternoon Steps', caption: '어쿠스틱 기타 연주곡', seed: 301 }),
  Object.freeze({ id: 'music-2', type: 'music', title: 'Quiet Tide', caption: '잔잔한 피아노 소품', seed: 302 }),
  Object.freeze({ id: 'video-1', type: 'video', title: '창밖', caption: '바람에 흔들리는 나뭇잎 클립', seed: 401 }),
  Object.freeze({ id: 'video-2', type: 'video', title: '파도', caption: '천천히 밀려오는 바닷가 영상', seed: 402 }),
  Object.freeze({ id: 'link-1', type: 'link', title: '종이의 결', caption: 'example.com', seed: 501 }),
  Object.freeze({ id: 'link-2', type: 'link', title: '기록하는 날', caption: 'example.com', seed: 502 }),
]);

const EXTRA_PERFORMANCE_PIECES: readonly PreviewPiece[] = Object.freeze([
  Object.freeze({ id: 'image-3', type: 'image', title: '골목', caption: '노을빛이 머문 오래된 골목', seed: 103 }),
  Object.freeze({ id: 'text-3', type: 'text', title: '저녁 메모', caption: '창문을 닫으니 종이 냄새가 났다.', seed: 203 }),
  Object.freeze({ id: 'music-3', type: 'music', title: 'Warm Dusk', caption: '느린 템포의 로파이 트랙', seed: 303 }),
  Object.freeze({ id: 'video-3', type: 'video', title: '노을', caption: '지붕 너머로 지는 해', seed: 403 }),
  Object.freeze({ id: 'link-3', type: 'link', title: '종이 아카이브', caption: 'example.com', seed: 503 }),
]);

export const performancePieces: readonly PreviewPiece[] = Object.freeze([
  ...previewPieces,
  ...EXTRA_PERFORMANCE_PIECES,
]);

export function getFixturePieces(mode: FixtureMode): readonly PreviewPiece[] {
  if (mode === 'empty') return [];
  if (mode === 'performance') return performancePieces;
  return previewPieces;
}

export function getDensity(size: CanvasSize, itemCount: number): DensityResult {
  const unit = clamp(
    Math.min(size.width, size.height) * collageConfig.unitRatio,
    collageConfig.unitMin,
    collageConfig.unitMax,
  );
  const target = clamp(
    Math.floor((size.width * size.height * collageConfig.targetAreaRatio) / (unit * unit)),
    collageConfig.targetMin,
    collageConfig.targetMax,
  );
  const visible = Math.min(target, Math.max(0, itemCount));
  return { unit, target, visible };
}

export function getSpread(size: CanvasSize): Spread {
  const width = Math.min(
    size.width * collageConfig.spreadWidthRatioW,
    size.height * collageConfig.spreadWidthRatioH,
  );
  const height = Math.min(
    size.height * collageConfig.spreadHeightRatioH,
    size.width * collageConfig.spreadHeightRatioW,
  );
  return {
    cx: size.width / 2,
    cy: size.height / 2,
    width,
    height,
  };
}

export function toCanvasPoint(spread: Spread, point: Point2D): Point2D {
  return {
    x: spread.cx + point.x * spread.width,
    y: spread.cy + point.y * spread.width,
  };
}

export function toSpreadPoint(spread: Spread, point: Point2D): Point2D {
  return {
    x: (point.x - spread.cx) / spread.width,
    y: (point.y - spread.cy) / spread.width,
  };
}

interface PlacedRect {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  cos: number;
  sin: number;
  z: number;
}

function pointInRect(px: number, py: number, r: PlacedRect): boolean {
  const dx = px - r.cx;
  const dy = py - r.cy;
  const lx = dx * r.cos + dy * r.sin;
  const ly = -dx * r.sin + dy * r.cos;
  return Math.abs(lx) <= r.hw && Math.abs(ly) <= r.hh;
}

function toPlacedRects(size: CanvasSize, spread: Spread, pieces: readonly PreviewPiece[], poses: readonly PiecePose[]): PlacedRect[] {
  const { unit } = getDensity(size, pieces.length);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  return poses.map((pose) => {
    const piece = byId.get(pose.id)!;
    const dims = cardDims(SKIN_BY_TYPE[piece.type], unit);
    const center = toCanvasPoint(spread, { x: pose.x, y: pose.y });
    return {
      cx: center.x,
      cy: center.y,
      hw: (dims.w * pose.scale) / 2,
      hh: (dims.h * pose.scale) / 2,
      cos: Math.cos(pose.rotation),
      sin: Math.sin(pose.rotation),
      z: pose.z,
    };
  });
}

function rectCorners(r: PlacedRect): Point2D[] {
  const ux = r.cos * r.hw;
  const uy = r.sin * r.hw;
  const vx = -r.sin * r.hh;
  const vy = r.cos * r.hh;
  return [
    { x: r.cx - ux - vx, y: r.cy - uy - vy },
    { x: r.cx + ux - vx, y: r.cy + uy - vy },
    { x: r.cx + ux + vx, y: r.cy + uy + vy },
    { x: r.cx - ux + vx, y: r.cy - uy + vy },
  ];
}

function protrudesOutsideSpread(r: PlacedRect, spread: Spread): boolean {
  const left = spread.cx - spread.width / 2;
  const right = spread.cx + spread.width / 2;
  const top = spread.cy - spread.height / 2;
  const bottom = spread.cy + spread.height / 2;
  return rectCorners(r).some((c) => c.x < left || c.x > right || c.y < top || c.y > bottom);
}

function evaluateCandidate(
  size: CanvasSize,
  spread: Spread,
  pieces: readonly PreviewPiece[],
  poses: readonly PiecePose[],
  edgeIndices: ReadonlySet<number>,
): { ok: boolean; maxOcclusion: number; hasOverlap: boolean } {
  const rects = toPlacedRects(size, spread, pieces, poses);
  const n = collageConfig.occlusionSamples;
  const totalSamples = n * n;
  let maxOcclusion = 0;
  let hasOverlap = false;

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (edgeIndices.has(i) && !protrudesOutsideSpread(r, spread)) {
      return { ok: false, maxOcclusion: 1, hasOverlap: false };
    }
    const above = rects.filter((other, j) => j !== i && other.z > r.z);
    if (above.length === 0) continue;

    let covered = 0;
    for (let sx = 0; sx < n; sx++) {
      const fx = ((sx + 0.5) / n) * 2 - 1;
      for (let sy = 0; sy < n; sy++) {
        const fy = ((sy + 0.5) / n) * 2 - 1;
        const lx = fx * r.hw;
        const ly = fy * r.hh;
        const px = r.cx + lx * r.cos - ly * r.sin;
        const py = r.cy + lx * r.sin + ly * r.cos;
        if (above.some((a) => pointInRect(px, py, a))) {
          covered += 1;
        }
      }
    }
    const ratio = covered / totalSamples;
    if (ratio > 0) hasOverlap = true;
    if (ratio > maxOcclusion) maxOcclusion = ratio;
    if (ratio > collageConfig.maxOcclusion) {
      return { ok: false, maxOcclusion, hasOverlap };
    }
  }

  const overlapRequirementMet = pieces.length < 2 || hasOverlap;
  return { ok: overlapRequirementMet, maxOcclusion, hasOverlap };
}

function buildRandomCandidate(
  spread: Spread,
  pieces: readonly PreviewPiece[],
  edgeCount: number,
  rng: () => number,
): { poses: PiecePose[]; edgeIndices: Set<number> } {
  const maxRad = (collageConfig.maxRotationDeg * Math.PI) / 180;
  const aspectY = spread.height / spread.width;
  const interiorCount = pieces.length - edgeCount;
  const edgeIndices = new Set<number>();
  for (let i = interiorCount; i < pieces.length; i++) edgeIndices.add(i);

  const poses: PiecePose[] = [];
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, interiorCount) * (spread.width / spread.height))));
  const rows = Math.max(1, Math.ceil(Math.max(1, interiorCount) / cols));

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const rotation = (rng() * 2 - 1) * maxRad;
    const scale = collageConfig.scaleMin + rng() * (collageConfig.scaleMax - collageConfig.scaleMin);

    let x: number;
    let y: number;
    if (i < interiorCount) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = ((col + 0.5) / cols - 0.5) * 0.72;
      const cellY = ((row + 0.5) / rows - 0.5) * aspectY * 0.72;
      // 인접한 두 조각은 자연스러운 겹침이 생기도록 첫 쌍을 살짝 가깝게 유도
      const pull = i === 1 ? 0.35 : 0;
      const jitterX = (rng() * 2 - 1) * 0.08;
      const jitterY = (rng() * 2 - 1) * aspectY * 0.08;
      x = clamp(cellX + jitterX - pull * 0.16, -0.38, 0.38);
      y = clamp(cellY + jitterY, -aspectY * 0.38, aspectY * 0.38);
    } else {
      const edgeIdx = i - interiorCount;
      const side = edgeIdx % 4;
      const t = (rng() * 0.52 - 0.26);
      if (side === 0) {
        x = -0.49;
        y = t * aspectY;
      } else if (side === 1) {
        x = 0.49;
        y = t * aspectY;
      } else if (side === 2) {
        x = t;
        y = -aspectY * 0.49;
      } else {
        x = t;
        y = aspectY * 0.49;
      }
    }

    poses.push(Object.freeze({ id: piece.id, x, y, rotation, scale, z: i + 1 }));
  }

  return { poses, edgeIndices };
}

function buildSafeCandidate(
  size: CanvasSize,
  spread: Spread,
  pieces: readonly PreviewPiece[],
  edgeCount: number,
  scaleFactor = 1,
): { poses: PiecePose[]; edgeIndices: Set<number> } {
  const aspectY = spread.height / spread.width;
  const interiorCount = pieces.length - edgeCount;
  const edgeIndices = new Set<number>();
  for (let i = interiorCount; i < pieces.length; i++) edgeIndices.add(i);

  const { unit } = getDensity(size, pieces.length);
  const normUnit = (unit * scaleFactor) / spread.width;

  const poses: PiecePose[] = [];
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, interiorCount) * (spread.width / spread.height))));
  const rows = Math.max(1, Math.ceil(Math.max(1, interiorCount) / cols));

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const angleSign = i % 2 === 0 ? 1 : -1;
    const rotation = angleSign * ((4 + (i % 4) * 2) * Math.PI) / 180;
    const scale = (0.88 + (i % 3) * 0.06) * scaleFactor;

    let x: number;
    let y: number;
    if (i < interiorCount) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      x = ((col + 0.5) / cols - 0.5) * 0.72;
      y = ((row + 0.5) / rows - 0.5) * aspectY * 0.72;
      if (i === 1 && interiorCount >= 2) {
        x = clamp(poses[0].x + normUnit * 0.6, -0.4, 0.4);
        y = clamp(poses[0].y + normUnit * 0.35, -aspectY * 0.4, aspectY * 0.4);
      }
    } else {
      const e = i - interiorCount;
      const side = e % 4;
      const offset = ((Math.floor(e / 4) % 2) === 0 ? -0.18 : 0.18);
      if (side === 0) {
        x = -0.5;
        y = offset * aspectY;
      } else if (side === 1) {
        x = 0.5;
        y = -offset * aspectY;
      } else if (side === 2) {
        x = offset;
        y = -aspectY * 0.5;
      } else {
        x = -offset;
        y = aspectY * 0.5;
      }
    }

    poses.push(Object.freeze({ id: piece.id, x, y, rotation, scale, z: i + 1 }));
  }

  return { poses, edgeIndices };
}

export function placePieces(
  size: CanvasSize,
  pieces: readonly PreviewPiece[],
  seed: number = collageConfig.seed,
): readonly PiecePose[] {
  if (size.width <= 0 || size.height <= 0) {
    throw new Error(`유효하지 않은 캔버스 크기: ${size.width}x${size.height}`);
  }
  if (pieces.length === 0) return Object.freeze([]);

  const ids = new Set<string>();
  for (const p of pieces) {
    if (ids.has(p.id)) throw new Error(`중복 조각 ID: ${p.id}`);
    ids.add(p.id);
  }

  const spread = getSpread(size);
  const edgeCount = Math.round(pieces.length * collageConfig.edgeFraction);
  const rng = seededRng(seed);

  for (let attempt = 0; attempt < collageConfig.maxRetries; attempt++) {
    const { poses, edgeIndices } = buildRandomCandidate(spread, pieces, edgeCount, rng);
    const check = evaluateCandidate(size, spread, pieces, poses, edgeIndices);
    if (check.ok) return Object.freeze(poses);
  }

  let lastOcclusion = 0;
  for (const scaleFactor of [1, 0.8, 0.65, 0.5, 0.35, 0.25, 0.18, 0.12]) {
    const safe = buildSafeCandidate(size, spread, pieces, edgeCount, scaleFactor);
    const safeCheck = evaluateCandidate(size, spread, pieces, safe.poses, safe.edgeIndices);
    lastOcclusion = safeCheck.maxOcclusion;
    if (safeCheck.ok) return Object.freeze(safe.poses);
  }

  throw new Error(`안전 배치 검증 실패 (${size.width}x${size.height}, maxOcclusion=${lastOcclusion.toFixed(2)})`);
}
