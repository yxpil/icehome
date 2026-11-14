import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '主流程在桌面视口验证');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('首屏：左右布局与侧栏卡片', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('总览');

  const sidebar = page.locator('aside').first();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('ICEHOME', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('设备分类')).toBeVisible();
  await expect(sidebar.getByText('控制台')).toBeVisible();
  await expect(sidebar.locator('.nav-row').filter({ hasText: '系统状态' })).toBeVisible();
  await expect(sidebar.getByText('添加配对')).toBeVisible();

  for (const category of ['客厅', '卧室', '厨房', '安防']) {
    await expect(sidebar.getByText(category, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('设备总数')).toBeVisible();
  await expect(page.getByText('在线设备')).toBeVisible();
  await expect(page.getByText('最近事件')).toBeVisible();

  // 全部图标必须是 SVG，界面文字不得出现 emoji。
  const svgCount = await page.locator('svg').count();
  expect(svgCount).toBeGreaterThan(10);
  const text = await page.locator('body').innerText();
  expect(EMOJI.test(text)).toBe(false);

  await page.screenshot({ path: 'test-results/shots/desktop-overview.png', fullPage: true });
});

test('分类卡片可切换设备范围', async ({ page }) => {
  await page.locator('aside').first().getByText('客厅', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('客厅');
  await expect(page.getByText('客厅主灯')).toBeVisible();
  await expect(page.getByText('主卧顶灯')).toHaveCount(0);

  await page.locator('aside').first().getByText('卧室', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('卧室');
  await expect(page.getByText('主卧顶灯')).toBeVisible();
});

test('设备抽屉可控制开关', async ({ page }) => {
  await page.getByText('客厅主灯', { exact: true }).first().click();
  const drawer = page.locator('aside').nth(1);
  await expect(drawer.getByText('基础信息')).toBeVisible();
  await expect(drawer.getByText('状态控制')).toBeVisible();

  await drawer.getByRole('button', { name: '开启', exact: true }).last().click();
  await expect(page.getByText('已开启', { exact: true }).first()).toBeVisible();

  await drawer.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('switch', { name: '切换 客厅主灯' })).toHaveAttribute('aria-checked', 'true');
});

test('新建设备分类并同步到侧栏', async ({ page }) => {
  await page.locator('aside').first().getByRole('button', { name: '管理分类' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('设备分类');
  await page.getByRole('button', { name: '新建分类' }).first().click();
  await page.getByPlaceholder('例如：书房').fill('书房');
  await page.getByPlaceholder('可选').fill('E2E 阅读区');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('分类已创建')).toBeVisible();
  await expect(page.locator('main').getByText('书房', { exact: true })).toBeVisible();
  await expect(page.locator('aside').first().getByText('书房', { exact: true })).toBeVisible();
});

test('新建定时任务', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '定时任务' }).click();
  await page.getByRole('button', { name: '新建任务' }).first().click();
  await page.getByPlaceholder('例如：夜间关灯').fill('E2E 夜间关灯');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText('任务已创建')).toBeVisible();
  await expect(page.getByText('E2E 夜间关灯')).toBeVisible();
  await expect(page.getByText('每天 22:00').first()).toBeVisible();
});

test('签发 OpenAI 风格令牌', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: 'API 令牌' }).click();
  await page.getByRole('button', { name: '签发令牌' }).first().click();
  await page.getByPlaceholder('例如：家庭自动化脚本').fill('E2E 脚本');
  await page.getByRole('button', { name: '签发', exact: true }).click();
  await expect(page.getByText('令牌只显示这一次，请立即保存')).toBeVisible();
  await expect(page.locator('main').getByText(/^sk-ice-[a-z0-9]{32}$/)).toBeVisible();
});

test('AI 控制台执行中文指令', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: 'AI 操作手册' }).click();
  await page.getByRole('button', { name: '自然语言控制' }).click();
  await page.getByRole('button', { name: '打开客厅主灯' }).click();
  await expect(page.getByText('已执行').first()).toBeVisible();
  await expect(page.getByText('1 台设备')).toBeVisible();
});

test('配对二维码与设备批准', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '配对与导入' }).click();
  await page.getByPlaceholder('例如：书房台灯').fill('E2E 台灯');
  await page.getByRole('button', { name: '生成配对二维码' }).click();
  await expect(page.getByText('待审批').first()).toBeVisible();
  await expect(page.locator('main svg').first()).toBeVisible();
  await page.getByRole('button', { name: '批准接入' }).click();
  await expect(page.getByText('配对已完成')).toBeVisible();
  await expect(page.locator('aside').first().getByText('客厅', { exact: true })).toBeVisible();
});

test('导出设备清单二维码', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '配对与导入' }).click();
  await page.getByRole('button', { name: '生成导出码' }).first().click();
  await expect(page.getByText('复制导入链接')).toBeVisible();
  await expect(page.getByText('在另一套 ICEHOME 的导入框粘贴即可复刻分类与设备')).toBeVisible();
});

test('设置页与系统页展示存储和缓存', async ({ page }) => {
  const sidebar = page.locator('aside').first();
  await sidebar.getByText('设置', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('设置');
  await expect(page.getByText('存储与缓存', { exact: true })).toBeVisible();
  await expect(page.getByText('持久化后端', { exact: true })).toBeVisible();
  await expect(page.getByText('页面缓存', { exact: true })).toBeVisible();
  await expect(page.getByText('本地 JSON', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText(/连接正常/)).toBeVisible();

  await sidebar.locator('.nav-row').filter({ hasText: '系统状态' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('系统状态');
  await expect(page.getByText('缓存后端')).toBeVisible();
  await expect(page.getByText('数据模式')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/desktop-infra.png', fullPage: true });
});

test('账户页创建成员并手动勾选设备', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '账户与权限' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('账户与权限');
  await expect(page.locator('main').getByText('管理员', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('家人', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: '新增账户' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('例如 living-room').fill('e2euser');
  await dialog.getByPlaceholder('例如 家人').fill('E2E 成员');
  await dialog.getByPlaceholder('至少 6 位').fill('secret1');
  await dialog.getByText('客厅主灯', { exact: true }).click();
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('账户已创建')).toBeVisible();
  await expect(page.locator('main').getByText('E2E 成员', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/desktop-accounts.png', fullPage: true });
});

test('平面图框选设备并授权给成员', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '家居平面图' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('家居平面图');
  const svg = page.locator('main svg[data-plan-canvas]');
  await expect(svg).toBeVisible();
  await expect(page.locator('main').getByText('客厅', { exact: true }).first()).toBeVisible();

  // 框选模式：从客厅左上拖到客厅中部，应选中 4 台已标注的客厅设备。
  await page.getByRole('button', { name: '框选授权' }).click();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('main').getByText(/已选 4 台设备/)).toBeVisible();

  await page.locator('main select').nth(1).selectOption({ index: 1 });
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.getByText('已追加设备授权')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/desktop-plan.png', fullPage: true });
});

test('二维码巡检：配置二维码、Wi-Fi 与扫码记录', async ({ page }) => {
  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '二维码巡检' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('二维码巡检');
  await expect(page.getByText('Wi-Fi 配网二维码')).toBeVisible();
  await expect(page.getByText('Wi-Fi 联动网段扫描')).toBeVisible();

  await page.getByRole('button', { name: '生成二维码' }).first().click();
  await expect(page.getByText('配置二维码已生成')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载配置文件' })).toBeVisible();

  await page.getByRole('button', { name: '记录这台设备' }).click();
  await expect(page.getByText('巡检已记录')).toBeVisible();
  const table = page.locator('main table');
  await expect(table.getByText('客厅主灯', { exact: true })).toBeVisible();

  const label = await page.getByLabel('设备二维码内容').inputValue();
  expect(label).toContain('icehome://device?id=');
  await page.getByLabel('巡检二维码内容').fill(label);
  await page.getByRole('button', { name: '提交扫码结果' }).click();
  await expect(page.getByText('扫码巡检已记录')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/shots/desktop-qr.png', fullPage: true });
});

test('视觉快照：桌面端', async ({ page }, testInfo) => {
  await page.locator('aside').first().getByRole('button', { name: /全部设备/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('总览');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/shots/desktop-flow.png', fullPage: true });

  await page.locator('aside').first().locator('.nav-row').filter({ hasText: '系统状态' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('系统状态');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shots/desktop-system.png', fullPage: true });
  await testInfo.attach('desktop', { path: 'test-results/shots/desktop-flow.png', contentType: 'image/png' });
});

test('成员登录后只能看到被授权设备', async ({ page }) => {
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('登录 ICEHOME');
  await page.getByPlaceholder('admin').fill('family');
  await page.getByPlaceholder('至少 6 位').fill('icehome');
  await page.getByRole('button', { name: '验证并进入' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('总览');

  const sidebar = page.locator('aside').first();
  await expect(sidebar.getByText('家人', { exact: true })).toBeVisible();
  await expect(sidebar.locator('.nav-row').filter({ hasText: 'API 令牌' })).toHaveCount(0);
  await expect(sidebar.locator('.nav-row').filter({ hasText: '家居平面图' })).toBeVisible();
  await expect(page.locator('main').getByText('客厅主灯', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByText('厨房计量插座', { exact: true })).toHaveCount(0);
});
