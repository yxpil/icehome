import { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, CopyButton, SectionHeader, Tabs, cn } from '../ui.jsx';
import { Markdown } from '../Markdown.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const EXAMPLES = ['打开客厅主灯', '把客厅主灯亮度调到 40', '关闭所有灯', '客厅空调状态怎么样', '每天 22:30 关闭客厅主灯'];

export function AiView() {
  const { state, action } = useApp();
  const [tab, setTab] = useState('manual');
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .aiManual()
      .then((markdown) => {
        if (alive) setManual(markdown);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const run = async (value, dryRun = false) => {
    const input = (value ?? text).trim();
    if (!input) return;
    const response = await action('', () => api.aiCommand(input, dryRun));
    if (response) {
      setResult({ ...response, input, dryRun });
      setHistory((current) => [{ ...response, input, dryRun, at: new Date() }, ...current].slice(0, 6));
    }
  };

  const copyManual = () => {
    const blob = new Blob([manual], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ICEHOME-AI-操作手册.md';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const base = `${window.location.origin}/v1`;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="AI 操作手册"
        description="给 AI Agent 的接口说明书，以及一个不依赖外部模型的中文指令控制台。"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" icon="download" onClick={copyManual} disabled={!manual}>
              下载 Markdown
            </Button>
          </div>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'manual', label: '操作手册' },
          { value: 'console', label: '自然语言控制' },
          { value: 'api', label: 'OpenAI 端点' }
        ]}
      />

      {tab === 'manual' ? (
        <div className="grid gap-2.5 lg:grid-cols-[1fr_300px]">
          <Card className="max-h-[640px] overflow-y-auto p-5">
            {loading ? <div className="muted">正在生成手册…</div> : <Markdown text={manual} />}
          </Card>
          <div className="flex flex-col gap-2.5">
            <Card className="p-4">
              <div className="label mb-2">手册内容</div>
              <div className="flex flex-col gap-2 text-[11.5px] leading-5 text-slate1">
                <span className="flex items-center gap-2"><Icon name="key" size={13} /> 令牌与 scope 说明</span>
                <span className="flex items-center gap-2"><Icon name="list" size={13} /> 全部设备清单与状态</span>
                <span className="flex items-center gap-2"><Icon name="terminal" size={13} /> curl 请求示例</span>
                <span className="flex items-center gap-2"><Icon name="clock" size={13} /> 定时任务表达式</span>
                <span className="flex items-center gap-2"><Icon name="alert" size={13} /> 错误码与校验规则</span>
              </div>
            </Card>
            <Card className="p-4">
              <div className="label mb-2">设备上下文</div>
              <div className="num text-[20px] font-semibold leading-none">{state.devices.length}</div>
              <div className="mt-1 text-[11px] text-muted2">台设备已写入手册，随设备变更实时更新</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state.devices.slice(0, 4).map((device) => (
                  <Badge key={device.id}>{device.name}</Badge>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'console' ? (
        <div className="grid gap-2.5 lg:grid-cols-[1fr_320px]">
          <Card className="p-4">
            <div className="label mb-2">指令输入</div>
            <textarea
              className="textarea"
              rows={3}
              placeholder="例如：把客厅主灯亮度调到 40"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) run();
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button size="sm" icon="sparkle" onClick={() => run()} disabled={!text.trim()}>
                执行
              </Button>
              <Button variant="outline" size="sm" onClick={() => run(text, true)} disabled={!text.trim()}>
                仅解析
              </Button>
              <span className="mono-tag">Ctrl / Cmd + Enter 发送</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line2 pt-3">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="chip transition-colors hover:border-ink hover:text-ink"
                  onClick={() => {
                    setText(example);
                    run(example);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>

            {result ? (
              <div className="mt-4 rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={result.executed ? 'ink' : 'line'}>{result.executed ? '已执行' : '仅解析'}</Badge>
                    <span className="mono-tag">{result.intent}</span>
                  </div>
                  <span className="mono-tag">{(result.devices || []).length} 台设备</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-6 text-slate1">{result.reply}</p>
                {result.results?.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {result.results.map((item) => (
                      <div key={item.deviceId} className="mono-tag">
                        {item.name} · {JSON.stringify(item.changes)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="label mb-2">解析记录</div>
            {history.length === 0 ? (
              <div className="text-[11.5px] leading-5 text-muted2">执行指令后会在这里保留最近 6 条记录（仅当前页面）。</div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((item, index) => (
                  <button
                    key={`${item.input}-${index}`}
                    type="button"
                    onClick={() => setResult(item)}
                    className={cn(
                      'rounded-lg border px-2.5 py-2 text-left transition-colors',
                      item.executed ? 'border-line hover:border-ink/40' : 'border-dashed border-line'
                    )}
                  >
                    <div className="truncate text-[11.5px]">{item.input}</div>
                    <div className="mono-tag mt-0.5">
                      {item.intent} · {item.executed ? '已执行' : '仅解析'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'api' ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">OpenAI 兼容端点</span>
              <CopyButton text={base} label="复制基地址" />
            </div>
            <div className="flex flex-col gap-2 text-[11.5px]">
              {[
                ['Base URL', base],
                ['Model', 'icehome-1'],
                ['认证', 'Authorization: Bearer sk-ice-…'],
                ['端点', 'POST /v1/chat/completions'],
                ['流式', 'stream: true 支持 SSE']
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-line2 pb-1.5">
                  <span className="text-muted2">{key}</span>
                  <span className="truncate font-mono text-[11px]">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="label mb-1.5">调用示例</div>
              <pre className="overflow-x-auto rounded-lg border border-line bg-mist px-3 py-2.5 font-mono text-[11px] leading-5">
{`curl -X POST ${base}/chat/completions \\
  -H "Authorization: Bearer $ICE_TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"model":"icehome-1","messages":[{"role":"user","content":"打开客厅主灯"}]}'`}
              </pre>
            </div>
          </Card>

          <Card className="p-4">
            <div className="label mb-2">支持的指令形态</div>
            <div className="flex flex-col gap-2">
              {[
                { title: '开关类', text: '打开 / 关闭 / 切换 + 设备名或类型' },
                { title: '批量类', text: '关闭所有灯、打开全部插座（按类型批量匹配）' },
                { title: '状态类', text: '把亮度调到 40、空调温度设为 24' },
                { title: '查询类', text: '客厅空调状态怎么样' },
                { title: '排程类', text: '每天 22:30 关闭客厅主灯（自动创建任务）' }
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-line px-3 py-2">
                  <div className="text-[12px] font-medium">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted2">{item.text}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted2">
              <Icon name="alert" size={13} className="mt-[2px] shrink-0" />
              <span>解析在本地完成，不调用外部模型；无法识别时会返回候选设备提示。</span>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
