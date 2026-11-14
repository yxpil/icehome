import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, CopyButton, EmptyState, Field, SectionHeader, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

export function PairingView() {
  const { state, action } = useApp();
  const [deviceName, setDeviceName] = useState('');
  const [template, setTemplate] = useState('light');
  const [categoryId, setCategoryId] = useState('');
  const [pairResult, setPairResult] = useState(null);
  const [exportData, setExportData] = useState(null);
  const [importCode, setImportCode] = useState('');

  const pending = state.pairings.filter((item) => item.status === 'pending');

  const generate = async () => {
    if (!deviceName.trim()) return;
    const result = await action('配对码已生成', () =>
      api.startPairing({ deviceName: deviceName.trim(), template, categoryId: categoryId || null })
    );
    if (result) setPairResult(result);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="配对与导入"
        description="生成配对二维码完成设备接入，或导出一整份设备清单给另一套面板。"
        action={
          <Button variant="outline" icon="download" onClick={async () => {
            const result = await action('导出码已生成', () => api.exportBundle());
            if (result) setExportData(result);
          }}>
            生成导出码
          </Button>
        }
      />

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">新设备配对</span>
            <Badge tone="soft">
              <Icon name="qr" size={10} />
              扫码
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="设备名称">
              <input
                className="input"
                placeholder="例如：书房台灯"
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                maxLength={40}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="设备类型">
                <select className="select" value={template} onChange={(event) => setTemplate(event.target.value)}>
                  {state.templates.map((item) => (
                    <option key={`${item.key}-${item.origin}`} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="分类">
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
            <Button icon="qr" onClick={generate} disabled={!deviceName.trim()}>
              生成配对二维码
            </Button>
          </div>

          {pairResult ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-line bg-mist p-4">
              <div
                className="[&_svg]:h-40 [&_svg]:w-40"
                dangerouslySetInnerHTML={{ __html: pairResult.qr }}
              />
              <div className="num text-[18px] font-semibold tracking-[0.28em]">{pairResult.pairing.code}</div>
              <div className="mono-tag">{pairResult.pairing.deviceName} · 待审批</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  icon="check"
                  onClick={() => action('配对已完成', () => api.approvePairing(pairResult.pairing.code))}
                >
                  批准接入
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => action('已拒绝该配对', () => api.rejectPairing(pairResult.pairing.code))}
                >
                  拒绝
                </Button>
                <CopyButton text={pairResult.payload} label="复制链接" />
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">待审批配对</span>
            <Badge tone={pending.length ? 'ink' : 'line'}>{pending.length}</Badge>
          </div>
          {pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-[12px] text-muted2">
              暂无待审批的配对请求
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-mist">
                    <Icon name="qr" size={14} className="text-muted2" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{item.deviceName}</div>
                    <div className="mono-tag">
                      {item.code} · {item.template}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => action('配对已完成', () => api.approvePairing(item.code))}>
                      批准
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => action('已拒绝', () => api.rejectPairing(item.code))}>
                      拒绝
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-line2 pt-3">
            <div className="label mb-2">已处理</div>
            <div className="flex flex-col gap-1.5">
              {state.pairings.filter((item) => item.status !== 'pending').slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-[11.5px] text-muted2">
                  <span className="truncate">{item.deviceName}</span>
                  <span className="num">{item.code}</span>
                  <span className={cn(item.status === 'approved' ? 'text-ink' : 'text-muted2')}>{item.status === 'approved' ? '已接入' : '已拒绝'}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">导出设备清单</span>
            {exportData ? <Badge tone="soft">{exportData.bundle.devices.length} 台设备</Badge> : null}
          </div>
          {exportData ? (
            <div className="flex flex-col items-center gap-3">
              <div className="[&_svg]:h-40 [&_svg]:w-40" dangerouslySetInnerHTML={{ __html: exportData.qr }} />
              <div className="flex flex-wrap justify-center gap-2">
                <CopyButton text={exportData.payload} label="复制导入链接" />
                <CopyButton text={JSON.stringify(exportData.bundle, null, 2)} label="复制 JSON" />
              </div>
              <div className="mono-tag text-center">在另一套 ICEHOME 的导入框粘贴即可复刻分类与设备</div>
            </div>
          ) : (
            <EmptyState icon="upload" title="尚未生成导出码" description="导出的清单只包含设备模板与状态，不含密钥与事件。" action={<Button variant="outline" icon="download" onClick={async () => {
              const result = await action('导出码已生成', () => api.exportBundle());
              if (result) setExportData(result);
            }}>生成导出码</Button>} />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">从二维码导入</span>
            <Badge tone="soft">
              <Icon name="upload" size={10} />
              粘贴
            </Badge>
          </div>
          <Field label="导入内容" hint="icehome://import?payload=…">
            <textarea
              className="textarea"
              rows={6}
              placeholder="icehome://import?payload=..."
              value={importCode}
              onChange={(event) => setImportCode(event.target.value)}
            />
          </Field>
          <Button
            className="mt-3"
            icon="upload"
            onClick={async () => {
              if (!importCode.trim()) return;
              const result = await action('导入完成', () => api.importBundle(importCode.trim()));
              if (result) setImportCode('');
            }}
            disabled={!importCode.trim()}
          >
            开始导入
          </Button>
          <div className="mt-3 text-[11.5px] leading-5 text-muted2">
            导入会合并同名分类，跳过重复插件，并为每台设备重新生成 ID 与初始状态。
          </div>
        </Card>
      </div>
    </div>
  );
}
