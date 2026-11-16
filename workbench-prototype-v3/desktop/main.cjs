const { app, BrowserWindow, WebContentsView, Tray, Menu, shell, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createNotifier, observations } = require('./notifications.cjs');
const { execFile } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:5185';
let window, tray;
let quitting = false;
let monitor, polling = false, timer;
const appId = 'Yili.Workbench.Desktop';
app.setAppUserModelId(appId);
const loginOptions = { path: process.execPath, args: [__dirname, '--background'], name: appId };
const stateDir = path.join(process.env.LOCALAPPDATA, 'YiliWorkbench', 'spatial-demo', 'desktop');
function log(message) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(path.join(stateDir, 'notifications.log'), `${new Date().toISOString()} ${message}\n`);
}
function notify(rows, test = false) {
  if (!Notification.isSupported()) { log('Notifications unsupported'); return; }
  const notification = new Notification({
    title: test ? '屹立工作台 · 通知测试' : `屹立工作台 · ${rows.length} 项需处理`,
    body: test ? '后台系统通知已接通。点击可打开工作台。' : rows.slice(0, 3).map(row => row.title).join('\n') + (rows.length > 3 ? '\n更多问题请打开工作台查看。' : ''),
    icon: path.join(root, 'assets/workbench.ico')
  });
  notification.on('click', () => {
    const href = rows.length === 1 && /^#\/p\/[\w-]+\/w\/[\w-]+$/.test(rows[0].href || '') ? rows[0].href : '#/grid';
    window?.contentView.children[0].webContents.loadURL(origin + '/' + href);
    show();
  });
  notification.on('show', () => log(test ? 'Test notification shown' : `Notification shown: ${rows.length} issues`));
  notification.on('failed', (_event, error) => log(`Notification failed: ${error}`));
  notification.show();
}
async function poll() {
  if (polling || !monitor) return;
  polling = true;
  try {
    async function read(route, key) {
      try {
        const response = await fetch(origin + route, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const value = await response.json();
        if (!Array.isArray(value[key])) throw Error('Invalid response');
        return value;
      } catch (error) { log(`${route}: ${error.message}`); return null; }
    }
    const operations = await read('/api/operations-reminders', 'issues');
    const cards = await read('/api/card-observations', 'cards');
    await monitor.accept(observations(operations, cards));
  } catch (error) { log(`Notification check failed: ${error.message}`); }
  finally { polling = false; }
}

function integration() {
  const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  fs.mkdirSync(programs, { recursive: true });
  if (!shell.writeShortcutLink(path.join(programs, '屹立工作台.lnk'), 'create', {
    target: process.execPath, args: `"${__dirname}"`, cwd: root,
    icon: path.join(root, 'assets/workbench.ico'), iconIndex: 0, appUserModelId: appId,
    description: '屹立工作台'
  })) throw Error('Cannot register workbench Start Menu shortcut');
  if (process.argv.includes('--enable-autostart')) app.setLoginItemSettings({ ...loginOptions, openAtLogin: true });
}

function external(url) {
  try {
    if (['https:', 'http:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch {}
}

function show() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function start() {
  if (!process.env.WORKBENCH_DESKTOP_TEST) integration();
  await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'start-workbench.ps1'), '-ServiceOnly'],
    { windowsHide: true, timeout: 90000 }, error => error ? reject(error) : resolve());
  });
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 800, minHeight: 560,
    show: false, backgroundColor: '#0a0a0a', title: '屹立工作台',
    icon: path.join(root, 'assets/workbench.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121316', symbolColor: '#a9aeb5', height: 36 },
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.setMenu(null);
  const view = new WebContentsView({ webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false
  }});
  window.contentView.addChildView(view);
  const resize = () => {
    const [width, height] = window.getContentSize();
    view.setBounds({ x: 0, y: 36, width, height: Math.max(0, height - 36) });
  };
  window.on('resize', resize);
  resize();
  view.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  view.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) { event.preventDefault(); external(url); }
  });
  view.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write');
  });
  window.on('close', event => {
    if (!quitting) { event.preventDefault(); window.hide(); }
  });
  tray = new Tray(path.join(root, 'assets/workbench.ico'));
  tray.setToolTip('屹立工作台 · 关闭窗口后后台服务继续运行');
  function trayMenu() { tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工作台', click: show },
    { label: '重新加载界面', click: () => { view.webContents.reload(); show(); } },
    { label: '在浏览器打开', click: () => shell.openExternal(origin) },
    { label: '登录 Windows 后启动', type: 'checkbox', checked: app.getLoginItemSettings(loginOptions).openAtLogin,
      click: item => { app.setLoginItemSettings({ ...loginOptions, openAtLogin: item.checked }); trayMenu(); } },
    { label: '系统通知', type: 'checkbox', checked: monitor?.enabled() || false, enabled: !!monitor,
      click: item => { monitor.setEnabled(item.checked); trayMenu(); if (item.checked) void poll(); } },
    { label: '测试系统通知', click: () => notify([], true) },
    { type: 'separator' },
    { label: '退出提醒程序（后台服务保留）', click: () => { quitting = true; app.quit(); } }
  ])); }
  if (!process.env.WORKBENCH_DESKTOP_TEST) {
    try { monitor = createNotifier({ file: path.join(stateDir, 'notifications.json'), deliver: notify }); }
    catch (error) { log(`Notification state unreadable; notifications disabled: ${error.message}`); }
  }
  trayMenu();
  tray.on('double-click', show);
  await window.loadFile(path.join(__dirname, 'titlebar.html'));
  await view.webContents.loadURL(origin + '/#/grid');
  if (!process.argv.includes('--background')) show();
  if (monitor) { timer = setInterval(poll, 300000); void poll(); }
  if (process.argv.includes('--test-notification')) notify([], true);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    if (args.includes('--enable-autostart')) app.setLoginItemSettings({ ...loginOptions, openAtLogin: true });
    if (args.includes('--test-notification')) notify([], true);
    if (!args.includes('--background')) show();
  });
  app.on('before-quit', () => { quitting = true; clearInterval(timer); });
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('工作台启动失败', error.message);
    app.quit();
  });
}
