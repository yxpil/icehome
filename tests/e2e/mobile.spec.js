import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '移动端布局在手机视口验证');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('总览');
});

test('移动端默认收起侧栏，抽屉式导航可用', async ({ page }) => {
  const sidebar = page.locator('aside').first();
  await expect(page.getByRole('button', { name: '打开导航' })).toBeVisible();
  await expect(sidebar).not.toBeInViewport();

  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(sidebar).toBeInViewport();
  await expect(sidebar.getByText('设备分类')).toBeVisible();

  await sidebar.locator('.nav-row').filter({ hasText: '系统状态' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('系统状态');
  await expect(sidebar).not.toBeInViewport();
});

test('移动端设备卡与抽屉可操作', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('总览');
  await page.getByText('客厅主灯', { exact: true }).first().click();
  const drawer = page.locator('aside').nth(1);
  await expect(drawer.getByText('状态控制')).toBeVisible();
  await expect(drawer.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: '完成', exact: true }).click();
  await expect(drawer).toHaveCount(0);
});

test('视觉快照：手机端', async ({ page }, testInfo) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/shots/mobile-overview.png', fullPage: true });

  await page.getByRole('button', { name: '打开导航' }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/shots/mobile-nav.png' });
  await testInfo.attach('mobile', { path: 'test-results/shots/mobile-overview.png', contentType: 'image/png' });

  const text = await page.locator('body').innerText();
  expect(EMOJI.test(text)).toBe(false);
});
