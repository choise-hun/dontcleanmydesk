// WP-1-1 웹 콜라주 분위기 프로토타입 라우트 (/collage-preview)
// @ts-expect-error Expo web CSS side-effect import (no global *.css d.ts in repo)
import '@/styles/tokens.css';

import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ComponentType, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ITEM_TYPE_LABEL } from '@/core/types';
import {
  collageConfig,
  getFixturePieces,
  placePieces,
  type CanvasSize,
  type FixtureMode,
  type LightMode,
  type PaperMode,
  type PiecePose,
} from '@/desk/preview/collageLayout';
import type { CollageSceneProps } from '@/desk/preview/CollageScene';
// @ts-expect-error Expo web CSS Module import (no global *.module.css d.ts in repo)
import rawStyles from '@/desk/preview/collage-preview.module.css';

const styles = rawStyles as Record<string, string>;

type SceneComponent = ComponentType<CollageSceneProps>;
type LoadState = 'loading' | 'ready' | 'error';

let skiaBootPromise: Promise<void> | null = null;
function ensureSkiaBoot(): Promise<void> {
  skiaBootPromise ??= LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
  return skiaBootPromise;
}

// 라우트 청크 평가 시점에 CanvasKit WASM 로드를 즉시 시작해 React 마운트·effect 대기를 제거한다(DEF-004).
if (typeof window !== 'undefined' && window.location?.pathname === '/collage-preview') {
  ensureSkiaBoot().catch(() => {});
}

function parseFixture(raw: string | string[] | undefined): FixtureMode {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'empty' || v === 'performance') return v;
  return 'default';
}

function parseLight(raw: string | string[] | undefined): LightMode {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'morning' || v === 'night') return v;
  return 'afternoon';
}

function parsePaper(raw: string | string[] | undefined): PaperMode {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'grid') return 'grid';
  return 'plain';
}

export default function CollagePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fixture?: string; light?: string; paper?: string }>();
  const fixtureMode = parseFixture(params.fixture);
  const lightMode = parseLight(params.light);
  const paperMode = parsePaper(params.paper);

  const pieces = useMemo(() => getFixturePieces(fixtureMode), [fixtureMode]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const genRef = useRef(0);

  const [viewport, setViewport] = useState<{ size: CanvasSize; seedSize: CanvasSize; fixture: FixtureMode } | null>(null);
  const size = viewport?.size;
  const seedSize = viewport?.fixture === fixtureMode ? viewport.seedSize : null;
  const [SceneComp, setSceneComp] = useState<SceneComponent | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [listOpen, setListOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  // prefers-reduced-motion 구독
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 컨테이너 실제 CSS px 크기 측정
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) {
        setViewport((prev) => {
          if (prev?.fixture === fixtureMode && prev.size.width === w && prev.size.height === h) return prev;
          const next = { width: w, height: h };
          return { size: next, seedSize: prev?.fixture === fixtureMode ? prev.seedSize : next, fixture: fixtureMode };
        });
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixtureMode]);

  // CanvasKit WASM + CollageScene 지연 로딩 (세대 번호로 stale 응답 차단)
  useEffect(() => {
    let alive = true;
    const myGen = ++genRef.current;

    ensureSkiaBoot()
      .then(() => import('@/desk/preview/CollageScene'))
      .then((mod) => {
        if (!alive || genRef.current !== myGen) return;
        setSceneComp(() => mod.default);
        setLoadState('ready');
      })
      .catch(() => {
        if (!alive || genRef.current !== myGen) return;
        setLoadState('error');
      });

    return () => {
      alive = false;
    };
  }, []);

  // 배치 계산 (실패 시 error 상태 전환)
  const layoutResult = useMemo<{ poses: readonly PiecePose[] | null; failed: boolean }>(() => {
    if (!seedSize) return { poses: null, failed: false };
    try {
      const poses = placePieces(seedSize, pieces, collageConfig.seed);
      return { poses, failed: false };
    } catch {
      return { poses: null, failed: true };
    }
  }, [seedSize, pieces]);

  const effectiveState: LoadState =
    loadState === 'error' || layoutResult.failed
      ? 'error'
      : loadState === 'ready' && SceneComp && size && layoutResult.poses
        ? 'ready'
        : 'loading';

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.replace('/');
  };

  return (
    <main id="collage-preview" className={styles.root}>
      <nav className={styles.nav} aria-label="콜라주 미리보기 탐색">
        <a
          href="/"
          onClick={handleHomeClick}
          className={styles.navControl}
          data-align-group="collageNav:top,height"
        >
          홈으로
        </a>
        <button
          type="button"
          className={`${styles.navControl} ${listOpen ? styles.navControlActive : ''}`}
          data-align-group="collageNav:top,height"
          aria-expanded={effectiveState === 'error' ? true : listOpen}
          aria-controls="collage-piece-list"
          onClick={() => setListOpen((prev) => !prev)}
        >
          순서 보기
        </button>
      </nav>

      <div ref={stageRef} className={styles.stage} aria-hidden={effectiveState !== 'ready'}>
        {effectiveState === 'ready' && SceneComp && size && layoutResult.poses && (
          <SceneComp
            size={size}
            pieces={pieces}
            poses={layoutResult.poses}
            light={lightMode}
            reduceMotion={reduceMotion}
            paper={paperMode}
          />
        )}
      </div>

      {effectiveState === 'loading' && (
        <section className={styles.centerOverlay} role="status" aria-live="polite">
          <div className={styles.statusCard}>
            <div className={styles.coverMotif} aria-hidden="true">
              <div className={styles.coverSpine} />
            </div>
            <p className={styles.statusText}>콜라주를 펼치는 중…</p>
          </div>
        </section>
      )}

      {effectiveState === 'ready' && pieces.length === 0 && (
        <section className={styles.centerOverlay} aria-live="polite">
          <div className={styles.statusCard}>
            <p className={styles.emptyPrompt}>첫 조각을 끼워 보세요</p>
          </div>
        </section>
      )}

      {effectiveState === 'error' ? (
        <section className={styles.errorContainer} aria-label="콜라주 대체 순서 보기">
          <div className={styles.errorBanner} role="alert">
            콜라주를 펼치지 못했어요. 순서 보기로 표시합니다.
          </div>
          <div id="collage-piece-list" className={styles.errorListCard}>
            <h2 className={styles.listHeading}>순서 보기</h2>
            {pieces.length === 0 ? (
              <p className={styles.emptyListNote}>표시할 조각이 없습니다.</p>
            ) : (
              <ol className={styles.pieceList}>
                {pieces.map((p) => (
                  <li key={p.id} className={styles.pieceItem}>
                    <div className={styles.pieceHeader}>
                      <span className={styles.pieceTitle}>{p.title}</span>
                      <span className={styles.pieceType}>{ITEM_TYPE_LABEL[p.type]}</span>
                    </div>
                    <p className={styles.pieceCaption}>{p.caption}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ) : (
        <aside
          id="collage-piece-list"
          className={`${styles.listPanel} ${listOpen ? '' : styles.listPanelHidden}`}
          hidden={!listOpen}
          aria-label="조각 순서 목록"
        >
          <h2 className={styles.listHeading}>순서 보기</h2>
          {pieces.length === 0 ? (
            <p className={styles.emptyListNote}>표시할 조각이 없습니다.</p>
          ) : (
            <ol className={styles.pieceList}>
              {pieces.map((p) => (
                <li key={p.id} className={styles.pieceItem}>
                  <div className={styles.pieceHeader}>
                    <span className={styles.pieceTitle}>{p.title}</span>
                    <span className={styles.pieceType}>{ITEM_TYPE_LABEL[p.type]}</span>
                  </div>
                  <p className={styles.pieceCaption}>{p.caption}</p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}
    </main>
  );
}
