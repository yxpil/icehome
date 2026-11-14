# ICEHOME

> **测试版（Beta）**
>
> 本项目由 AI 自主完成，当前仅作为测试版发布，用于测试、学习与技术交流。功能、接口、数据和安装包均可能随时调整，不承诺生产环境的稳定性、安全性或持续维护；请勿直接用于真实家庭的关键控制场景，接入前请自行评估风险并做好数据备份。

黑白简约的家庭设备控制面板，参考 Home Assistant 的能力模型，从零实现。支持账户与多账户、设备授权、家居平面图标注与框选授权、自定义设备、自定义 HTTP 接口、多状态、定时任务、扫码导入、二维码配置备份与巡检、Wi-Fi 二维码与网段扫描、插件、AI 操作手册与 OpenAI 兼容端点。

- 设计文档：[项目计划书](docs/项目计划书.md) · [任务目标](docs/任务目标.md) · [部署与存储](docs/部署与存储.md) · [桌面端](docs/桌面端.md)
- 技术栈：Node 22 + Express 4 · React 18 + Vite 6 + Tailwind 3.4 · Electron 33 + electron-builder · Vitest 2 + Supertest + Playwright
- 存储：默认单文件 `data/db.json`（150ms 防抖 + tmp→rename 原子写），可切换 PostgreSQL / MySQL
- 缓存：进程内存或 Redis，页面级 GET 缓存可开关、可调 TTL，写后自动失效
- 部署：单进程托管，或 `SERVE_STATIC=false` + nginx / Node 网关的前后端分离

## 快速开始

```bash
npm install
npm run build        # 构建前端到 dist/
npm start            # http://127.0.0.1:8787
```

开发模式（Vite 代理 `/api` 与 `/v1`）：

```bash
npm run dev:server   # 终端 1：:8787，node --watch
npm run dev:web      # 终端 2：:5173
```

前后端分离部署：

```bash
npm run start:api    # 只启动 API（SERVE_STATIC=false）
npm run start:gateway # 静态资源 + 反向代理，http://127.0.0.1:8790
```

## 桌面端（Electron）

```bash
npm run desktop:dev       # 构建前端并以桌面端启动
npm run desktop:dist:dir  # 生成当前平台的未压缩安装目录
npm run desktop:dist      # 生成安装包（Windows NSIS / macOS DMG / Linux AppImage）
npm run test:desktop      # Electron 启动器双模式 E2E
```

桌面端内置两种模式，启动器可随时切换：

| 模式 | 行为 | 适合 |
| --- | --- | --- |
| 本地模式 | Electron 主进程内启动完整 Express 服务，默认 `8788`，端口被占用自动顺延；数据默认在应用数据目录，可选局域网监听 | 单机使用、随身带走数据 |
| 远程模式 | 只连接现有面板根地址，先检查 `/api/health`，可保存最多 8 个常用服务器；自签名 HTTPS 可按主机放行 | NAS、小主机、已有 8787 服务 |

桌面端不复制、不改写业务逻辑：本地模式复用同一套 `runtime.js`、seed、账户、平面图和二维码接口；远程模式直接加载现有 Web 面板。远程页面不注入 preload、不开放 Node 能力，导航限制在同一 origin。

多 CPU / 多端：`electron-builder` 目标覆盖 Windows、macOS、Linux 的 x64 与 arm64；本地服务是纯 JS，不依赖原生模块，因此不需要按架构重编。GitHub Actions 矩阵见 `.github/workflows/desktop.yml`。同一数据目录只允许一个服务进程写入，桌面端与 CLI 同时指向同一 `data` 时第二个会拒绝启动。

本机已验证 Windows x64：`release/win-unpacked/ICEHOME.exe` 可直接启动本地模式并落盘；`release/ICEHOME-1.0.0-win-x64.exe` 为未签名 NSIS 安装包。另生成了 `release-arm64/ICEHOME-1.0.0-win-arm64.exe`，验证 arm64 打包链路（未在 x64 主机运行）。macOS/Linux 由 CI 构建。打包后冒烟测试：

```bash
npm run desktop:dist:dir
$env:ICEHOME_TEST_PACKAGED='1'; npx playwright test -c playwright.desktop.config.js tests/desktop/packaged.spec.js
```

首次启动会写入示例数据：4 个分类、10 台设备、3 个任务、3 个插件、2 个账户和 1 张家居平面图。初始管理员 `admin / icehome`，演示成员 `family / icehome`（只授权客厅主灯、主卧顶灯、门口摄像头）。同一台电脑打开面板会自动签发 admin 令牌；远程访问或显式退出后会进入登录页，可用账户口令或 `sk-ice-…` 令牌进入。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 账户与多账户 | `admin` / `member` 两种角色，scrypt 口令散列、登录节流、会话令牌、启停账户；账户可被授予任意设备集合 |
| 设备授权 | 管理员全量管理；成员只能看到/控制被授权设备，`/api/state`、任务、事件、平面标记同步裁剪 |
| 家居平面图 | SVG 画布：拖拽绘制房间、放置设备标记、拖动标记、框选一批设备；按账户追加/替换/移除授权，也可在右侧手动勾选 |
| 设备接入 | 13 类内置模板（灯光/开关/插座/温控/风扇/窗帘/门锁/传感器/空气质量/门磁/人体/摄像头/音箱）+ 自定义能力组合 |
| 自定义接口 | 每台设备可绑定 HTTP 接口：`{{device.id}}`、`{{state.power}}`、`{{action}}` 模板渲染 URL/headers/body，动作写回，`readPath` 回读状态，500–30000ms 超时 |
| 多状态 | 18 种能力字段，类型/范围/单位统一校验，非法值直接 400 |
| 定时任务 | interval / 每天定点 / 5 段 cron（`*`、`*/n`、`a-b`、`a-b/n`、`a,b`），每 15s 心跳，可启停、立即执行 |
| 分类 | 任意新增分类卡片，侧栏反色选中，指定 SVG 图标 |
| 配对与迁移 | 6 位配对码 + 二维码批准接入；导出设备清单二维码，在另一套面板粘贴导入 |
| 二维码与巡检 | 配置二维码指向 10 分钟有效的只读下载链接；设备巡检标签与扫码/手工巡检记录；标准 Wi-Fi 二维码；受控私网网段扫描并加入待配对 |
| 插件 | JSON 清单安装，可贡献设备模板与 hook 声明，支持启停/卸载 |
| AI | 内置中文指令解析（开关/设值/调亮调暗/查询/批量/歧义/排程），零外部依赖；可下载 Markdown 操作手册 |
| OpenAI 兼容 | `/v1/models`、`/v1/chat/completions`（含 SSE 流式），`sk-ice-…` Bearer 令牌 |

## 存储、缓存与部署

| 能力 | 说明 |
| --- | --- |
| 数据库存储 | `STORAGE_DRIVER=postgres/mysql` + `STORAGE_URL`，启动自动建表 `icehome_state`；留空或 `json` 用本地文件 |
| Redis 缓存 | `REDIS_URL` 连接成功即使用 Redis，失败自动降级内存并在界面显示原因 |
| 页面缓存 | 设置页开关 + TTL（1–120s），仅缓存只读 GET，写请求后清空；响应头 `x-cache: HIT/MISS/BYPASS` |
| 运维接口 | `/api/cache/stats`、`/api/cache/purge`、`/api/system/storage/test`，`/api/system` 暴露 storage 与 cache |
| 前后端分离 | `SERVE_STATIC=false` 只提供 API；`CORS_ORIGINS` 允许跨域；前端用 `VITE_API_BASE` 指定 API 根地址 |
| 代理示例 | `examples/gateway/server.mjs`（零依赖 Node 网关，含可选 Redis 缓存与命中统计）· `deploy/nginx/icehome.conf` |
| 桌面端 | Electron 双模式启动器：本地内嵌服务 / 远程连接；系统菜单、托盘、常用服务器、局域网地址复制；Windows/macOS/Linux x64+arm64 |

配置样例见 [`.env.example`](.env.example)，完整说明见 [docs/部署与存储.md](docs/部署与存储.md)。

```powershell
# PostgreSQL
$env:STORAGE_DRIVER='postgres'; $env:STORAGE_URL='postgres://icehome:pass@127.0.0.1:5432/icehome'
# MySQL
$env:STORAGE_DRIVER='mysql'; $env:STORAGE_URL='mysql://icehome:pass@127.0.0.1:3306/icehome'
# Redis 缓存
$env:REDIS_URL='redis://127.0.0.1:6379'
npm start
```

## 界面

- 左右布局：左侧 300px 侧栏（分类卡片 + 控制台导航 + 系统状态卡），右侧工作区。
- 13 个视图：总览、分类、家居平面图、二维码巡检、定时任务、系统状态、API 令牌、插件、配对与导入、AI 手册、设置、账户与权限、设备抽屉/添加设备。
- 手机端侧栏收纳为抽屉；设备卡在移动端单列；平面图触摸拖拽同样可用。
- 所有图标为自绘 24×24 SVG，页面不出现 emoji。

截图（E2E 运行后生成）：`test-results/shots/desktop-overview.png`、`desktop-plan.png`、`desktop-accounts.png`、`desktop-qr.png`、`desktop-electron-launcher.png`、`desktop-electron.png`、`desktop-electron-packed.png`、`desktop-system.png`、`mobile-overview.png`、`mobile-nav.png`。

## 测试

```bash
npm test                 # 单元 92 + 集成 106 = 198
npm run test:unit        # tests/unit
npm run test:integration # tests/integration
npm run test:e2e         # 先 build，再跑 Playwright（自动起 8799 端口独立服务）
npm run test:desktop     # Electron 启动器本地/远程双模式 E2E
```

E2E 使用独立端口与临时数据目录（`tests/e2e/start-server.mjs`），不会污染 `data/db.json`。桌面项目跑主流程，手机项目跑布局用例，另一项目维度自动跳过。最近一次：18 passed / 18 skipped；Electron 桌面端 2 passed。

覆盖点：cron 解析、设备构建与补丁、状态校验、调度心跳、鉴权与 scope、账户口令与角色、设备授权与状态裁剪、旧数据迁移与平面图坐标、平面图校验与标记过滤、令牌生命周期、HTTP 适配器（含本地 HTTP 桩）、插件模板、配对、导入导出、二维码负载与 gzip 往返、Wi-Fi 标准转义、私网扫描边界与开放端口探测、巡检权限与事件裁剪、AI 解析与手册、OpenAI 结构与 SSE、存储驱动解析与 JSON 持久化、内存/Redis 缓存与降级、缓存命中与写后失效、缓存设置校验、Electron 地址规范化/常用服务器/窗口配置、内嵌服务端口与数据目录锁、真实浏览器中的分类切换/抽屉控制/建分类/建任务/签发令牌/配对/导出/账户创建与设备勾选/平面框选授权/二维码配置与巡检/成员登录可见性/手机导航、Electron 本地与远程双模式启动。

## API 摘要

除 `/api/health`、`/api/auth/bootstrap`、`/api/auth/login`、`/api/config/export/:token` 外均需 `Authorization: Bearer sk-ice-…`。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（公开） |
| POST | `/api/auth/bootstrap` | 本机自动签发 admin 令牌（可在设置中关闭） |
| POST | `/api/auth/login` | 用户名 + 口令登录（公开，返回 Bearer 令牌与账户） |
| GET | `/api/auth/me` | 当前令牌对应的账户 |
| POST | `/api/auth/logout` | 吊销当前令牌 |
| GET | `/api/state` | 面板状态（按账户授权裁剪设备/任务/事件/令牌/平面标记） |
| GET / POST | `/api/users` | 账户列表 / 创建（admin） |
| PATCH / DELETE | `/api/users/:id` | 编辑角色/启停/口令/设备，删除（admin） |
| POST | `/api/users/:id/grants` | 设备授权：`{deviceIds, mode:'add'\|'replace'\|'remove'}`（admin） |
| GET / POST | `/api/plans` | 平面图列表 / 创建（admin） |
| PATCH / DELETE | `/api/plans/:id` | 保存房间与设备标记 / 删除（admin） |
| GET | `/api/system` | 运行时指标 + 存储状态 + 缓存统计 |
| POST | `/api/system/storage/test` | 测试当前存储连接（admin） |
| GET | `/api/cache/stats` | 缓存后端 / 命中 / 未命中 / 条目 / TTL |
| POST | `/api/cache/purge` | 清空页面缓存（admin） |
| GET | `/api/events?limit=` | 事件日志 |
| PATCH | `/api/settings` | 家庭名称、本机自动签发、页面缓存开关与 TTL |
| GET / POST | `/api/devices` | 列表 / 创建 |
| GET / PATCH / DELETE | `/api/devices/:id` | 详情 / 更新 / 删除（级联任务） |
| POST | `/api/devices/:id/actions` | `turn_on` / `turn_off` / `toggle` / `set` / `sync` |
| POST | `/api/devices/:id/probe` | 探测 HTTP 适配器 |
| GET / POST | `/api/categories` | 列表 / 创建 |
| PATCH / DELETE | `/api/categories/:id` | 更新 / 删除（设备转未分类） |
| GET / POST | `/api/tasks` | 列表 / 创建 |
| PATCH / DELETE | `/api/tasks/:id` | 更新 / 删除 |
| POST | `/api/tasks/:id/run` | 立即执行 |
| GET / POST | `/api/tokens` | 列表（掩码）/ 签发（返回一次明文） |
| PATCH / DELETE | `/api/tokens/:id` | 吊销恢复 / 删除 |
| GET / POST | `/api/plugins` | 列表 / 安装 |
| PATCH / DELETE | `/api/plugins/:id` | 启停 / 卸载 |
| POST / GET | `/api/pairing` | 发起配对（返回二维码 SVG）/ 列表 |
| GET | `/api/pairing/:code` | 查询配对 |
| POST | `/api/pairing/:code/approve` `reject` | 批准 / 拒绝 |
| GET | `/api/export` | 导出设备清单（bundle + 二维码） |
| POST | `/api/import` | 导入清单（`icehome://import?payload=…`） |
| GET | `/api/qr/config` | 完整配置 + gzip 负载 + 10 分钟下载链接二维码（admin） |
| GET | `/api/config/export/:token` | 凭一次性短链下载配置 JSON（免 Bearer，10 分钟有效） |
| GET | `/api/qr/wifi` | 标准 Wi-Fi 二维码与当前 SSID（admin） |
| GET | `/api/qr/devices` | 按当前账户授权返回设备标签二维码 |
| GET / POST | `/api/inspections` | 巡检记录列表 / 为指定设备记录结果 |
| POST | `/api/inspections/scan` | 解析设备标签二维码并记录巡检 |
| GET | `/api/network` | 网卡与建议私网网段（admin） |
| POST | `/api/network/scan` | 扫描 `/24-/32` 私网常见端口并返回发现主机（admin） |
| POST | `/api/ai/command` | 中文指令（`dryRun` 只解析） |
| GET | `/api/ai/manual` | AI 手册（`format=json`、`baseUrl`） |
| GET | `/v1/models` | OpenAI 模型列表 |
| POST | `/v1/chat/completions` | OpenAI 兼容对话（`stream: true` 走 SSE） |

错误结构统一：`{ "error": { "code": "...", "message": "..." } }`，`code` 取 `validation_error / unauthorized / invalid_token / forbidden / not_found / conflict / internal_error`。

## 账户、令牌与权限

账户分 `admin` 与 `member`：管理员可做设备结构管理、账户管理、平面图编辑与令牌/插件/配对/导入导出；成员只能读写被授权的设备，可对授权设备建任务、执行动作和调用 AI。登录返回普通 `sk-ice-…` 令牌，服务端用 `userId` 关联账户，每次请求按**当前角色**计算 scope，停用账户会让已有令牌立即 401。

独立令牌（`/api/tokens`）保留原有 scope 模型：

- `device:read`：读设备与状态
- `device:write`：动作与增删改
- `ai:use`：自然语言与 OpenAI 端点
- `admin`：令牌、插件、配对、导入导出、账户与平面图（包含上述全部）

等级关系 `admin ⊃ device:write ⊃ device:read`。没有账户关联的旧令牌继续视为全权管理员，便于脚本与既有自动化平滑迁移。

```bash
# 账户登录
curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"family","password":"icehome"}'

# 用返回的 token 读状态
curl -s -H "Authorization: Bearer $ICE_TOKEN" http://127.0.0.1:8787/api/devices

# 框选后批量授权（替换该成员的全部设备）
curl -s -X POST http://127.0.0.1:8787/api/users/usr_family/grants \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"deviceIds":["dev_living_main","dev_bed_main"],"mode":"replace"}'
```

## 目录结构

```
ICEHOME/
├─ server/src/       后端：app.js 路由 / store.js 存储包装 / persistence.js 多后端驱动
│                    cache.js 页面缓存 / engine.js 动作与适配器 / cron.js 解析
│                    accounts.js 账户口令与权限 / ai.js 解析与手册
│                    capabilities.js 能力表 / seed.js 示例数据与迁移
├─ web/              前端：src/views 13 个视图，ui.jsx 设计系统，icons.jsx SVG 图标
│                    Login.jsx 登录门 / views/FloorPlan.jsx 平面图 / views/Accounts.jsx 账户
├─ tests/
│  ├─ unit/          cron / devices / ai / store / persistence / cache / accounts
│  ├─ integration/   health / devices / tasks / tokens / ai / pairing / infra / cache / accounts / plans
│  └─ e2e/           panel.spec.js / mobile.spec.js / start-server.mjs
├─ examples/gateway/ 零依赖 Node 网关（静态托管 + 反代 + 可选 Redis 缓存）
├─ deploy/nginx/     前后端分离部署配置（静态缓存 + SSE 不缓冲）
├─ scripts/          start-api.mjs（SERVE_STATIC=false 启动）
├─ docs/             项目计划书.md · 任务目标.md · 部署与存储.md
├─ data/db.json      运行时数据（JSON 模式首次启动生成）
└─ dist/             构建产物（npm start 托管）
```

## 设计说明

- **TailwindUI 风格而非其源码**：TailwindUI 是付费模板库，这里用 Tailwind 原子类自建设计系统（卡片、按钮、徽标、开关、抽屉、Tabs、Meter、Toast），保持同等克制的中性语感。
- **确定性 AI**：中文解析走规则（设备名优先 → 类型关键词 → 批量/歧义 → 数值 → 排程），不调用外部模型，保证离线可用与测试可重复。
- **两种导出**：`/api/export` 只保留名称/模板/能力/状态/分类名，适合把设备清单塞进二维码；`/api/qr/config` 导出完整配置，但二维码只编码 10 分钟有效的下载短链，避免版本 40 二维码过于密集而无法扫描。
- **插件模板优先级**：`buildDevice` 接收插件贡献的模板列表，避免插件设备退化成单开关。

## 已知限制

- 仅 HTTP 适配器，不含 MQTT / WebSocket / 本地协议发现；网段扫描对 80/8080/8123/8787 做 HTTP、443 做 TLS、554 做 RTSP、1883 做 MQTT 握手，未知端口回退 TCP，不登录或修改设备。
- 存储为整份文档模型：SQL 后端便于持久化与集中备份，但未拆表，不能按设备做 SQL 级查询/联表。
- 页面缓存失效是「全量清空」，面向家庭规模；多实例部署时各实例缓存独立，需要共享 Redis 才能一致。
- 账户口令由管理员在面板中重置，没有邮件找回或多因素认证；登录节流是单进程内存计数，多实例需前置网关限流。
- 平面图为单层 SVG 画布，可建多张平面但暂不支持导入户型图或自动识别墙体。
- 设备清单导出（`/api/export`）不含适配器配置与插件定义；完整配置请用 `/api/qr/config`。配置二维码是只读下载链接，暂不支持扫码自动恢复配置。
- 巡检是即时记录（设备/状态/备注/巡检人），不含巡检计划、报告导出或异常工单；摄像头扫码依赖 Chrome/Edge 的 `BarcodeDetector`，其他浏览器可粘贴标签内容。
- 网段扫描仅允许 `10.x / 172.16-31.x / 192.168.x / 127.x` 且前缀 `/24-/32`，单次最多 8 个端口；结果只用于发现，加入配对后仍需配置设备模板与 HTTP 适配器。
