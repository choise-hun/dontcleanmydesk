'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { checkLayout, WIDTHS } = require('../support/layout-check');

const BASE_URL = (process.env.WP1_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
const PREVIEW_URL = `${BASE_URL}/collage-preview`;
const SHOTS_DIR = path.join(process.cwd(), 'test-results', 'layout-shots');

async function saveShot(page, name) {
  if (process.env.LAYOUT_SHOTS !== '1') return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function waitForPreviewReady(page) {
  const main = page.locator('main#collage-preview');
  await expect(main).toBeVisible({ timeout: 20000 });
  const canvas = main.locator('canvas');
  await expect(canvas).toHaveCount(1, { timeout: 20000 });
  await expect(canvas.first()).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function relativeLuminance(rgb) {
  const toLin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

async function assertPreviewControlsAndTokens(page) {
  const info = await page.evaluate(() => {
    const parse = (s) => {
      const m = (s || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const main = document.querySelector('main#collage-preview');
    const home = main ? main.querySelector('a[data-align-group*="collageNav"]') : null;
    const toggle = main ? main.querySelector('button[aria-expanded][aria-controls]') : null;
    const hr = home ? home.getBoundingClientRect() : null;
    const tr = toggle ? toggle.getBoundingClientRect() : null;
    const hs = home ? getComputedStyle(home) : null;
    const ts = toggle ? getComputedStyle(toggle) : null;
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      hasMain: Boolean(main),
      hasHome: Boolean(home),
      hasToggle: Boolean(toggle),
      homeText: home ? home.textContent.trim() : '',
      toggleText: toggle ? toggle.textContent.trim() : '',
      homeRect: hr ? { w: hr.width, h: hr.height, top: hr.top } : null,
      toggleRect: tr ? { w: tr.width, h: tr.height, top: tr.top } : null,
      homeFg: hs ? parse(hs.color) : null,
      homeBg: hs ? parse(hs.backgroundColor) : null,
      toggleFg: ts ? parse(ts.color) : null,
      toggleBg: ts ? parse(ts.backgroundColor) : null,
      tokenBg: rootStyle.getPropertyValue('--bg').trim(),
      tokenInk: rootStyle.getPropertyValue('--ink').trim(),
      scrollOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(info.hasMain, 'main#collage-preview 존재').toBe(true);
  expect(info.hasHome, '홈으로 링크 존재').toBe(true);
  expect(info.hasToggle, '순서 보기 버튼 존재').toBe(true);
  expect(info.homeText).toBe('홈으로');
  expect(info.toggleText).toBe('순서 보기');
  expect(info.homeRect.w).toBeGreaterThanOrEqual(44);
  expect(info.homeRect.h).toBeGreaterThanOrEqual(44);
  expect(info.toggleRect.w).toBeGreaterThanOrEqual(44);
  expect(info.toggleRect.h).toBeGreaterThanOrEqual(44);
  expect(Math.abs(info.homeRect.top - info.toggleRect.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(info.homeRect.h - info.toggleRect.h)).toBeLessThanOrEqual(1);
  expect(info.tokenBg).not.toBe('');
  expect(info.tokenInk).not.toBe('');
  expect(info.scrollOverflow).toBeLessThanOrEqual(1);
  if (info.homeFg && info.homeBg) {
    expect(contrastRatio(info.homeFg, info.homeBg)).toBeGreaterThanOrEqual(4.5);
  }
  if (info.toggleFg && info.toggleBg) {
    expect(contrastRatio(info.toggleFg, info.toggleBg)).toBeGreaterThanOrEqual(4.5);
  }
}

test.describe('WP-1-1 /collage-preview 레이아웃·상태·변형', () => {
  for (const width of WIDTHS) {
    test(`W1-01 정상 상태 ${width}px 레이아웃·토큰·정렬`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(PREVIEW_URL, { waitUntil: 'load' });
      await waitForPreviewReady(page);
      await assertPreviewControlsAndTokens(page);

      const res = await checkLayout(page, { width });
      expect(res.fails, `G0~G8 실패 (${width}px)`).toEqual([]);
      await saveShot(page, `collage-preview-default-${width}`);
    });
  }

  test('W1-01 다크 모드 1280px 레이아웃·대비', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(PREVIEW_URL, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    await assertPreviewControlsAndTokens(page);

    const res = await checkLayout(page, { width: 1280 });
    expect(res.fails, 'G0~G8 실패 (1280px dark)').toEqual([]);
    await saveShot(page, 'collage-preview-default-1280-dark');
  });

  test('W1-02 순서 보기 토글 및 기본(10)·빈(0) fixture', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PREVIEW_URL, { waitUntil: 'load' });
    await waitForPreviewReady(page);

    const toggle = page.locator('main#collage-preview button[aria-expanded][aria-controls]');
    const listId = await toggle.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const listPanel = page.locator(`#${listId}`);

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(listPanel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(listPanel).toBeVisible();
    await expect(listPanel.locator('li')).toHaveCount(10);
    await saveShot(page, 'collage-preview-list-open-1280');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(listPanel).toBeHidden();

    await page.goto(`${PREVIEW_URL}?fixture=empty`, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    await expect(page.getByText('첫 조각을 끼워 보세요')).toBeVisible();
    await toggle.click();
    await expect(listPanel.locator('li')).toHaveCount(0);
    await saveShot(page, 'collage-preview-empty-1280');
  });

  test('W1-02 성능(15) fixture 및 노트 내부 모눈(grid) 속지 프리셋', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${PREVIEW_URL}?fixture=performance`, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    const toggle = page.locator('main#collage-preview button[aria-expanded][aria-controls]');
    const listId = await toggle.getAttribute('aria-controls');
    await toggle.click();
    await expect(page.locator(`#${listId} li`)).toHaveCount(15);

    await page.goto(`${PREVIEW_URL}?paper=grid`, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    await saveShot(page, 'collage-preview-paper-grid-1280');
  });

  for (const light of ['morning', 'afternoon', 'night']) {
    test(`W1-02 조명 변형 ${light}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${PREVIEW_URL}?light=${light}`, { waitUntil: 'load' });
      await waitForPreviewReady(page);
      await saveShot(page, `collage-preview-light-${light}-1280`);
    });
  }

  test('W1-03 WASM 로딩 보류 → 해제 정상 전환', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let releaseWasm;
    const wasmGate = new Promise((resolve) => {
      releaseWasm = resolve;
    });
    let sawWasm = false;

    await page.route('**/canvaskit.wasm*', async (route) => {
      sawWasm = true;
      await wasmGate;
      await route.continue();
    });

    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    const status = page.locator('main#collage-preview [role="status"]');
    await expect(status).toBeVisible({ timeout: 15000 });
    await expect(status).toContainText('콜라주를 펼치는 중…');
    await saveShot(page, 'collage-preview-loading-1280');

    releaseWasm();
    await waitForPreviewReady(page);
    expect(sawWasm).toBe(true);
    await context.close();
  });

  test('W1-03 별도 컨텍스트에서 WASM 실패 주입 시 실패 안내와 DOM 순서 목록 표시', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.route('**/canvaskit.wasm*', async (route) => {
      await route.abort('failed');
    });

    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    const alert = page.locator('main#collage-preview [role="alert"]');
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(alert).toContainText('콜라주를 펼치지 못했어요. 순서 보기로 표시합니다.');
    await expect(page.locator('main#collage-preview canvas')).toHaveCount(0);
    await expect(page.locator('main#collage-preview li')).toHaveCount(10);
    await saveShot(page, 'collage-preview-error-1280');
    await context.close();
  });

  test('W1-03 WASM 보류 중 홈 이탈 시 늦은 응답이 떠난 화면을 커밋하지 않음', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    let releaseWasm;
    const wasmGate = new Promise((resolve) => {
      releaseWasm = resolve;
    });

    await page.route('**/canvaskit.wasm*', async (route) => {
      await wasmGate;
      await route.continue();
    });

    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main#collage-preview [role="status"]')).toBeVisible({ timeout: 15000 });

    await page.locator('main#collage-preview a', { hasText: '홈으로' }).click();
    await expect(page.locator('main#collage-preview')).toHaveCount(0, { timeout: 10000 });

    releaseWasm();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator('main#collage-preview')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('W1-04 홈(/) 초기 로드에 canvaskit.wasm 미포함, /collage-preview 진입 시 로드', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const homeRequests = [];
    const previewRequests = [];
    let phase = 'home';

    page.on('request', (req) => {
      if (phase === 'home') homeRequests.push(req.url());
      else previewRequests.push(req.url());
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    expect(homeRequests.some((u) => /canvaskit\.wasm/i.test(u))).toBe(false);

    phase = 'preview';
    await page.goto(PREVIEW_URL, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    expect(previewRequests.some((u) => /canvaskit\.wasm/i.test(u))).toBe(true);
    await context.close();
  });
});
