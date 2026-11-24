'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { checkLayout, WIDTHS } = require('../support/layout-check');

const BASE_URL = (process.env.WP1_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
const PREVIEW_URL = `${BASE_URL}/collage-preview`;
const SHOTS_DIR = path.join(process.cwd(), 'test-results', 'layout-shots');
const SURFACE = '[data-collage-surface]';

async function observePoses(page) {
  await page.addInitScript(() => {
    window.collageFrames = 0;
    document.addEventListener('collage-poses', (event) => {
      const { poses, spread } = event.detail;
      const rect = event.target.getBoundingClientRect();
      window.collageFrame = {
        width: rect.width,
        height: rect.height,
        poses: poses.map((pose) => ({
          ...pose,
          px: pose.x * spread.width + spread.cx,
          py: pose.y * spread.width + spread.cy,
        })),
      };
      window.collageFrames++;
    });
  });
}

function readFrame(page) {
  return page.evaluate(() => window.collageFrame);
}

function topPose(frame) {
  return frame.poses.reduce((top, pose) => pose.z > top.z ? pose : top);
}

async function frames(page, count) {
  await page.evaluate((n) => new Promise((resolve) => {
    function step() {
      if (--n === 0) resolve();
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }), count);
}

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

  test('W1-04 홈 초기 JS의 Matter 및 WASM 분리와 4G 진입 계측', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const homeRequests = [];
    const previewRequests = [];
    const homeScripts = [];
    let sceneScript;
    let phase = 'home';

    await observePoses(page);
    page.on('request', (req) => {
      if (phase === 'home') homeRequests.push(req.url());
      else previewRequests.push(req.url());
    });
    page.on('response', (response) => {
      const url = response.url();
      if (phase === 'home' && /\/_expo\/static\/js\/.*\.js$/.test(url)) {
        homeScripts.push({ url, body: response.text() });
      }
      if (phase === 'preview' && /\/CollageScene-.*\.js$/.test(url)) sceneScript = response.text();
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    expect(homeRequests.some((u) => /canvaskit\.wasm/i.test(u))).toBe(false);
    const scripts = await Promise.all(homeScripts.map(async ({ url, body }) => ({
      name: new URL(url).pathname.split('/').pop(), code: await body,
    })));
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter(({ code }) => /matter-js/.test(code))).toEqual([]);
    const skia = scripts.filter(({ code }) => /MakeWebGLCanvasSurface/.test(code)).map(({ name }) => name);

    phase = 'preview';
    await page.goto(PREVIEW_URL, { waitUntil: 'load' });
    await waitForPreviewReady(page);
    expect(previewRequests.some((u) => /canvaskit\.wasm/i.test(u))).toBe(true);
    expect(await sceneScript).toMatch(/matter-js/);
    await context.close();

    const measured = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const measurePage = await measured.newPage();
    const cdp = await measured.newCDPSession(measurePage);
    // 4 Mbit/s down, 1 Mbit/s up, 50 ms added latency, with an initially empty HTTP cache.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 50, downloadThroughput: 500000, uploadThroughput: 125000, connectionType: 'cellular4g',
    });
    await measurePage.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(measurePage);
    const cold = await measurePage.evaluate(() => performance.now());
    // Keep the context and HTTP cache while starting a new document.
    await measurePage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await measurePage.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(measurePage);
    const warm = await measurePage.evaluate(() => performance.now());
    expect(cold).toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(0);
    console.log(JSON.stringify({ home: scripts.map(({ name }) => name), skia, preview: previewRequests
      .filter((url) => /CollageScene-|canvaskit\.wasm/.test(url)).map((url) => new URL(url).pathname),
    coldMs: Math.round(cold), warmMs: Math.round(warm), coldGoalMet: cold <= 3000, warmGoalMet: warm <= 1000 }));
    await measured.close();
  });
});

test('W1-06 마우스 캡처·오프셋·관성·경계와 resize/blur/재진입', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await observePoses(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${PREVIEW_URL}?light=night`);
  await waitForPreviewReady(page);
  const initial = await readFrame(page);
  const top = topPose(initial);
  const surface = page.locator(SURFACE);
  const pointerAt = { x: top.px + 6, y: top.py + 4 };
  await page.mouse.move(pointerAt.x, pointerAt.y);
  await page.mouse.down();
  await page.mouse.move(pointerAt.x + 7, pointerAt.y);
  await page.mouse.up();
  await frames(page, 3);
  expect(await readFrame(page)).toEqual(initial);

  await page.mouse.move(pointerAt.x, pointerAt.y);
  await page.mouse.down();
  await page.mouse.move(pointerAt.x + 42, pointerAt.y, { steps: 3 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await expect.poll(async () => topPose(await readFrame(page)).px).toBeCloseTo(top.px + 42);
  const held = topPose(await readFrame(page));
  expect(held.px).toBeCloseTo(top.px + 42);
  expect(held.py).toBeCloseTo(top.py);
  expect(held.z).toBe(top.z + 1);
  expect(await surface.evaluate((el) => el.hasPointerCapture(1))).toBe(true);
  await saveShot(page, 'collage-preview-held-1280');
  // Move and release over the nav, outside the surface's normal hit target.
  const cdp = await page.context().newCDPSession(page);
  await page.mouse.move(1180, 35, { steps: 8 });
  const stamp = Date.now() / 1000;
  for (const [type, x, offset] of [['mouseMoved', 1210, 0], ['mouseMoved', 1250, 0.015], ['mouseReleased', 1250, 0.02]]) {
    await cdp.send('Input.dispatchMouseEvent', {
      type, x, y: 35, button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, force: type === 'mouseReleased' ? 0 : 0.5,
      timestamp: stamp + offset,
    });
  }
  await page.mouse.up();
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  expect(await surface.evaluate((el) => el.hasPointerCapture(1))).toBe(false);
  await expect.poll(async () => topPose(await readFrame(page)).px).toBeCloseTo(1280, 0);
  await frames(page, 12);
  const boundary = topPose(await readFrame(page));
  expect(boundary.py).toBeGreaterThanOrEqual(0);
  expect(boundary.py).toBeLessThanOrEqual(900);

  await page.mouse.move(Math.min(boundary.px - 10, 1255), Math.max(boundary.py + 20, 80));
  await page.mouse.down();
  await page.mouse.move(1110, 230);
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await expect.poll(async () => topPose(await readFrame(page)).py).toBeGreaterThan(90);
  const beforeResize = topPose(await readFrame(page));
  await page.setViewportSize({ width: 1150, height: 900 });
  await expect.poll(async () => (await readFrame(page)).width).toBe(1150);
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  await page.mouse.up();
  const resized = topPose(await readFrame(page));
  expect(resized.x).toBeCloseTo(beforeResize.x);
  expect(resized.y).toBeCloseTo(beforeResize.y);
  expect(resized).toMatchObject({ id: beforeResize.id, z: beforeResize.z, scale: beforeResize.scale, rotation: beforeResize.rotation });

  await page.mouse.move(resized.px, resized.py);
  await page.mouse.down();
  await page.mouse.move(resized.px - 90, resized.py);
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  const stopped = await readFrame(page);
  const stoppedFrames = await page.evaluate(() => window.collageFrames);
  await page.mouse.up();
  await frames(page, 15);
  expect(await readFrame(page)).toEqual(stopped);
  expect(await page.evaluate(() => window.collageFrames)).toBe(stoppedFrames);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  const resume = topPose(stopped);
  await page.mouse.move(resume.px, resume.py);
  await page.mouse.down();
  await page.mouse.move(resume.px - 45, resume.py);
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  const tabHidden = await readFrame(page);
  await page.mouse.up();
  await frames(page, 5);
  expect(await readFrame(page)).toEqual(tabHidden);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const visible = topPose(tabHidden);
  await page.mouse.move(visible.px, visible.py);
  await page.mouse.down();
  await page.mouse.move(visible.px - 35, visible.py);
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  const home = page.locator('main#collage-preview a', { hasText: '홈으로' });
  await home.press('Enter');
  await expect(surface).toHaveCount(0);
  const framesAfterLeave = await page.evaluate(() => window.collageFrames);
  await page.mouse.up();
  await frames(page, 5);
  expect(await page.evaluate(() => window.collageFrames)).toBe(framesAfterLeave);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${PREVIEW_URL}?light=night`);
  await waitForPreviewReady(page);
  expect(await readFrame(page)).toEqual(initial);
  expect(errors).toEqual([]);
});

test('W1-06 실제 터치 두 개·pointercancel·예기치 않은 capture 해제와 0크기 복귀', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await observePoses(page);
  await page.goto(PREVIEW_URL);
  await waitForPreviewReady(page);
  const { px, py } = topPose(await readFrame(page));
  const cdp = await context.newCDPSession(page);
  const touch = (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const primary = { x: px, y: py, id: 0 };
  const secondary = { x: 200, y: 430, id: 1 };
  await touch('touchStart', primary);
  await touch('touchMove', { ...primary, x: px - 27 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await expect.poll(async () => topPose(await readFrame(page)).px).toBeCloseTo(px - 27);
  const held = topPose(await readFrame(page));
  await saveShot(page, 'collage-preview-held-390');
  await touch('touchStart', { ...primary, x: px - 27 }, secondary);
  await touch('touchMove', { ...primary, x: px - 27 }, { ...secondary, x: 245 });
  await frames(page, 5);
  expect(topPose(await readFrame(page))).toEqual(held);
  await touch('touchCancel');
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  const cancelled = await readFrame(page);
  await frames(page, 12);
  expect(await readFrame(page)).toEqual(cancelled);

  const surface = page.locator(SURFACE);
  const point = { x: held.px, y: held.py, id: 2 };
  await surface.evaluate((el) => el.addEventListener('gotpointercapture', (event) => {
    el.dataset.capturedPointer = event.pointerId;
  }, { once: true }));
  await touch('touchStart', point);
  await touch('touchMove', { ...point, x: point.x - 25 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await surface.evaluate((el) => el.releasePointerCapture(Number(el.dataset.capturedPointer)));
  // Chromium dispatches lostpointercapture as it processes the next touch event.
  await touch('touchMove', { ...point, x: point.x - 33 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  await touch('touchEnd');
  const captureLost = await readFrame(page);
  await frames(page, 10);
  expect(await readFrame(page)).toEqual(captureLost);

  const m = topPose(captureLost);
  await touch('touchStart', { x: m.px, y: m.py, id: 3 });
  await touch('touchMove', { x: m.px - 12, y: m.py, id: 3 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await expect.poll(async () => topPose(await readFrame(page)).px).toBeCloseTo(m.px - 12);
  const beforeCollapse = topPose(await readFrame(page));
  await surface.evaluate((el) => { el.parentElement.style.height = '0px'; });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  await touch('touchEnd');
  await surface.evaluate((el) => { el.parentElement.style.removeProperty('height'); });
  await expect(surface).toBeVisible();
  await frames(page, 10);
  expect(topPose(await readFrame(page))).toEqual({ ...beforeCollapse, lift: 0 });

  const releasedX = beforeCollapse.px + 38;
  await touch('touchStart', { x: beforeCollapse.px, y: beforeCollapse.py, id: 4 });
  await touch('touchMove', { x: releasedX, y: beforeCollapse.py, id: 4 });
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(1);
  await expect.poll(async () => topPose(await readFrame(page)).px).toBeCloseTo(releasedX);
  await touch('touchEnd');
  await expect.poll(async () => topPose(await readFrame(page)).lift).toBe(0);
  const reduced = await readFrame(page);
  await frames(page, 12);
  expect(await readFrame(page)).toEqual(reduced);
  expect(topPose(reduced).px).toBeCloseTo(releasedX);

  // A positive but extremely small resize must keep the landed pieces, even
  // though that size cannot generate a fresh WP-1-1 seed layout.
  await surface.evaluate((el) => { el.parentElement.style.height = '1px'; });
  await expect.poll(async () => (await readFrame(page)).height).toBe(1);
  await expect(surface).toHaveCount(1);
  const clamped = await readFrame(page);
  expect(clamped.poses).toHaveLength(10);
  expect(clamped.poses.every(({ py }) => py >= 0 && py <= 1)).toBe(true);
  expect(topPose(clamped)).toMatchObject({ id: beforeCollapse.id, z: topPose(reduced).z });
  await surface.evaluate((el) => { el.parentElement.style.removeProperty('height'); });
  await expect.poll(async () => (await readFrame(page)).height).toBe(844);
  await context.close();
});

test('W1-07 기본 10개와 성능 15개에서 각각 30초 동안 던지기·밀기 계측', async ({ page, browser }) => {
  test.setTimeout(95000);
  await observePoses(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [query, count] of [['', 10], ['?fixture=performance', 15]]) {
    await page.goto(PREVIEW_URL + query);
    await waitForPreviewReady(page);
    expect((await readFrame(page)).poses).toHaveLength(count);
    await page.evaluate(() => {
      window.collagePerf = new Promise((resolve) => {
        const intervals = [];
        let start;
        let previous;
        function step(now) {
          start ??= now;
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (now - start < 30000) {
            requestAnimationFrame(step);
          } else {
            const fps = intervals.length * 1000 / (now - start);
            const p95 = intervals.sort((a, b) => a - b)[Math.ceil(intervals.length * 0.95) - 1];
            resolve({ fps, p95 });
          }
        }
        requestAnimationFrame(step);
      });
    });
    let done = false;
    const measured = page.evaluate(() => window.collagePerf).then((result) => {
      done = true;
      return result;
    });
    let drags = 0;
    let pushes = 0;
    let throws = 0;
    while (!done) {
      const before = await readFrame(page);
      const top = topPose(before);
      const target = before.poses.filter((pose) => pose.id !== top.id && pose.px > 90 && pose.px < 1190 &&
        pose.py > 100 && pose.py < 800).sort((a, b) => a.id.localeCompare(b.id))[drags % (count - 1)];
      const endX = target?.px ?? 640;
      const endY = target?.py ?? 450;
      const startX = Math.min(1278, Math.max(2, top.px));
      const startY = Math.min(898, Math.max(65, top.py));
      const direction = endX > 640 ? 1 : -1;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX - direction * 45, endY, { steps: 6 });
      await frames(page, 2);
      const held = await readFrame(page);
      if (topPose(held).lift === 1) {
        drags++;
        if (held.poses.some((pose, i) => pose.id !== top.id &&
          Math.hypot(pose.px - before.poses[i].px, pose.py - before.poses[i].py) > 1)) pushes++;
      }
      await page.mouse.move(endX, endY);
      await page.mouse.up();
      const released = topPose(await readFrame(page));
      await frames(page, 8);
      const after = topPose(await readFrame(page));
      if (!after.lift && Math.hypot(after.px - released.px, after.py - released.py) > 1) throws++;
    }
    const { fps, p95 } = await measured;
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector('[data-collage-surface] canvas').getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    });
    console.log(JSON.stringify({ count, fps, p95, drags, pushes, throws, renderer, browser: browser.version(),
      platform: process.platform, viewport: page.viewportSize() }));
    expect.soft(drags).toBeGreaterThanOrEqual(10);
    expect.soft(pushes).toBeGreaterThan(0);
    expect.soft(throws).toBeGreaterThan(0);
    expect.soft(Math.round(fps)).toBeGreaterThanOrEqual(60);
    expect.soft(p95).toBeLessThanOrEqual(20);
  }
});
