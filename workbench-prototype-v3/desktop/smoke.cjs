const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const electron = await _electron.launch({ args: [__dirname], env: { ...process.env, WORKBENCH_DESKTOP_TEST: '1' }, timeout: 90000 });
  try {
    const chrome = await electron.firstWindow({ timeout: 90000 });
    await chrome.waitForLoadState();
    const state = await electron.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const content = window.contentView.children[0].webContents;
      if (content.isLoading()) await new Promise(resolve => content.once('did-stop-loading', resolve));
      window.show();
      return { url: content.getURL(), prefs: content.getLastWebPreferences(), bounds: window.getBounds() };
    });
    assert.equal(new URL(state.url).port, '5185');
    assert.equal(state.prefs.nodeIntegration, false);
    assert.equal(state.prefs.contextIsolation, true);
    assert.equal(state.prefs.sandbox, true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const screenshot = path.join(os.tmpdir(), 'workbench-desktop-smoke.png');
    const screenshotData = await electron.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.capturePage();
      return image.toPNG().toString('base64');
    });
    require('node:fs').writeFileSync(screenshot, Buffer.from(screenshotData, 'base64'));
    const hidden = await electron.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.close();
      return !window.isDestroyed() && !window.isVisible();
    });
    assert.equal(hidden, true);
    assert.equal((await fetch('http://127.0.0.1:5185/')).ok, true);
    await new Promise((resolve, reject) => {
      const second = require('node:child_process').spawn(require('electron'), [__dirname], { windowsHide: true });
      second.once('error', reject);
      second.once('exit', code => code === 0 ? resolve() : reject(new Error(`Second launch: ${code}`)));
    });
    assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await electron.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.show(); window.maximize(); window.unmaximize();
      window.setSize(900, 640);
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    const compactData = await electron.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children[0];
      return (await view.webContents.capturePage()).toPNG().toString('base64');
    });
    require('node:fs').writeFileSync(path.join(os.tmpdir(), 'workbench-desktop-compact.png'), Buffer.from(compactData, 'base64'));
    console.log(JSON.stringify({ result: 'passed', screenshot, checks: ['local service', 'sandbox', 'close hides', 'service survives close', 'resize'] }));
  } finally { await electron.close(); }
  assert.equal((await fetch('http://127.0.0.1:5185/')).ok, true);
  console.log('Service survives desktop exit.');
})().catch(error => { console.error(error); process.exitCode = 1; });
