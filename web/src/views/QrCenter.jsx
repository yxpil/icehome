import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, CopyButton, EmptyState, Field, SectionHeader, Switch, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const STATUS_META = {
  ok: { label: '正常', tone: 'soft' },
  issue: { label: '异常', tone: 'warn' },
  offline: { label: '离线', tone: 'line' }
};

function statusLabel(value) {
  return STATUS_META[value]?.label || value;
}

function formatTime(value) {
  if (!value) return '尚未巡检';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function QrCenterView() {
  const { state, action, setView } = useApp();
  const isAdmin = state.account?.role === 'admin';
  const [labels, setLabels] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('ok');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [inspections, setInspections] = useState(state.inspections || []);
  const [configData, setConfigData] = useState(null);
  const [wifiData, setWifiData] = useState(null);
  const [wifiDraft, setWifiDraft] = useState({ ssid: '', password: '', security: 'WPA', hidden: false });
  const [networkInfo, setNetworkInfo] = useState(null);
  const [cidr, setCidr] = useState('192.168.1.0/24');
  const [portsText, setPortsText] = useState('80,443,8080,8123,8787,1883,554');
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const refreshInspections = useCallback(async () => {
    try {
      const result = await api.inspections(50);
      setInspections(result.inspections || []);
    } catch {
      // 巡检记录刷新失败时保留上一份列表
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api.deviceQr()
      .then((result) => {
        if (!alive) return;
        const items = result.labels || [];
        setLabels(items);
        setSelectedId((current) => current || items[0]?.deviceId || '');
      })
      .catch(() => {});
    refreshInspections();
    return () => {
      alive = false;
    };
  }, [refreshInspections]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    api.networkInterfaces()
      .then((result) => {
        if (!alive) return;
        setNetworkInfo(result);
        if (result.suggestedCidr) setCidr(result.suggestedCidr);
      })
      .catch(() => {});
    api.wifiQr()
      .then((result) => {
        if (!alive) return;
        setWifiData(result);
        setWifiDraft({
          ssid: result.wifi.ssid,
          password: result.wifi.password,
          security: result.wifi.security,
          hidden: result.wifi.hidden
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const selectedLabel = useMemo(
    () => labels.find((item) => item.deviceId === selectedId) || null,
    [labels, selectedId]
  );

  const lastByDevice = useMemo(() => {
    const map = new Map();
    for (const item of inspections) {
      if (!map.has(item.deviceId)) map.set(item.deviceId, item);
    }
    return map;
  }, [inspections]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setCameraMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('当前浏览器不支持摄像头，请在右侧粘贴二维码内容。');
      return;
    }
    if (!('BarcodeDetector' in window)) {
      setCameraMessage('当前浏览器缺少 BarcodeDetector，推荐使用 Chrome/Edge 或手工粘贴标签内容。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      timerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) {
            setCode(found[0].rawValue);
            stopCamera();
          }
        } catch {
          // 单帧识别失败不打断持续扫描
        }
      }, 500);
    } catch {
      setCameraMessage('摄像头启动失败，请检查浏览器权限，或改用粘贴方式。');
      stopCamera();
    }
  };

  const record = async (payload, message) => {
    const result = await action(message, () => api.inspectDevice(payload));
    if (result) {
      setNote('');
      await refreshInspections();
    }
    return result;
  };

  const submitScan = async () => {
    if (!code.trim()) return;
    const result = await action('扫码巡检已记录', () => api.scanInspection({ code: code.trim(), status, note }));
    if (result) {
      setCode('');
      setNote('');
      await refreshInspections();
    }
  };

  const generateConfig = async () => {
    const result = await action('配置二维码已生成', () => api.configQr());
    if (result) setConfigData(result);
  };

  const downloadConfig = () => {
    if (!configData) return;
    const blob = new Blob([JSON.stringify(configData.config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = configData.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveWifi = async () => {
    const result = await action('Wi-Fi 配置已保存', () => api.settings({ wifi: wifiDraft }));
    if (result) {
      const qrResult = await api.wifiQr();
      setWifiData(qrResult);
      setWifiDraft({
        ssid: qrResult.wifi.ssid,
        password: qrResult.wifi.password,
        security: qrResult.wifi.security,
        hidden: qrResult.wifi.hidden
      });
    }
  };

  const scanSubnet = async () => {
    const ports = portsText
      .split(/[\s,，]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
    setScanning(true);
    try {
      const result = await action('网段扫描完成', () => api.scanNetwork({ cidr, ports: ports.length ? ports : undefined }));
      if (result) setScanResult(result);
    } finally {
      setScanning(false);
    }
  };

  const addToPairing = async (host) => {
    const result = await action('已加入待配对', () =>
      api.startPairing({ deviceName: `网段设备 ${host.ip}`, template: 'switch' })
    );
    if (result) setView({ kind: 'pairing' });
  };

  const selectedLast = selectedLabel ? lastByDevice.get(selectedLabel.deviceId) : null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="二维码巡检"
        description="生成配置与设备标签二维码，扫码登记巡检结果，并用 Wi-Fi 二维码联动家庭网段发现待接入设备。"
      />

      {isAdmin ? (
        <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="label">配置二维码</div>
                <div className="mt-1 text-[11.5px] text-muted2">完整设置、分类、设备与适配器、任务、插件、平面图</div>
              </div>
              <Button size="sm" icon="qr" onClick={generateConfig}>
                {configData ? '重新生成' : '生成二维码'}
              </Button>
            </div>
            {configData ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  {configData.qr ? (
                    <div
                      className="rounded-lg border border-line bg-white p-2 [&_svg]:h-[178px] [&_svg]:w-[178px]"
                      dangerouslySetInnerHTML={{ __html: configData.qr }}
                    />
                  ) : (
                    <div className="flex h-[196px] w-[196px] items-center justify-center rounded-lg border border-dashed border-line text-center text-[11px] text-muted2">
                      配置二维码生成失败，请直接下载 JSON 文件
                    </div>
                  )}
                  <CopyButton text={configData.qrPayload || configData.payload} label="复制下载链接" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="soft">{configData.stats.devices} 台设备</Badge>
                    <Badge tone="soft">{configData.stats.tasks} 个任务</Badge>
                    <Badge tone="soft">{configData.stats.plans} 张平面图</Badge>
                    <Badge tone="line">{(configData.stats.bytes / 1024).toFixed(1)} KB</Badge>
                  </div>
                  <div className="mt-3 rounded-lg border border-line2 bg-mist px-3 py-2 text-[11.5px] leading-5 text-muted2">
                    配置不包含账户、令牌和事件；Wi-Fi 口令会随配置进入二维码，请只在可信环境中展示。
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" icon="download" onClick={downloadConfig}>
                      下载配置文件
                    </Button>
                    <CopyButton text={JSON.stringify(configData.config, null, 2)} label="复制 JSON" />
                  </div>
                  <div className="mono-tag mt-3 break-all">{configData.filename}</div>
                  <div className="mt-2 text-[11.5px] text-muted2">二维码指向 10 分钟有效的只读下载链接；过期后重新生成即可。</div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="qr"
                title="尚未生成配置二维码"
                description="生成后可扫码归档或下载一份可读的 JSON 配置。"
                action={<Button variant="outline" icon="qr" onClick={generateConfig}>生成配置二维码</Button>}
              />
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="label">Wi-Fi 配网二维码</div>
                <div className="mt-1 text-[11.5px] text-muted2">安卓 / iOS 相机扫码直接加入家庭 Wi-Fi</div>
              </div>
              <Badge tone="soft">
                <Icon name="wifi" size={10} />
                {wifiDraft.security}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Wi-Fi 名称" className="col-span-2">
                <input
                  className="input"
                  value={wifiDraft.ssid}
                  onChange={(event) => setWifiDraft({ ...wifiDraft, ssid: event.target.value })}
                  maxLength={32}
                  aria-label="Wi-Fi 名称"
                />
              </Field>
              <Field label="口令">
                <input
                  className="input"
                  type="password"
                  value={wifiDraft.password}
                  onChange={(event) => setWifiDraft({ ...wifiDraft, password: event.target.value })}
                  maxLength={63}
                  disabled={wifiDraft.security === 'nopass'}
                  aria-label="Wi-Fi 口令"
                />
              </Field>
              <Field label="加密方式">
                <select
                  className="select"
                  value={wifiDraft.security}
                  onChange={(event) => setWifiDraft({ ...wifiDraft, security: event.target.value })}
                  aria-label="Wi-Fi 加密方式"
                >
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">不加密</option>
                </select>
              </Field>
            </div>
            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="text-[11.5px] text-muted2">隐藏网络</span>
              <Switch
                checked={wifiDraft.hidden}
                onChange={(value) => setWifiDraft({ ...wifiDraft, hidden: value })}
                label="隐藏 Wi-Fi 网络"
              />
            </div>
            <Button className="mt-3" size="sm" icon="wifi" onClick={saveWifi}>
              保存并生成二维码
            </Button>
            {wifiData ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-line bg-mist p-3">
                <div
                  className="rounded-md bg-white p-1.5 [&_svg]:h-[154px] [&_svg]:w-[154px]"
                  dangerouslySetInnerHTML={{ __html: wifiData.qr }}
                />
                <CopyButton text={wifiData.payload} label="复制 Wi-Fi 二维码内容" />
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">设备巡检标签</span>
            <Badge tone="soft">{labels.length} 个可巡检设备</Badge>
          </div>
          {labels.length === 0 ? (
            <EmptyState icon="qr" title="没有可巡检设备" description="当前账户还没有获得任何设备授权。" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-2">
                {selectedLabel ? (
                  <div
                    className="rounded-lg border border-line bg-white p-2 [&_svg]:h-[150px] [&_svg]:w-[150px]"
                    dangerouslySetInnerHTML={{ __html: selectedLabel.qr }}
                  />
                ) : null}
                <div className="mono-tag text-center">{selectedLabel?.name}</div>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="选择设备">
                  <select
                    className="select"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    aria-label="选择巡检设备"
                  >
                    {labels.map((item) => (
                      <option key={item.deviceId} value={item.deviceId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="标签内容" hint="用于手工粘贴或打印">
                  <input className="input mono-tag" readOnly value={selectedLabel?.payload || ''} aria-label="设备二维码内容" />
                </Field>
                <div className="rounded-lg border border-line2 bg-mist px-3 py-2 text-[11.5px]">
                  最近巡检：
                  {selectedLast ? (
                    <span className="ml-1 font-medium">
                      {statusLabel(selectedLast.status)} · {formatTime(selectedLast.ts)}
                    </span>
                  ) : (
                    <span className="ml-1 text-muted2">尚未记录</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={status === key ? 'solid' : 'outline'}
                      onClick={() => setStatus(key)}
                    >
                      {meta.label}
                    </Button>
                  ))}
                </div>
                <Field label="巡检备注">
                  <input
                    className="input"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={120}
                    placeholder="例如：指示灯正常，网络稳定"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    icon="check"
                    disabled={!selectedId}
                    onClick={() => record({ deviceId: selectedId, status, note }, '巡检已记录')}
                  >
                    记录这台设备
                  </Button>
                  {selectedLabel ? <CopyButton text={selectedLabel.payload} label="复制标签内容" /> : null}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">扫码巡检</span>
            <Badge tone="soft">
              <Icon name="camera" size={10} />
              摄像头 / 粘贴
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="二维码内容" hint="icehome://device?id=…">
              <input
                className="input"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="粘贴设备标签二维码内容"
                aria-label="巡检二维码内容"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {cameraOn ? (
                <Button size="sm" variant="outline" icon="close" onClick={stopCamera}>
                  停止扫描
                </Button>
              ) : (
                <Button size="sm" variant="outline" icon="camera" onClick={startCamera}>
                  开启摄像头
                </Button>
              )}
              <Button size="sm" icon="qr" disabled={!code.trim()} onClick={submitScan}>
                提交扫码结果
              </Button>
            </div>
            <video
              ref={videoRef}
              className={cn('aspect-video w-full rounded-lg border border-line bg-ink object-cover', !cameraOn && 'hidden')}
              muted
              playsInline
            />
            {!cameraOn ? (
              <div className="rounded-lg border border-dashed border-line bg-mist px-3 py-8 text-center text-[11.5px] text-muted2">
                摄像头识别需要 Chrome / Edge 的 BarcodeDetector 支持；也可直接粘贴标签内容。
              </div>
            ) : null}
            {cameraMessage ? <div className="text-[11.5px] text-ink">! {cameraMessage}</div> : null}
            <div className="rounded-lg border border-line2 bg-mist px-3 py-2 text-[11.5px] leading-5 text-muted2">
              扫码后会按当前选择的巡检状态写入记录；成员只能巡检自己获得授权的设备。
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">巡检记录</span>
          <Button variant="outline" size="sm" icon="refresh" onClick={refreshInspections}>
            刷新
          </Button>
        </div>
        {inspections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[11.5px] text-muted2">
            还没有巡检记录，从上方选择设备或扫码开始。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[11.5px]">
              <thead className="text-[9.5px] uppercase tracking-[0.14em] text-muted2">
                <tr className="border-b border-line">
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium">设备</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">巡检人</th>
                  <th className="pb-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {inspections.slice(0, 12).map((item) => (
                  <tr key={item.id} className="border-b border-line2 last:border-0">
                    <td className="py-2 pr-3 text-muted2 num">{formatTime(item.ts)}</td>
                    <td className="py-2 pr-3 font-medium">{item.deviceName}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_META[item.status]?.tone || 'line'}>{statusLabel(item.status)}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted2">{item.by}</td>
                    <td className="max-w-[260px] truncate py-2 text-muted2">{item.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAdmin ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="label">Wi-Fi 联动网段扫描</div>
              <div className="mt-1 text-[11.5px] text-muted2">只扫描私有网段，探测常见家庭设备端口；发现后可直接加入待配对。</div>
            </div>
            <Badge tone="soft">
              <Icon name="search" size={10} />
              受控 TCP 探测
            </Badge>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="目标网段" hint="/24 - /32">
              <input className="input mono-tag" value={cidr} onChange={(event) => setCidr(event.target.value)} aria-label="扫描网段" />
            </Field>
            <Field label="端口" hint="逗号分隔，最多 8 个">
              <input className="input mono-tag" value={portsText} onChange={(event) => setPortsText(event.target.value)} aria-label="扫描端口" />
            </Field>
            <Button icon="search" onClick={scanSubnet} disabled={scanning}>
              {scanning ? '扫描中…' : '扫描网段'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(networkInfo?.interfaces || []).map((item) => (
              <Badge key={`${item.name}-${item.address}`} tone="line">
                {item.name} · {item.address}
              </Badge>
            ))}
            {networkInfo?.interfaces?.length === 0 ? <Badge tone="line">未发现外部 IPv4 网卡</Badge> : null}
          </div>
          {scanResult ? (
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted2">
                <Badge tone="soft">{scanResult.cidr}</Badge>
                <span>扫描 {scanResult.scanned} 台主机</span>
                <span>·</span>
                <span>发现 {scanResult.found.length} 台</span>
                <span>·</span>
                <span>{(scanResult.durationMs / 1000).toFixed(1)}s</span>
              </div>
              {scanResult.found.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-4 py-7 text-center text-[11.5px] text-muted2">
                  该网段没有发现开放常见端口的设备。请确认面板与设备在同一 Wi-Fi。
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {scanResult.found.map((host) => (
                    <div key={host.ip} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="num text-[12.5px] font-medium">{host.ip}</div>
                        <div className="mono-tag mt-0.5">
                          端口 {host.ports.join(' / ')} · {host.details?.map((item) => item.service).join(' / ') || 'tcp'} · {host.latencyMs}ms
                        </div>
                      </div>
                      <Button size="sm" variant="outline" icon="link" onClick={() => addToPairing(host)}>
                        加入待配对
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={cn('mt-3 rounded-lg border border-dashed border-line px-4 py-7 text-center text-[11.5px] text-muted2')}>
              扫描结果会列出 IP、开放端口与延迟；不会尝试登录或修改远端设备。
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
