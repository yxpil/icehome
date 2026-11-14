const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  dialog,
  shell,
  clipboard,
  nativeImage,
  session
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const { pathToFileURL } = require('node:url');
const shared = require('./shared.cjs');

const APP_ID = 'com.icehome.desktop';
const LOG_LIMIT = 24;

if (process.env.ICEHOME_DESKTOP_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.ICEHOME_DESKTOP_USER_DATA));
}

let settings = null;
let localRuntime = null;
let launcherWindow = null;
let mainWindow = null;
let tray = null;
let lastError = '';
let busy = false;
let quitting = false;
let allowQuit = false;
let runtimeModulePromise = null;
const logs = [];

function logLine(message) {
  const line = `${new Date().toISOString()} ${message}`;
  logs.push(line);
  if (logs.length > LOG_LIMIT) logs.shift();
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'desktop.log'), `${line}\n`, 'utf8');
  } catch {
    /* 日志失败不影响运行 */
  }
  console.log(`[desktop] ${message}`);
}

const logger = {
  info: (message) => logLine(String(message)),
  warn: (message) => logLine(String(message)),
  error: (message) => logLine(String(message))
};

function defaultSettings() {
  return {
    mode: 'local',
    localPort: shared.DEFAULT_LOCAL_PORT,
    localHost: '0.0.0.0',
    dataDir: process.env.ICEHOME_DESKTOP_DATA_DIR
      ? path.resolve(process.env.ICEHOME_DESKTOP_DATA_DIR)
      : path.join(app.getPath('userData'), 'data'),
    remoteUrl: shared.DEFAULT_REMOTE_URL,
    allowSelfSigned: false,
    autoConnect: false,
    profiles: [],
    windowBounds: { width: 1440, height: 920 }
  };
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function loadSettings() {
  const defaults = defaultSettings();
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return shared.sanitizeSettings(raw, defaults);
  } catch {
    return shared.sanitizeSettings({}, defaults);
  }
}

function saveSettings(patch = {}) {
  settings = shared.sanitizeSettings(
    { ...settings, ...patch },
    { ...defaultSettings(), dataDir: settings?.dataDir }
  );
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  return settings;
}

function runtimeRoot() {
  return app.getAppPath();
}

function staticDir() {
  return path.join(runtimeRoot(), 'dist');
}

function lanUrls() {
  if (!localRuntime || settings.localHost === '127.0.0.1') return [];
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      if (!entry.address || entry.address === '0.0.0.0') continue;
      urls.push(`http://${entry.address}:${localRuntime.port}`);
    }
  }
  return [...new Set(urls)];
}

function state() {
  return {
    ready: true,
    mode: settings?.mode || 'local',
    platform: process.platform,
    arch: process.arch,
    versions: {
      app: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    local: {
      port: localRuntime?.port || settings?.localPort,
      configuredPort: settings?.localPort,
      host: settings?.localHost === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0',
      lanOnly: settings?.localHost === '127.0.0.1',
      running: Boolean(localRuntime),
      url: localRuntime?.localUrl || null,
      lanUrls: lanUrls(),
      dataDir: settings?.dataDir || '',
      autoPort: Boolean(localRuntime && localRuntime.port !== settings?.localPort)
    },
    remote: {
      url: settings?.remoteUrl || shared.DEFAULT_REMOTE_URL,
      profiles: settings?.profiles || [],
      allowSelfSigned: Boolean(settings?.allowSelfSigned)
    },
    autoConnect: Boolean(settings?.autoConnect),
    busy,
    error: lastError,
    logs: logs.slice(-12)
  };
}

function sendState() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.webContents.send('desktop:status', state());
  }
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed() && localRuntime) {
    mainWindow.setTitle(`ICEHOME · 本地 ${localRuntime.port}`);
  }
}

function currentPanelUrl() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const url = mainWindow.webContents.getURL();
    if (url) return url;
  }
  if (localRuntime) return localRuntime.localUrl;
  return settings?.remoteUrl || '';
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(parsed.toString());
    }
  } catch {
    /* ignore invalid url */
  }
}

function showCurrent() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return;
  }
  openLauncher();
}

function buildMenu() {
  const local = Boolean(localRuntime);
  const template = [
    {
      label: 'ICEHOME',
      submenu: [
        { label: '切换连接模式…', click: () => openLauncher() },
        { type: 'separator' },
        { label: '关于 ICEHOME', click: showAbout },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '连接',
      submenu: [
        { label: `当前：${settings?.mode === 'remote' ? '远程模式' : '本地模式'}`, enabled: false },
        { type: 'separator' },
        { label: '切换连接模式…', click: () => openLauncher() },
        { label: '在浏览器打开', click: () => openExternal(currentPanelUrl()) },
        { label: '复制当前地址', click: () => copyText(currentPanelUrl()) },
        ...(local
          ? [
              { label: '复制局域网地址', click: () => copyText(lanUrls()[0] || '') },
              { label: '重启本地服务', click: () => restartLocal().catch((error) => logLine(error.message)) }
            ]
          : [])
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 ICEHOME', click: showAbout },
        { label: '打开数据目录', click: () => shell.openPath(settings?.dataDir || '') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '打开面板', click: showCurrent },
    { label: '切换连接模式…', click: () => openLauncher() },
    { type: 'separator' },
    { label: '复制当前地址', click: () => copyText(currentPanelUrl()) },
    {
      label: localRuntime ? '复制局域网地址' : '本地服务未运行',
      enabled: Boolean(localRuntime && lanUrls().length),
      click: () => copyText(lanUrls()[0] || '')
    },
    {
      label: '重启本地服务',
      enabled: Boolean(localRuntime),
      click: () => restartLocal().catch((error) => logLine(error.message))
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  tray.setToolTip(localRuntime ? `ICEHOME · 本地 ${localRuntime.port}` : 'ICEHOME Desktop');
}

function copyText(text) {
  if (!text) return;
  clipboard.writeText(text);
  logLine(`已复制：${text}`);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('ICEHOME Desktop');
  tray.on('double-click', showCurrent);
  updateTrayMenu();
}

function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: 'ICEHOME Desktop',
    message: 'ICEHOME 家庭控制面板 · 桌面端',
    detail: [
      `版本 ${app.getVersion()}`,
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      `平台 ${process.platform} / ${process.arch}`,
      '',
      '本地模式在应用内运行服务；远程模式连接现有面板。'
    ].join('\n'),
    buttons: ['确定']
  });
}

function openLauncher() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    sendState();
    return launcherWindow;
  }
  launcherWindow = new BrowserWindow({
    width: 1000,
    height: 900,
    minWidth: 900,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0b0d',
    title: 'ICEHOME Desktop',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  launcherWindow.setMenuBarVisibility(false);
  launcherWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  launcherWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWindow.once('ready-to-show', () => {
    launcherWindow.show();
    launcherWindow.focus();
    sendState();
  });
  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
  return launcherWindow;
}

function configureCertificatePolicy() {
  if (settings.mode !== 'remote') return;
  const partition = 'persist:icehome-remote';
  const remoteHost = (() => {
    try {
      return new URL(settings.remoteUrl).hostname;
    } catch {
      return '';
    }
  })();
  session.fromPartition(partition).setCertificateVerifyProc((request, callback) => {
    if (settings.allowSelfSigned && request.hostname === remoteHost) {
      callback(0);
      return;
    }
    callback(-3);
  });
}

function openMain(url, mode) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  configureCertificatePolicy();
  const partition = mode === 'remote' ? 'persist:icehome-remote' : 'persist:icehome-local';
  const bounds = shared.normalizeBounds(settings.windowBounds);
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0d0d0f',
    title: mode === 'local' ? `ICEHOME · 本地 ${localRuntime?.port || ''}` : 'ICEHOME · 远程',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  const allowedOrigin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  })();

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin !== allowedOrigin) {
        event.preventDefault();
        openExternal(target);
      }
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    if (code === -3) return;
    lastError = `页面加载失败：${description}`;
    logLine(lastError);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    mainWindow = null;
    openLauncher();
  });
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.close();
  });
  mainWindow.on('close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const size = mainWindow.getBounds();
    saveSettings({ windowBounds: size });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    sendState();
  });
  mainWindow.loadURL(url).catch((error) => {
    lastError = `无法加载 ${url}：${error.message}`;
    logLine(lastError);
  });
  buildMenu();
  sendState();
}

async function loadRuntime() {
  if (!runtimeModulePromise) {
    const entry = path.join(runtimeRoot(), 'server', 'src', 'runtime.js');
    runtimeModulePromise = import(pathToFileURL(entry).href);
  }
  return runtimeModulePromise;
}

async function startLocal() {
  if (localRuntime) {
    return { ok: true, port: localRuntime.port, url: localRuntime.localUrl };
  }
  const basePort = shared.normalizePort(settings.localPort);
  const host = shared.normalizeLocalHost(settings.localHost);
  const dataDir = path.resolve(settings.dataDir || path.join(app.getPath('userData'), 'data'));
  const { startIcehomeServer } = await loadRuntime();
  let lastStartError = null;
  for (let offset = 0; offset < 10; offset += 1) {
    const port = basePort + offset;
    if (port > 65535) break;
    try {
      localRuntime = await startIcehomeServer({
        host,
        port,
        dataDir,
        staticDir: staticDir(),
        serveStatic: true,
        schedulerIntervalMs: 15000,
        logger
      });
      saveSettings({ localPort: localRuntime.port, dataDir });
      logLine(`本地服务已启动：${localRuntime.localUrl}（${localRuntime.persistence.driver}）`);
      lastError = '';
      sendState();
      return { ok: true, port: localRuntime.port, url: localRuntime.localUrl };
    } catch (error) {
      lastStartError = error;
      if (error.code === 'EADDRINUSE') {
        logLine(`端口 ${port} 被占用，尝试下一个端口`);
        continue;
      }
      break;
    }
  }
  const message =
    lastStartError?.code === 'EADDRINUSE'
      ? `端口 ${basePort}–${basePort + 9} 都被占用，请在启动器换一个端口`
      : `本地服务启动失败：${lastStartError?.message || '未知错误'}`;
  throw new Error(message);
}

async function stopLocal() {
  if (!localRuntime) return;
  const runtime = localRuntime;
  localRuntime = null;
  try {
    await runtime.close();
    logLine('本地服务已停止');
  } finally {
    sendState();
  }
}

async function restartLocal() {
  if (!settings || settings.mode !== 'local') return { ok: false, error: '当前不是本地模式' };
  await stopLocal();
  const result = await startLocal();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(result.url);
  }
  return result;
}

function probeRemoteOnce(url, allowSelfSigned) {
  return new Promise((resolve) => {
    const started = Date.now();
    let target;
    try {
      target = new URL(`${shared.normalizeBaseUrl(url)}/api/health`);
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }
    const lib = target.protocol === 'https:' ? https : http;
    const request = lib.get(
      target,
      {
        timeout: 4000,
        rejectUnauthorized: !allowSelfSigned,
        headers: { accept: 'application/json', 'user-agent': 'ICEHOME-Desktop' }
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            resolve({ ok: false, error: `服务器返回 HTTP ${response.statusCode}` });
            return;
          }
          let data = null;
          try {
            data = JSON.parse(body);
          } catch {
            resolve({ ok: false, error: '服务器没有返回 ICEHOME 健康信息' });
            return;
          }
          resolve({
            ok: true,
            latencyMs: Date.now() - started,
            version: data.version || '',
            service: data.service || data.name || 'ICEHOME',
            url: shared.normalizeBaseUrl(url)
          });
        });
      }
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, error: '连接超时，请检查地址和防火墙' });
    });
    request.on('error', (error) => {
      const hint =
        error.code === 'ECONNREFUSED'
          ? '连接被拒绝，请确认面板服务已启动'
          : error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error.code === 'SELF_SIGNED_CERT_IN_CHAIN'
            ? '证书不受信任，可勾选“允许自签名证书”后重试'
            : error.message;
      resolve({ ok: false, error: hint });
    });
  });
}

async function connect(payload = {}) {
  if (busy) return { ok: false, error: '正在连接，请稍候' };
  busy = true;
  lastError = '';
  sendState();
  try {
    const mode = shared.normalizeMode(payload.mode);
    const localPort = shared.normalizePort(payload.localPort ?? settings.localPort);
    const localHost = shared.normalizeLocalHost(payload.localHost ?? settings.localHost);
    const dataDir = String(payload.dataDir || settings.dataDir || '').trim();
    if (!dataDir) throw new Error('请选择数据目录');
    const remoteUrl = shared.normalizeBaseUrl(payload.remoteUrl ?? settings.remoteUrl);
    const allowSelfSigned = Boolean(payload.allowSelfSigned);
    const autoConnect = Boolean(payload.autoConnect);
    const profiles = payload.profiles
      ? shared.normalizeProfiles(payload.profiles)
      : shared.normalizeProfiles(settings.profiles);

    saveSettings({
      mode,
      localPort,
      localHost,
      dataDir: path.resolve(dataDir),
      remoteUrl,
      allowSelfSigned,
      autoConnect,
      profiles: mode === 'remote' ? shared.mergeProfile(profiles, remoteUrl) : profiles
    });

    if (mode === 'local') {
      const started = await startLocal();
      openMain(started.url, 'local');
      return { ok: true, mode, url: started.url, port: started.port };
    }

    const probe = await probeRemoteOnce(remoteUrl, allowSelfSigned);
    if (!probe.ok) {
      lastError = probe.error;
      logLine(`远程连接失败：${probe.error}`);
      sendState();
      return probe;
    }
    await stopLocal();
    openMain(remoteUrl, 'remote');
    logLine(`远程模式已连接：${remoteUrl}（${probe.latencyMs}ms）`);
    return { ok: true, mode, url: remoteUrl, probe };
  } catch (error) {
    lastError = error.message;
    logLine(`连接失败：${error.message}`);
    return { ok: false, error: error.message };
  } finally {
    busy = false;
    sendState();
  }
}

function registerIpc() {
  ipcMain.handle('desktop:get-state', () => state());
  ipcMain.handle('desktop:choose-data-dir', async () => {
    const result = await dialog.showOpenDialog(launcherWindow || mainWindow || undefined, {
      title: '选择 ICEHOME 数据目录',
      defaultPath: settings.dataDir,
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('desktop:test-remote', async (_event, payload = {}) => {
    try {
      const url = shared.normalizeBaseUrl(payload.url);
      return await probeRemoteOnce(url, Boolean(payload.allowSelfSigned));
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('desktop:connect', (_event, payload = {}) => connect(payload));
  ipcMain.handle('desktop:open-launcher', () => {
    openLauncher();
    return state();
  });
  ipcMain.handle('desktop:restart-local', async () => {
    try {
      const result = await restartLocal();
      return { ...result, state: state() };
    } catch (error) {
      lastError = error.message;
      sendState();
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('desktop:copy-text', (_event, text) => {
    const value = String(text || '').slice(0, 2000);
    if (value) clipboard.writeText(value);
    return { ok: Boolean(value) };
  });
  ipcMain.handle('desktop:quit', () => app.quit());
}

async function bootstrap() {
  if (settings.autoConnect) {
    const result = await connect({
      mode: settings.mode,
      localPort: settings.localPort,
      localHost: settings.localHost,
      dataDir: settings.dataDir,
      remoteUrl: settings.remoteUrl,
      allowSelfSigned: settings.allowSelfSigned,
      autoConnect: true,
      profiles: settings.profiles
    });
    if (!result.ok) openLauncher();
    return;
  }
  openLauncher();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {  app.on('second-instance', () => showCurrent());
  app.setAppUserModelId(APP_ID);

  app.whenReady().then(async () => {
    settings = loadSettings();
    buildMenu();
    createTray();
    registerIpc();
    logLine(`启动 v${app.getVersion()} · ${process.platform}/${process.arch}`);
    await bootstrap();
  });

  app.on('activate', () => {
    if (!launcherWindow && !mainWindow) openLauncher();
    else showCurrent();
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    if (!tray) app.quit();
  });

  app.on('before-quit', (event) => {
    if (allowQuit || !localRuntime) return;
    event.preventDefault();
    quitting = true;
    stopLocal()
      .catch((error) => logLine(`退出时停止服务失败：${error.message}`))
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  });

  app.on('will-quit', () => {
    if (tray) {
      tray.destroy();
      tray = null;
    }
    if (quitting) logLine('桌面端退出');
  });
}
