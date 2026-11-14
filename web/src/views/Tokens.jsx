import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, CopyButton, EmptyState, Field, IconButton, Modal, SectionHeader, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const SCOPES = [
  { value: 'device:read', label: 'device:read', hint: '读取设备与状态' },
  { value: 'device:write', label: 'device:write', hint: '设备动作与增删改' },
  { value: 'ai:use', label: 'ai:use', hint: '自然语言 / OpenAI 端点' },
  { value: 'admin', label: 'admin', hint: '令牌、插件、配对、导入导出' }
];

export function TokensView() {
  const { state, action } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [scopes, setScopes] = useState(['device:read', 'device:write']);
  const [issued, setIssued] = useState(null);

  const create = async () => {
    if (!name.trim()) return;
    const result = await action('令牌已签发', () => api.createToken({ name: name.trim(), note, scopes }));
    if (result) {
      setIssued(result);
      setOpen(false);
      setName('');
      setNote('');
      setScopes(['device:read', 'device:write']);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="API 令牌"
        description="所有接口使用 OpenAI 风格的 Bearer 密钥，按 scope 控制权限。"
        action={
          <Button icon="plus" onClick={() => setOpen(true)}>
            签发令牌
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: '有效令牌', value: state.tokens.filter((token) => !token.revoked).length },
          { label: '累计调用', value: state.tokens.reduce((sum, token) => sum + (token.requestCount || 0), 0) },
          { label: '管理权限', value: state.tokens.filter((token) => token.scopes.includes('admin')).length },
          { label: '已吊销', value: state.tokens.filter((token) => token.revoked).length }
        ].map((item) => (
          <div key={item.label} className="kpi">
            <span className="label">{item.label}</span>
            <span className="num text-[20px] font-semibold leading-none tracking-tight">{item.value}</span>
          </div>
        ))}
      </div>

      {issued ? (
        <Card className="border-ink p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="key" size={15} />
                <span className="text-[13px] font-medium">令牌只显示这一次，请立即保存</span>
              </div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-mist px-3 py-2 font-mono text-[12px]">
                {issued.key}
              </div>
            </div>
            <IconButton icon="close" label="关闭提示" onClick={() => setIssued(null)} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <CopyButton text={issued.key} label="复制密钥" />
            <CopyButton
              text={`export ICE_TOKEN="${issued.key}"\ncurl -H "Authorization: Bearer $ICE_TOKEN" ${window.location.origin}/api/state`}
              label="复制 curl 示例"
            />
            <span className="mono-tag">scope：{issued.token.scopes.join(', ')}</span>
          </div>
        </Card>
      ) : null}

      {state.tokens.length === 0 ? (
        <EmptyState icon="key" title="没有可用令牌" action={<Button icon="plus" onClick={() => setOpen(true)}>签发令牌</Button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-12 gap-3 border-b border-line px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted2 md:grid">
            <span className="col-span-3">名称 / 前缀</span>
            <span className="col-span-3">权限</span>
            <span className="col-span-2">调用</span>
            <span className="col-span-2">最后使用</span>
            <span className="col-span-2 text-right">操作</span>
          </div>
          {state.tokens.map((token) => (
            <div key={token.id} className={cn('grid gap-3 border-b border-line2 px-4 py-3 md:grid-cols-12 md:items-center', token.revoked && 'opacity-50')}>
              <div className="md:col-span-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-medium">{token.name}</span>
                  {token.revoked ? <Badge tone="line">已吊销</Badge> : null}
                </div>
                <div className="mono-tag mt-0.5 truncate">{token.prefix}</div>
              </div>
              <div className="flex flex-wrap gap-1 md:col-span-3">
                {token.scopes.map((scope) => (
                  <Badge key={scope} tone="soft">
                    {scope}
                  </Badge>
                ))}
              </div>
              <div className="num text-[11.5px] text-muted2 md:col-span-2">{token.requestCount || 0} 次</div>
              <div className="num text-[11.5px] text-muted2 md:col-span-2">
                {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString('zh-CN', { hour12: false }) : '未使用'}
              </div>
              <div className="flex items-center justify-end gap-1 md:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => action(token.revoked ? '令牌已恢复' : '令牌已吊销', () => api.updateToken(token.id, { revoked: !token.revoked }))}
                >
                  {token.revoked ? '恢复' : '吊销'}
                </Button>
                <IconButton
                  icon="trash"
                  label="删除令牌"
                  onClick={async () => {
                    if (!window.confirm(`删除令牌「${token.name}」？`)) return;
                    await action('令牌已删除', () => api.deleteToken(token.id));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="签发新令牌"
        description="密钥只在创建时返回一次，之后只保留掩码。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button icon="key" onClick={create} disabled={!name.trim() || scopes.length === 0}>
              签发
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="令牌名称">
            <input className="input" value={name} placeholder="例如：家庭自动化脚本" onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="权限范围">
            <div className="flex flex-wrap gap-1.5">
              {SCOPES.map((scope) => {
                const active = scopes.includes(scope.value);
                return (
                  <button
                    key={scope.value}
                    type="button"
                    onClick={() => setScopes(active ? scopes.filter((item) => item !== scope.value) : [...scopes, scope.value])}
                    className={cn('chip px-2.5 py-1.5', active && 'chip-active')}
                    title={scope.hint}
                  >
                    {active ? <Icon name="check" size={11} /> : null}
                    {scope.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="备注">
            <input className="input" value={note} placeholder="可选，便于团队识别" onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="rounded-lg border border-line bg-mist px-3 py-2.5 text-[11.5px] leading-5 text-slate1">
            调用示例：<code className="font-mono">curl -H &quot;Authorization: Bearer sk-ice-…&quot; {window.location.origin}/api/devices</code>
          </div>
        </div>
      </Modal>
    </div>
  );
}
