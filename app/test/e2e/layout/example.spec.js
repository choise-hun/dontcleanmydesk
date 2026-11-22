// 화면 정렬 검사 예시: 공통 검사 G0~G8 × 상태 × 4개 폭 + 다크 1개
// 규격: 개발산출물/프론트_정렬규격.md §8. 첫 화면(S-01, S-02) E2E 도입 시 <화면>.spec.js로 복사해 고친다.
'use strict';
const { layoutSuite } = require('../support/layout-check');

layoutSuite({
  name: 'home',
  path: '/',
  states: ['guest', 'userData'],
  ready: async (page) => {
    await page.locator('main').waitFor();
  },
  dark: 'userData',
});
