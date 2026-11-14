import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Field, Modal, Switch, Tabs, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

export function AddDeviceModal({ open, onClose }) {
  const { state, action, setView } = useApp();
  const [tab, setTab] = useState('create');
  const [templateKey, setTemplateKey] = useState('light');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [capabilities, setCapabilities] = useState(
    state.templates.find((item) => item.key === 'light')?.capabilities || ['power']
  );
  const [adapterKind, setAdapterKind] = useState('mock');
  const [adapterUrl, setAdapterUrl] = useState('');
  const [adapterWrite, setAdapterWrite] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = state.templates.find((item) => item.key === templateKey);

  const reset = () => {
    setTab('create');
    setName('');
    setTemplateKey('light');
    setCapabilities(state.templates.find((item) => item.key === 'light')?.capabilities || ['power']);
    setAdapterKind('mock');
    setAdapterUrl('');
    setAdapterWrite(false);
    setImportCode('');
  };

  const chooseTemplate = (key) => {
    setTemplateKey(key);
    const item = state.templates.find((entry) => entry.key === key);
    if (item) setCapabilities(item.capabilities);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const result = await action(
      '设备已创建',
      () =>
        api.createDevice({
          name: name.trim(),
          categoryId: categoryId || null,
          template: templateKey,
          capabilities,
          adapter:
            adapterKind === 'http'
              ? { kind: 'http', url: adapterUrl, method: 'POST', body: '{"state":"{{state.power}}"}', write: adapterWrite }
              : { kind: 'mock' }
        })
    );
    setBusy(false);
    if (result) {
      reset();
      onClose();
    }
  };

  const doImport = async () => {
    if (!importCode.trim()) return;
    setBusy(true);
    const result = await action('导入完成', () => api.importBundle(importCode.trim()));
    setBusy(false);
    if (result) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加设备"
      description="从模板创建、自定义能力，或粘贴二维码内容导入。"
      width="max-w-2xl"
      footer={
        tab === 'create' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button icon="plus" onClick={submit} disabled={busy || !name.trim() || capabilities.length === 0}>
              创建设备
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button icon="upload" onClick={doImport} disabled={busy || !importCode.trim()}>
              导入
            </Button>
          </>
        )
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'create', label: '模板 / 自定义' },
          { value: 'import', label: '扫码导入' }
        ]}
        className="mb-4"
      />

      {tab === 'create' ? (
        <div className="flex flex-col gap-4">
          <Field label="设备类型" hint="插件安装的模板会追加在这里">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {state.templates.map((item) => (
                <button
                  key={`${item.key}-${item.origin}`}
                  type="button"
                  onClick={() => chooseTemplate(item.key)}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    templateKey === item.key ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink/40'
                  )}
                >
                  <Icon name={item.icon} size={15} className={templateKey === item.key ? 'opacity-90' : 'text-muted2'} />
                  <span className="w-full truncate text-[11.5px]">{item.label}</span>
                  <span className={cn('text-[9.5px]', templateKey === item.key ? 'text-white/60' : 'text-muted2')}>
                    {item.origin === 'builtin' ? '内置' : item.origin}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="设备名称">
              <input
                className="input"
                placeholder={selected?.label || '例如：书房台灯'}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
              />
            </Field>
            <Field label="所属分类">
              <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">未分类</option>
                {state.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="设备能力" hint={`已选 ${capabilities.length} 项，决定可用状态字段`}>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-line p-2.5">
              {state.capabilities.map((cap) => {
                const active = capabilities.includes(cap.key);
                return (
                  <button
                    key={cap.key}
                    type="button"
                    onClick={() =>
                      setCapabilities(active ? capabilities.filter((key) => key !== cap.key) : [...capabilities, cap.key])
                    }
                    className={cn('chip transition-colors', active && 'chip-active')}
                  >
                    {active ? <Icon name="check" size={11} /> : null}
                    {cap.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="rounded-xl border border-line p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="label">接口配置</span>
              <Badge tone={adapterKind === 'http' ? 'ink' : 'line'}>
                {adapterKind === 'http' ? '自定义接口' : '内置模拟'}
              </Badge>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="适配器">
                <select className="select" value={adapterKind} onChange={(event) => setAdapterKind(event.target.value)}>
                  <option value="mock">内置模拟（状态保存在本地）</option>
                  <option value="http">HTTP 接口（对接真实设备）</option>
                </select>
              </Field>
              {adapterKind === 'http' ? (
                <>
                  <Field label="请求地址" hint="支持 {{device.id}} / {{state.power}} 模板">
                    <input
                      className="input font-mono text-[12px]"
                      placeholder="http://192.168.1.20/api/light"
                      value={adapterUrl}
                      onChange={(event) => setAdapterUrl(event.target.value)}
                    />
                  </Field>
                  <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <span className="text-[12px]">动作执行时写回该接口</span>
                    <Switch checked={adapterWrite} onChange={setAdapterWrite} label="写回接口" />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11.5px] leading-5 text-muted2">
            <Icon name="sparkle" size={13} className="mt-[2px] shrink-0" />
            <span>更复杂的接口映射与状态读取路径，可在创建设备后到设备详情「接口」页继续调整。</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="rounded-lg border border-line bg-mist px-3 py-2.5 text-[11.5px] leading-5 text-slate1">
            扫码得到的形如 <code className="font-mono">icehome://import?payload=…</code> 或
            <code className="mx-1 font-mono">icehome://pair?code=…</code> 的内容可直接粘贴到这里；配对码也可以去「配对与导入」页面审批。
          </div>
          <Field label="导入内容" hint="支持 base64url 载荷或完整链接">
            <textarea
              className="textarea"
              rows={5}
              placeholder="icehome://import?payload=..."
              value={importCode}
              onChange={(event) => setImportCode(event.target.value)}
            />
          </Field>
          <Button
            variant="outline"
            size="sm"
            icon="qr"
            className="self-start"
            onClick={() => {
              onClose();
              setView({ kind: 'pairing' });
            }}
          >
            前往配对页生成二维码
          </Button>
        </div>
      )}
    </Modal>
  );
}
