# ICEHOME 代理网关示例

一个零依赖的 Node 网关，演示**前后端分离部署**下的典型拓扑：浏览器只访问网关，网关托管前端静态文件，并把 `/api`、`/v1` 反代到 ICEHOME API 进程。

```
浏览器 ──> 网关 :8790 ──┬─ /            静态文件 dist（SPA 回退 index.html）
                        ├─ /api/*       反向代理 → API :8787
                        ├─ /v1/*        反向代理 → API :8787（SSE 直通）
                        └─ /__gateway/stats   命中率、上游错误等指标
```

## 启动

```powershell
# 1. 构建前端
npm run build

# 2. 只启动 API（不托管静态资源）
npm run start:api          # 监听 8787，SERVE_STATIC=false

# 3. 另开一个终端启动网关
npm run start:gateway      # 监听 8790
```

打开 `http://127.0.0.1:8790`，浏览器里所有请求都走网关。API 直连地址是 `http://127.0.0.1:8787`，仅供网关和调试使用。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GATEWAY_PORT` | `8790` | 网关监听端口 |
| `GATEWAY_UPSTREAM` | `http://127.0.0.1:8787` | API 上游地址 |
| `GATEWAY_DIST` | `./dist` | 前端构建产物目录 |
| `GATEWAY_CACHE_TTL` | `5` | 网关层 GET 缓存秒数，`0` 关闭 |
| `REDIS_URL` | 空 | 填写后网关缓存落 Redis；留空用进程内存 |

## 缓存行为

- 仅缓存只读接口：`/api/state`、`/api/devices`、`/api/categories`、`/api/tasks`、`/api/plugins`、`/api/events`、`/api/ai/manual`。
- 缓存键 = 路径 + 查询串 + 令牌 SHA-256 指纹，不同令牌不会互相命中。
- 任何非 GET 请求且上游状态码 < 400 时清空缓存（`gw:*`）。
- 响应头 `x-gateway-cache: HIT | MISS | BYPASS` 便于排查。
- `GET /__gateway/stats` 返回请求量、命中/未命中、失效次数、上游错误等。

> 网关缓存与应用内缓存是两层：应用内缓存在「设置 → 存储与缓存」开启，默认关闭；网关缓存由 `GATEWAY_CACHE_TTL` 控制，默认 5 秒。两层可以同时使用，也可以只留一层。

## 与 nginx 方案的取舍

- **Node 网关**：零外部依赖、随项目一起运行、能直接复用 Node 生态；适合单机、内网、演示。
- **nginx**：静态文件性能更好、支持 TLS/HTTP2/限流；生产环境推荐，配置见 `deploy/nginx/icehome.conf`。

两者可以叠加：nginx 负责 TLS 与静态资源，Node 网关作为上游或直接暴露 API。
