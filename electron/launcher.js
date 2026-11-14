const $ = (id) => document.getElementById(id);

const platformNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
const archNames = { x64: 'x64', arm64: 'arm64', ia32: 'ia32' };

let state = null;
let selectedMode = 'local';
let hydrated = false;
let dirty = false;
let toastTimer = null;

function setOverlay(show, title = '正在连接', text = '请稍候，正在准备面板服务。') {
  $('overlay').hidden = !show;
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
}

function setError(message) {
  const target = $('errorLine');
  target.textContent = message || '';
  target.classList.toggle('is-error', Boolean(message));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

async function copy(value) {
  if (!value) return;
  await window.iceDesktop.copyText(value);
  showToast('地址已复制');
}

function platformLabel() {
  if (!state) return '—';
  const platform = platformNames[state.platform] || state.platform;
  const arch = archNames[state.arch] || state.arch;
  return `${platform} · ${arch}`;
}

function selectMode(mode) {
  selectedMode = mode;
  $('tabLocal').classList.toggle('is-active', mode === 'local');
  $('tabRemote').classList.toggle('is-active', mode === 'remote');
  $('localPanel').classList.toggle('is-current', mode === 'local');
  $('remotePanel').classList.toggle('is-current', mode === 'remote');
  $('headMode').textContent = mode === 'remote' ? '远程模式' : '本地模式';
  const panel = mode === 'remote' ? $('remotePanel') : $('localPanel');
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderProfiles(profiles = []) {
  const box = $('profiles');
  box.replaceChildren();
  if (!profiles.length) {
    const empty = document.createElement('span');
    empty.className = 'profile is-empty';
    empty.textContent = '连接成功后会自动出现在这里';
    box.append(empty);
    return;
  }
  for (const profile of profiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile';
    button.textContent = profile.label || profile.url;
    button.title = profile.url;
    button.addEventListener('click', () => {
      $('remoteUrl').value = profile.url;
      dirty = true;
      selectMode('remote');
      $('remoteUrl').focus();
    });
    box.append(button);
  }
}

function renderLocal(stateValue) {
  const local = stateValue.local;
  const dot = $('localDot');
  dot.classList.toggle('is-on', Boolean(local.running));
  dot.classList.toggle('is-error', Boolean(stateValue.error) && !local.running);

  $('localStatusTitle').textContent = local.running
    ? `服务运行中 · 端口 ${local.port}`
    : '服务未启动';
  $('localStatusText').textContent = local.running
    ? `${local.lanOnly ? '仅本机访问' : '局域网可访问'} · ${local.dataDir}`
    : '启动后会自动打开控制面板。';
  $('localStatusText').title = local.dataDir || '';

  const urls = $('localUrls');
  urls.replaceChildren();
  if (local.running) {
    const entries = [{ label: `127.0.0.1:${local.port}`, url: local.url }];
    for (const url of local.lanUrls || []) {
      entries.push({ label: url.replace('http://', ''), url });
    }
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-chip';
      button.textContent = entry.label;
      button.title = `复制 ${entry.url}`;
      button.addEventListener('click', () => copy(entry.url));
      urls.append(button);
    }
  }
  $('connectLocal').textContent = local.running ? '打开面板' : '启动并使用';
  $('restartLocal').disabled = !local.running;
}

function applyState(next, { fill = false } = {}) {
  state = next;
  $('platformText').textContent = platformLabel();
  $('archText').textContent = archNames[next.arch] || next.arch;
  $('electronText').textContent = next.versions.electron;
  $('versionText').textContent = next.versions.app;
  $('headMode').textContent = (next.mode === 'remote' ? '远程' : '本地') + '模式';
  renderProfiles(next.remote.profiles);
  renderLocal(next);
  $('autoConnect').checked = Boolean(next.autoConnect);
  $('errorLine').textContent = next.error || '';
  $('errorLine').classList.toggle('is-error', Boolean(next.error));
  $('logBox').textContent = (next.logs || []).slice(-3).join('\n');

  if ((fill || !hydrated) && !dirty) {
    $('localPort').value = next.local.configuredPort || next.local.port || 8788;
    $('localHost').value = next.local.host === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0';
    $('dataDir').value = next.local.dataDir;
    $('remoteUrl').value = next.remote.url;
    $('allowSelfSigned').checked = Boolean(next.remote.allowSelfSigned);
    $('autoConnect').checked = Boolean(next.autoConnect);
    selectMode(next.mode === 'remote' ? 'remote' : 'local');
    hydrated = true;
  } else if (!hydrated) {
    selectMode(next.mode === 'remote' ? 'remote' : 'local');
    hydrated = true;
  }
}

function payload(mode) {
  return {
    mode,
    localPort: Number($('localPort').value),
    localHost: $('localHost').value,
    dataDir: $('dataDir').value,
    remoteUrl: $('remoteUrl').value,
    allowSelfSigned: $('allowSelfSigned').checked,
    autoConnect: $('autoConnect').checked
  };
}

async function connect(mode) {
  if (!window.iceDesktop) {
    setError('桌面端桥接未加载');
    return;
  }
  setError('');
  const isRemote = mode === 'remote';
  setOverlay(
    true,
    isRemote ? '正在连接远程面板' : '正在启动本地服务',
    isRemote ? '正在检查服务器健康状态…' : '首次启动会写入示例数据，请稍候。'
  );
  try {
    const result = await window.iceDesktop.connect(payload(mode));
    if (!result.ok) {
      setOverlay(false);
      setError(result.error || '连接失败');
      return;
    }
    dirty = false;
    const next = await window.iceDesktop.getState();
    applyState(next, { fill: true });
    setOverlay(false);
  } catch (error) {
    setOverlay(false);
    setError(`连接失败：${error.message}`);
  }
}

async function testRemote() {
  if (!window.iceDesktop) return;
  setError('');
  const dot = $('remoteDot');
  dot.classList.remove('is-on', 'is-error');
  $('remoteStatusTitle').textContent = '正在测试…';
  $('remoteStatusText').textContent = '连接 /api/health 检查服务。';
  const result = await window.iceDesktop.testRemote({
    url: $('remoteUrl').value,
    allowSelfSigned: $('allowSelfSigned').checked
  });
  if (!result.ok) {
    dot.classList.add('is-error');
    $('remoteStatusTitle').textContent = '连接失败';
    $('remoteStatusText').textContent = result.error || '未知错误';
    setError(result.error || '');
    return;
  }
  dot.classList.add('is-on');
  $('remoteStatusTitle').textContent = `连接正常 · ${result.latencyMs} ms`;
  $('remoteStatusText').textContent = `${result.service || 'ICEHOME'} ${result.version || ''} · ${result.url}`.trim();
}

async function restartLocal() {
  setOverlay(true, '正在重启本地服务', '会先写入数据，再重新监听端口。');
  try {
    const result = await window.iceDesktop.restartLocal();
    if (!result.ok) {
      setError(result.error || '重启失败');
    } else {
      dirty = false;
      applyState(result.state || (await window.iceDesktop.getState()), { fill: true });
    }
  } finally {
    setOverlay(false);
  }
}

async function chooseDir() {
  const selected = await window.iceDesktop.chooseDataDir();
  if (selected) {
    $('dataDir').value = selected;
    dirty = true;
  }
}

function bind() {
  $('tabLocal').addEventListener('click', () => selectMode('local'));
  $('tabRemote').addEventListener('click', () => selectMode('remote'));
  $('chooseDir').addEventListener('click', () => chooseDir().catch((error) => setError(error.message)));
  $('connectLocal').addEventListener('click', () => connect('local'));
  $('connectRemote').addEventListener('click', () => connect('remote'));
  $('testRemote').addEventListener('click', () => testRemote());
  $('restartLocal').addEventListener('click', () => restartLocal());
  for (const id of ['localPort', 'localHost', 'dataDir', 'remoteUrl', 'allowSelfSigned', 'autoConnect']) {
    $(id).addEventListener('input', () => {
      dirty = true;
    });
    $(id).addEventListener('change', () => {
      dirty = true;
    });
  }
  $('remoteUrl').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') connect('remote');
  });
  window.iceDesktop.onStatus((next) => applyState(next));
}

async function init() {
  bind();
  try {
    const next = await window.iceDesktop.getState();
    applyState(next, { fill: true });
  } catch (error) {
    setError(`初始化失败：${error.message}`);
  }
}

init();
