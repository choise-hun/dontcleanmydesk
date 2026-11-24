// WP-1-1 무책상(Deskless) 단일 Skia Canvas 6개 레이어
// L1 단색 UI 바탕(#f0eeea) → L2 양면 노트(A 무지 plain / B 노트 내부만 모눈 grid) → L3 조각+2단 접촉 그림자 → L4 노트 가장자리 미니멀 표식 → L5 간접 음영 → L6 간접광
import {
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import type { InteractionPose } from './collagePhysics';
import { useCollageInteraction } from './useCollageInteraction.web';

import { hexToRgba } from '@/core/random';
import { cardDims } from '@/desk/geometry';

import {
  collageConfig,
  getDensity,
  getSpread,
  SKIN_BY_TYPE,
  toCanvasPoint,
  type CanvasSize,
  type LightMode,
  type PaperMode,
  type PiecePose,
  type PreviewPiece,
  type Spread,
} from './collageLayout';

export interface CollageSceneProps {
  size: CanvasSize;
  pieces: readonly PreviewPiece[];
  poses: readonly PiecePose[];
  light: LightMode;
  reduceMotion: boolean;
  paper?: PaperMode;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgba(hex, alpha);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

// L1 단색 기본 UI 바탕 (나무결·얼룩·흠집 없음)
const BackdropLayer = memo(function BackdropLayer() {
  return <Fill color={collageConfig.palette.backdrop} />;
});

// L2 양면 노트: 2단 접촉 그림자 + 좌·우 속지(plain 무지 / grid 노트 내부만 모눈) + 중앙 접힘 음영
const SpreadLayer = memo(function SpreadLayer({ spread, paper }: { spread: Spread; paper: PaperMode }) {
  const left = spread.cx - spread.width / 2;
  const top = spread.cy - spread.height / 2;
  const creaseWidth = Math.max(16, spread.width * 0.04);

  const gridPath = useMemo(() => {
    if (paper !== 'grid') return '';
    const step = collageConfig.gridStepPx;
    const cmds: string[] = [];
    const right = left + spread.width;
    const bottom = top + spread.height;
    for (let x = left + step; x < right - 1; x += step) {
      cmds.push(`M ${Math.round(x)} ${Math.round(top)} L ${Math.round(x)} ${Math.round(bottom)}`);
    }
    for (let y = top + step; y < bottom - 1; y += step) {
      cmds.push(`M ${Math.round(left)} ${Math.round(y)} L ${Math.round(right)} ${Math.round(y)}`);
    }
    return cmds.join(' ');
  }, [paper, left, top, spread.width, spread.height]);

  return (
    <Group>
      {/* 2단 그림자 — 바깥 부드러운 드롭 그림자 */}
      <Rect
        x={left + 4}
        y={top + 10}
        width={spread.width}
        height={spread.height}
        color={withAlpha(collageConfig.palette.shadow, 0.09)}
      >
        <BlurMask blur={16} style="normal" />
      </Rect>
      {/* 2단 그림자 — 좁고 진한 접촉 AO 그림자 */}
      <Rect
        x={left + 1}
        y={top + 2}
        width={spread.width}
        height={spread.height}
        color={withAlpha(collageConfig.palette.shadow, 0.14)}
      >
        <BlurMask blur={2.5} style="normal" />
      </Rect>
      {/* 종이 겹침 두께 */}
      <Rect
        x={left + 2}
        y={top + 2}
        width={spread.width}
        height={spread.height}
        color={collageConfig.palette.paperEdge}
      />
      {/* 본체 양면 종이 */}
      <Rect x={left} y={top} width={spread.width} height={spread.height} color={collageConfig.palette.paper} />

      {/* 후보 B 프리셋: 양면 노트 내부에만 모눈 격자 (바깥 바탕은 단색 유지) */}
      {paper === 'grid' && gridPath !== '' && (
        <Path
          path={gridPath}
          color={withAlpha(collageConfig.palette.gridLine, 0.055)}
          style="stroke"
          strokeWidth={1}
        />
      )}

      {/* 속지 1px 테두리 */}
      <Rect
        x={left}
        y={top}
        width={spread.width}
        height={spread.height}
        color={collageConfig.palette.paperBorder}
        style="stroke"
        strokeWidth={1}
      />
      {/* 중앙 접힘 음영 */}
      <Rect x={spread.cx - creaseWidth / 2} y={top} width={creaseWidth} height={spread.height}>
        <LinearGradient
          start={vec(spread.cx - creaseWidth / 2, top)}
          end={vec(spread.cx + creaseWidth / 2, top)}
          colors={[
            withAlpha(collageConfig.palette.shadow, 0),
            withAlpha(collageConfig.palette.shadow, 0.08),
            withAlpha(collageConfig.palette.shadow, 0.02),
            withAlpha(collageConfig.palette.shadow, 0),
          ]}
          positions={[0, 0.48, 0.56, 1]}
        />
      </Rect>
      {/* 접힘 중앙선 */}
      <Path
        path={`M ${spread.cx} ${top} L ${spread.cx} ${top + spread.height}`}
        color={withAlpha(collageConfig.palette.shadow, 0.14)}
        style="stroke"
        strokeWidth={1}
      />
    </Group>
  );
});

// L3 조각 한 장 (5유형 미니멀 아카이브 스킨 + 2단 접촉 그림자)
const PieceNode = memo(function PieceNode({
  piece,
  pose,
  spread,
  unit,
}: {
  piece: PreviewPiece;
  pose: InteractionPose;
  spread: Spread;
  unit: number;
}) {
  const skin = SKIN_BY_TYPE[piece.type];
  const dims = cardDims(skin, unit);
  const w = dims.w;
  const h = dims.h;
  const hw = w / 2;
  const hh = h / 2;
  const pos = toCanvasPoint(spread, { x: pose.x, y: pose.y });

  const dropColor = withAlpha(collageConfig.palette.shadow, 0.11);
  const aoColor = withAlpha(collageConfig.palette.shadow, 0.17);
  const lift = collageConfig.lift;

  return (
    <Group transform={[
      { translateX: pos.x }, { translateY: pos.y }, { rotate: pose.rotation },
      { scale: pose.scale * (1 + pose.lift * lift.scale) },
    ]}>
      {/* 2단 그림자 — 방향성 드롭 그림자 */}
      <Rect x={-hw + 3 + pose.lift * lift.shadowX} y={-hh + 6 + pose.lift * lift.shadowY} width={w} height={h} color={dropColor}>
        <BlurMask blur={10 + pose.lift * lift.blur} style="normal" />
      </Rect>
      {/* 2단 그림자 — 접촉 AO */}
      <Rect x={-hw + 1} y={-hh + 1.5} width={w} height={h} color={aoColor}>
        <BlurMask blur={2} style="normal" />
      </Rect>

      {piece.type === 'image' && (
        <Group>
          <Rect x={-hw} y={-hh} width={w} height={h} color="#fcfbf9" />
          <Rect x={-hw} y={-hh} width={w} height={h} color="#dbd8d0" style="stroke" strokeWidth={1} />
          <Rect x={-hw + 8} y={-hh + 8} width={w - 16} height={h - 30} color={piece.id === 'image-1' ? '#c8b6a2' : '#7b99ab'} />
          <Circle
            cx={piece.id === 'image-1' ? -hw + w * 0.3 : hw - w * 0.3}
            cy={-hh + h * 0.28}
            r={Math.min(w, h) * 0.11}
            color="#f5eedc"
          />
          <Path
            path={`M ${-hw + 8} ${hh - 22} L ${-hw + w * 0.36} ${hh - 46} L ${hw - 8} ${hh - 22} Z`}
            color={piece.id === 'image-1' ? '#6d5d4e' : '#4a6575'}
          />
          <Rect x={-hw + 10} y={hh - 14} width={w * 0.4} height={3} color="#5c5a55" />
        </Group>
      )}

      {piece.type === 'text' && (
        <Group>
          <Rect x={-hw} y={-hh} width={w} height={h} color="#f4f2ec" />
          <Rect x={-hw} y={-hh} width={w} height={h} color="#dbd8d0" style="stroke" strokeWidth={1} />
          <Rect x={-w * 0.2} y={-hh - 4} width={w * 0.4} height={9} color="rgba(222, 218, 208, 0.78)" />
          <Rect x={-hw + 12} y={-hh + 18} width={w * 0.54} height={4} color="#1d1d1f" />
          <Rect x={-hw + 12} y={-hh + 32} width={w - 24} height={2.5} color="#5c5a55" />
          <Rect x={-hw + 12} y={-hh + 42} width={w - 30} height={2.5} color="#5c5a55" />
          <Rect x={-hw + 12} y={-hh + 52} width={w * 0.6} height={2.5} color="#5c5a55" />
        </Group>
      )}

      {piece.type === 'music' && (
        <Group>
          <Rect x={-hw} y={-hh} width={w} height={h} color="#232325" />
          <Rect x={-hw + 10} y={-hh + 10} width={w - 20} height={h * 0.54} color="#eae7e0" />
          <Circle cx={-w * 0.18} cy={-hh + h * 0.37} r={Math.min(w, h) * 0.12} color="#232325" />
          <Circle cx={w * 0.18} cy={-hh + h * 0.37} r={Math.min(w, h) * 0.12} color="#232325" />
          <Rect x={-hw + 12} y={hh - 19} width={w * 0.56} height={3.5} color="#f4f3ef" />
        </Group>
      )}

      {piece.type === 'video' && (
        <Group>
          <Rect x={-hw} y={-hh} width={w} height={h} color="#1d1d1f" />
          <Rect x={-hw + 12} y={-hh + 9} width={w - 24} height={h - 18} color="#6b807a" />
          <Path path="M -7 -9 L 11 0 L -7 9 Z" color="#faf9f6" />
          {[-0.36, -0.12, 0.12, 0.36].map((f, idx) => (
            <Group key={`perf-${idx}`}>
              <Rect x={-hw + 3} y={f * h - 2.5} width={5} height={5} color="#faf9f6" />
              <Rect x={hw - 8} y={f * h - 2.5} width={5} height={5} color="#faf9f6" />
            </Group>
          ))}
        </Group>
      )}

      {piece.type === 'link' && (
        <Group>
          <Rect x={-hw} y={-hh} width={w} height={h} color="#efede7" />
          <Rect x={-hw} y={-hh} width={w} height={h} color="#d6d3cb" style="stroke" strokeWidth={1} />
          <Rect x={-hw + 10} y={-hh + 10} width={w - 20} height={h * 0.42} color="#b8b2a6" />
          <Rect x={-hw + 10} y={-hh + h * 0.58} width={w * 0.66} height={4.5} color="#1d1d1f" />
          <Rect x={-hw + 10} y={-hh + h * 0.7} width={w * 0.46} height={2.5} color="#5c5a55" />
          <Rect x={-hw + 10} y={hh - 14} width={w * 0.34} height={2.5} color="#c4622d" />
        </Group>
      )}
    </Group>
  );
});

// L4 노트 가장자리 미니멀 표식 (솔방울·말린 꽃 대신 노트 속지 인덱스 탭 + 얇은 북마크 클립)
const PageMarkersLayer = memo(function PageMarkersLayer({ spread }: { spread: Spread }) {
  const left = spread.cx - spread.width / 2;
  const right = spread.cx + spread.width / 2;
  const top = spread.cy - spread.height / 2;

  return (
    <Group>
      {/* 우측 속지 하단 미니멀 인덱스 탭 2개 (조각 비충돌 위치) */}
      <Rect x={right} y={top + spread.height * 0.72} width={8} height={28} color="#d8d5ce" />
      <Rect x={right} y={top + spread.height * 0.72} width={2.5} height={28} color="#c4622d" />
      <Rect x={right} y={top + spread.height * 0.82} width={8} height={28} color="#d8d5ce" />
      {/* 좌측 상단 가는 금속 북마크 클립 */}
      <RoundedRect
        x={left + 28}
        y={top - 6}
        width={12}
        height={24}
        r={6}
        color="#8c8881"
        style="stroke"
        strokeWidth={1.8}
      />
    </Group>
  );
});

// L5 간접 음영 (multiply) + L6 방향성 간접광 (screen) — light 변경은 여기에만 반영
function AtmosphereLayers({ size, light, sway }: { size: CanvasSize; light: LightMode; sway: number }) {
  const shift = Math.sin(sway) * 14;

  const lightSpec = useMemo(() => {
    if (light === 'morning') {
      return {
        shadeOpacity: 0.04,
        glowCenter: [0.84, 0.12] as const,
        glowColor: '#fff6e3',
        glowAlpha: 0.22,
        edgeAlpha: 0.04,
      };
    }
    if (light === 'night') {
      return {
        shadeOpacity: 0,
        glowCenter: [0.5, 0.44] as const,
        glowColor: '#ffe0b5',
        glowAlpha: 0.14,
        edgeAlpha: 0.18,
      };
    }
    return {
      shadeOpacity: 0.05,
      glowCenter: [0.16, 0.12] as const,
      glowColor: '#fff2d6',
      glowAlpha: 0.24,
      edgeAlpha: 0.05,
    };
  }, [light]);

  return (
    <>
      {/* L5 은은한 대각 간접 음영 (multiply) */}
      {lightSpec.shadeOpacity > 0 && (
        <Group blendMode="multiply" opacity={lightSpec.shadeOpacity} transform={[{ translateX: shift }]}>
          <Rect x={0} y={0} width={size.width} height={size.height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(size.width, size.height)}
              colors={[
                withAlpha(collageConfig.palette.shadow, 0.6),
                withAlpha(collageConfig.palette.shadow, 0),
                withAlpha(collageConfig.palette.shadow, 0.45),
              ]}
              positions={[0, 0.52, 1]}
            />
          </Rect>
        </Group>
      )}

      {/* L6 방향성 간접광 (screen) */}
      <Group blendMode="screen">
        <Fill>
          <RadialGradient
            c={vec(lightSpec.glowCenter[0] * size.width, lightSpec.glowCenter[1] * size.height)}
            r={Math.hypot(size.width, size.height) * 0.75}
            colors={[
              withAlpha(lightSpec.glowColor, lightSpec.glowAlpha),
              withAlpha(lightSpec.glowColor, lightSpec.glowAlpha * 0.3),
              'rgba(0,0,0,0)',
            ]}
            positions={[0, 0.48, 1]}
          />
        </Fill>
      </Group>

      {/* L6 가장자리 미세 셰이드 (multiply) */}
      <Group blendMode="multiply">
        <Fill>
          <RadialGradient
            c={vec(size.width * 0.5, size.height * 0.5)}
            r={Math.hypot(size.width, size.height) * 0.62}
            colors={[
              'rgba(255,255,255,1)',
              'rgba(255,255,255,1)',
              withAlpha(collageConfig.palette.shadow, lightSpec.edgeAlpha),
            ]}
            positions={[0, 0.72, 1]}
          />
        </Fill>
      </Group>
    </>
  );
}

export default function CollageScene({
  size,
  pieces,
  poses,
  light,
  reduceMotion,
  paper = 'plain',
}: CollageSceneProps) {
  const spread = useMemo(() => getSpread(size), [size]);
  const { unit } = useMemo(() => getDensity(size, pieces.length), [size, pieces.length]);
  const { surfaceRef, poses: livePoses, sway } = useCollageInteraction(
    size, spread, pieces, poses, reduceMotion, !reduceMotion && light !== 'night',
  );
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);

  const ordered = useMemo(() => {
    return [...livePoses]
      .sort((a, b) => a.z - b.z)
      .map((pose) => ({ pose, piece: byId.get(pose.id) }))
      .filter((entry): entry is { pose: InteractionPose; piece: PreviewPiece } => Boolean(entry.piece));
  }, [byId, livePoses]);

  return (
    <div ref={surfaceRef} data-collage-surface aria-hidden="true"
      style={{ width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <Canvas style={size}>
        <BackdropLayer />
        <SpreadLayer spread={spread} paper={paper} />
        <Group>
          {ordered.map(({ pose, piece }) => (
            <PieceNode key={piece.id} piece={piece} pose={pose} spread={spread} unit={unit} />
          ))}
        </Group>
        <PageMarkersLayer spread={spread} />
        <AtmosphereLayers size={size} light={light} sway={sway} />
      </Canvas>
    </div>
  );
}
