import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, CopyButton, Field, SectionHeader, Switch, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';
import { getToken } from '../api.js';

export function SettingsView() {
  const { state, action, setView } = useApp();
  const [homeName, setHomeName] = useState(state.settings.homeName || '');
  const [cacheEnabled, setCacheEnabled] = useState(Boolean(state.settings.cache?.enabled));
  const [ttl, setTtl] = useState(String(state.settings.cache?.ttlSeconds || 5));
  const [probe, setProbe] = useState(null);
  const token = getToken();
  const masked = token ? `${token.slice(0, 12)}${'*'.repeat(6)}${token.slice(-4)}` : '未配置';

  const storage = state.infra?.storage || {};
  const cache = state.infra?.cache || {};
  const driverLabel = { json: '本地 JSON', postgres: 'PostgreSQL', mysql: 'MySQL' }[storage.driver] || storage.driver || '未知';
  const ttlValue = Number(ttl);
  const ttlValid = Number.isFinite(ttlValue) && ttlValue >= 1 && ttlValue <= 120;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="设置" description="面板名称、本机自动签发策略与接入信息。" />

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="label mb-3">基础设置</div>
          <div className="flex flex-col gap-3.5">
            <Field label="家庭名称" hint="显示在页面标题与事件中">
              <input
                className="input"
                value={homeName}
                onChange={(event) => setHomeName(event.target.value)}
                maxLength={30}
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              icon="check"
              className="self-start"
              onClick={() => action('设置已保存', () => api.settings({ homeName }))}
              disabled={!homeName.trim()}
            >
              保存名称
            </Button>
            <div className="divider" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium">允许本机自动签发布局令牌</div>
                <div className="mt-0.5 text-[11px] leading-5 text-muted2">
                  开启后，同一台电脑上的浏览器首次访问会自动获得一枚 admin 令牌；远程访问需要手动粘贴令牌。
                </div>
              </div>
              <Switch
                checked={Boolean(state.settings.allowLocalBootstrap)}
                onChange={(next) => action(next ? '已允许本机自动签发' : '已关闭本机自动签发', () => api.settings({ allowLocalBootstrap: next }))}
                label="允许本机自动签发"
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">当前接入凭证</span>
            <Badge tone="soft">
              <Icon name="key" size={10} />
              本机
            </Badge>
          </div>
          <div className="rounded-lg border border-line bg-mist px-3 py-2 font-mono text-[11.5px] break-all">{masked}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <CopyButton text={token} label="复制当前令牌" />
            <Button variant="outline" size="sm" icon="key" onClick={() => setView({ kind: 'tokens' })}>
              管理令牌
            </Button>
          </div>
          <div className="mt-4 border-t border-line2 pt-3">
            <div className="label mb-2">接入端点</div>
            <div className="flex flex-col gap-1.5 text-[11.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">面板</span>
                <span className="font-mono text-[11px]">{window.location.origin}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">REST API</span>
                <span className="font-mono text-[11px]">{window.location.origin}/api</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">OpenAI</span>
                <span className="font-mono text-[11px]">{window.location.origin}/v1</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">存储与缓存</span>
          <Badge tone="soft">
            <Icon name="database" size={10} />
            {driverLabel} + {cache.backend === 'redis' ? 'Redis' : '内存'}
          </Badge>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium">持久化后端</span>
              <Badge tone={storage.connected === false ? 'warn' : 'soft'}>
                {storage.connected === false ? '未连接' : '已连接'}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5 text-[11.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">驱动</span>
                <span className="font-mono text-[11px]">{driverLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">地址</span>
                <span className="max-w-[62%] truncate font-mono text-[11px]" title={storage.target || ''}>
                  {storage.target || '内存'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted2">写入延迟</span>
                <span className="font-mono text-[11px]">{storage.latencyMs ?? 0} ms</span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon="refresh"
                onClick={async () => {
                  const data = await action(null, () => api.testStorage());
                  if (data?.result) setProbe(data.result);
                }}
              >
                测试连接
              </Button>
              {probe ? (
                <span className={cn('text-[11px]', probe.ok ? 'text-muted2' : 'text-ink')}>
                  {probe.ok ? `连接正常 · ${probe.latencyMs ?? 0} ms` : `连接失败 · ${probe.detail || '未知错误'}`}
                </span>
              ) : null}
            </div>
            <div className="mt-auto flex items-start gap-2 rounded-lg border border-line bg-mist px-2.5 py-2 text-[11px] leading-5 text-muted2">
              <Icon name="server" size={13} className="mt-0.5 shrink-0" />
              切换数据库：设置 <code className="font-mono">STORAGE_DRIVER</code> 与
              <code className="font-mono">STORAGE_URL</code> 后重启服务，连接串中的密码已脱敏。
            </div>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line2 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium">页面缓存</span>
              <Badge tone="soft">{cache.backend === 'redis' ? 'Redis' : '进程内存'}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['命中', cache.hits ?? 0],
                ['未命中', cache.misses ?? 0],
                ['条目', cache.keys ?? 0]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-mist px-2 py-1.5">
                  <div className="font-mono text-[13px] leading-5">{value}</div>
                  <div className="text-[10.5px] text-muted2">{label}</div>
                </div>
              ))}
            </div>
            {cache.fallbackReason ? (
              <div className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] leading-5 text-muted2">
                {cache.fallbackReason}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12.5px] font-medium">启用 GET 响应缓存</div>
                <div className="mt-0.5 text-[11px] leading-5 text-muted2">写请求成功后会自动失效，避免读到旧数据。</div>
              </div>
              <Switch checked={cacheEnabled} onChange={setCacheEnabled} label="启用页面缓存" />
            </div>
            <div className="flex items-end gap-2">
              <Field label="缓存 TTL（秒）" hint="1 - 120">
                <input
                  className="input w-24"
                  type="number"
                  min={1}
                  max={120}
                  value={ttl}
                  onChange={(event) => setTtl(event.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                size="sm"
                icon="check"
                disabled={!ttlValid}
                onClick={() =>
                  action('缓存设置已保存', () =>
                    api.settings({ cache: { enabled: cacheEnabled, ttlSeconds: Number(ttl) } })
                  )
                }
              >
                保存
              </Button>
              <Button variant="ghost" size="sm" icon="trash" onClick={() => action('缓存已清空', api.purgeCache)}>
                清空
              </Button>
            </div>
            <div className="mt-auto text-[11px] leading-5 text-muted2">
              缓存范围：状态快照、设备、分类、任务、插件、事件与 AI 手册；令牌、设置、缓存统计等控制接口不缓存。
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="label mb-3">关于 ICEHOME</div>
        <div className="grid gap-3 text-[11.5px] leading-5 text-muted2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[12.5px] font-medium text-ink">设计来源</div>
            参考 Home Assistant 的设备-实体-服务模型，简化为「分类 / 设备 / 能力 / 任务」四层结构，前端使用 TailwindUI 风格原子类自绘黑白组件。
          </div>
          <div>
            <div className="mb-1 text-[12.5px] font-medium text-ink">数据与安全</div>
            数据默认保存在 <code className="font-mono">data/db.json</code>，也可通过 <code className="font-mono">STORAGE_DRIVER</code> 切换 PostgreSQL / MySQL；令牌仅在创建时完整返回，本机自动签发可通过上方开关关闭。
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>版本 {state.version}</Badge>
          <Badge>设备 {state.stats.counts.devices}</Badge>
          <Badge>任务 {state.stats.counts.tasks}</Badge>
          <Badge>插件 {state.stats.counts.plugins}</Badge>
          <Badge>事件 {state.stats.counts.events}</Badge>
        </div>
        <div className={cn('mt-3 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[11px] text-muted2')}>
          <Icon name="terminal" size={13} />
          <span className="font-mono">npm run dev:server</span> + <span className="font-mono">npm run dev:web</span> 为开发模式；
          <span className="font-mono">npm start</span> 单进程托管，<span className="font-mono">npm run start:api</span> +
          <span className="font-mono">npm run start:gateway</span> 为前后端分离部署。
        </div>
      </Card>
    </div>
  );
}
