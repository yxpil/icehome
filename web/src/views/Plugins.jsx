import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, SectionHeader, Switch } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const EXAMPLE = {
  name: '书房阅读模式',
  key: 'local.reading-mode',
  version: '1.0.0',
  author: '本地安装',
  description: '提供阅读灯模板与一键场景钩子。',
  icon: 'book',
  templates: [
    {
      key: 'reading_lamp',
      name: '阅读灯',
      icon: 'bulb',
      capabilities: ['power', 'brightness', 'colorTemp']
    }
  ],
  hooks: [{ on: 'device.state', action: 'notify' }]
};

export function PluginsView() {
  const { state, action } = useApp();
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState('');
  const [error, setError] = useState('');

  const install = async () => {
    setError('');
    let parsed;
    try {
      parsed = JSON.parse(manifest);
    } catch (err) {
      setError(`JSON 解析失败：${err.message}`);
      return;
    }
    const result = await action('插件已安装', () => api.installPlugin(parsed));
    if (result) {
      setOpen(false);
      setManifest('');
    }
  };

  const active = state.plugins.filter((plugin) => plugin.enabled).length;
  const contributed = state.templates.filter((item) => item.origin !== 'builtin');

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="插件"
        description="插件可提供新的设备模板与自动化钩子，安装后立即出现在添加设备面板。"
        action={
          <Button icon="plus" onClick={() => setOpen(true)}>
            安装插件
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: '已安装', value: state.plugins.length },
          { label: '已启用', value: active },
          { label: '模板贡献', value: contributed.length },
          { label: '可用能力', value: state.capabilities.length }
        ].map((item) => (
          <div key={item.label} className="kpi">
            <span className="label">{item.label}</span>
            <span className="num text-[20px] font-semibold leading-none tracking-tight">{item.value}</span>
          </div>
        ))}
      </div>

      {state.plugins.length === 0 ? (
        <EmptyState icon="puzzle" title="还没有插件" description="安装一个插件来扩展设备模板。" action={<Button icon="plus" onClick={() => setOpen(true)}>安装插件</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {state.plugins.map((plugin) => (
            <Card key={plugin.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-mist text-slate1">
                    <Icon name={plugin.icon || 'puzzle'} size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{plugin.name}</span>
                      {plugin.builtin ? <Badge tone="soft">内置</Badge> : null}
                    </div>
                    <div className="mono-tag">
                      v{plugin.version} · {plugin.author}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={plugin.enabled}
                  onChange={(next) => action(next ? '插件已启用' : '插件已停用', () => api.updatePlugin(plugin.id, { enabled: next }))}
                  label={`启用 ${plugin.name}`}
                />
              </div>

              <p className="muted mt-2.5 min-h-[40px]">{plugin.description || '暂无描述'}</p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{plugin.templates?.length || 0} 个模板</Badge>
                <Badge>{plugin.hooks?.length || 0} 个钩子</Badge>
                {(plugin.templates || []).slice(0, 1).map((template) => (
                  <Badge key={template.key} tone="soft">
                    {template.name}
                  </Badge>
                ))}
                {plugin.builtin ? null : (
                  <span className="ml-auto">
                    <IconButton
                      icon="trash"
                      label="卸载插件"
                      onClick={async () => {
                        if (!window.confirm(`卸载插件「${plugin.name}」？`)) return;
                        await action('插件已卸载', () => api.deletePlugin(plugin.id));
                      }}
                    />
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="安装插件"
        description="粘贴插件清单 JSON；templates 中的模板会成为新的设备类型。"
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button icon="upload" onClick={install} disabled={!manifest.trim()}>
              安装
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="插件清单" hint="JSON" error={error}>
            <textarea
              className="textarea"
              rows={10}
              placeholder={JSON.stringify(EXAMPLE, null, 2)}
              value={manifest}
              onChange={(event) => setManifest(event.target.value)}
            />
          </Field>
          <Button variant="outline" size="sm" icon="sparkle" className="self-start" onClick={() => setManifest(JSON.stringify(EXAMPLE, null, 2))}>
            填充示例
          </Button>
        </div>
      </Modal>
    </div>
  );
}
