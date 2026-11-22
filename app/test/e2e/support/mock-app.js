// 데이터 상태 장치: 가짜 인증·API 응답을 한 곳에 둔다 (규격 개발산출물/프론트_정렬규격.md §7)
// spec 파일끼리 함수를 export하지 않는다 — 공용은 app/test/e2e/support/에만 둔다
// 템플릿 출처: ULevelP test/e2e/support/mock-app.js 구조(옵션으로 준 API만 응답, 나머지는 unknownApi)
'use strict';

const DEFAULT_ME = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'a@example.com',
  displayName: 'Tester',
  role: 'user',
};

const LONG_TITLE = 'A Very Long Title That Should Never Break The Card Layout Even On Narrow Screens';

const FIXTURES = {
  /** 긴 제목 항목 n개 */
  longItems(n = 5) {
    return Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000001${String(i + 1).padStart(2, '0')}`,
      title: `${i + 1} · ${LONG_TITLE}`,
      createdAt: '2026-01-01T00:00:00Z',
    }));
  },
};

// 화면 spec의 states에 키로 쓰는 표준 상태(§7-1)
const STATES = {
  guest: { auth: 'guest' },
  user: { auth: 'user', data: {} },
  userData: { auth: 'user', data: { '/api/v1/items': { items: FIXTURES.longItems(5) } } },
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

/**
 * 가짜 인증·API 응답을 건다. 옵션으로 준 API만 응답하고, 나머지 /api/v1/*는 unknownApi로 처리한다.
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {'guest'|'user'} [opts.auth='user']
 * @param {object} [opts.me] DEFAULT_ME 위에 덮어쓴다(auth 'user'일 때만 /api/v1/me 응답)
 * @param {Record<string, unknown>} [opts.data] 정확한 경로 → GET 응답 본문
 * @param {Record<string,string>} [opts.local] localStorage 미리 넣기
 * @param {Array<[Function|RegExp|string, Function]>} [opts.routes] 화면 전용 추가 응답(가장 나중에 등록 → 먼저 매칭)
 * @param {'empty'|'pass'} [opts.unknownApi='empty'] 모르는 /api/v1/*: 'empty'면 {} 200, 'pass'면 실제 서버로
 */
async function mockApp(page, opts = {}) {
  const auth = opts.auth || 'user';
  const me = { ...DEFAULT_ME, ...(opts.me || {}) };

  if (opts.local) {
    await page.addInitScript((entries) => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, Object.entries(opts.local));
  }

  // 외부 요청 0을 목표로 인증/외부 CDN 스텁을 필요 시 여기에 추가한다.

  // 나중에 등록한 route가 먼저 매칭된다: 모르는 API부터
  if ((opts.unknownApi || 'empty') === 'empty') {
    await page.route((url) => url.pathname.startsWith('/api/v1/'), (route) => json(route, {}));
  }
  if (auth === 'user') {
    await page.route((url) => url.pathname === '/api/v1/me', (route) => json(route, me));
  } else {
    await page.route((url) => url.pathname === '/api/v1/me', (route) =>
      json(route, { error: { code: 'AUTH_REQUIRED', message: '로그인이 필요해요.', detail: '' } }, 401)
    );
  }
  for (const [p, body] of Object.entries(opts.data || {})) {
    await page.route((url) => url.pathname === p, (route) => json(route, body));
  }
  for (const [match, handler] of opts.routes || []) {
    await page.route(match, handler);
  }
}

module.exports = { mockApp, STATES, FIXTURES, DEFAULT_ME, LONG_TITLE, json };
