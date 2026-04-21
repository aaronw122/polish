import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createWatcher } from '../src/watcher.js';

// Use polling in tests to avoid macOS FSEvents EMFILE issues in CI/sandbox
const TEST_CHOKIDAR_OPTS = { usePolling: true, interval: 50 };

/**
 * Helper: create a temp directory with optional seed files.
 * Returns the absolute path to the temp dir.
 */
function makeTmpDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-watcher-test-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

/**
 * Helper: wait until the chokidar watcher has finished its initial scan.
 */
function waitForReady(watcher) {
  return new Promise((resolve) => {
    if (watcher._watcher.closed) return resolve();
    watcher._watcher.on('ready', resolve);
  });
}

/**
 * Helper: collect broadcast calls. Returns { calls, broadcast, waitFor(n, timeoutMs) }.
 */
function createBroadcastSpy() {
  const calls = [];
  function broadcast(msg) {
    calls.push(msg);
  }
  function waitFor(n, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (calls.length >= n) return resolve(calls);
        if (Date.now() - start > timeoutMs) {
          return reject(
            new Error(`Timed out waiting for ${n} broadcast(s), got ${calls.length}`)
          );
        }
        setTimeout(check, 30);
      };
      check();
    });
  }
  return { calls, broadcast, waitFor };
}

/**
 * Helper: wait for a period of silence (no new broadcasts for durationMs).
 */
function waitForSilence(spy, durationMs = 300) {
  return new Promise((resolve) => {
    let last = spy.calls.length;
    const check = () => {
      if (spy.calls.length === last) return resolve(spy.calls);
      last = spy.calls.length;
      setTimeout(check, durationMs);
    };
    setTimeout(check, durationMs);
  });
}

describe('watcher', () => {
  let tmpDir;
  let watcher;

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('sends cssOnly: true reload on CSS file change', async () => {
    tmpDir = makeTmpDir({ 'styles.css': 'body { color: red; }' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'styles.css'), 'body { color: blue; }');

    const calls = await spy.waitFor(1);
    assert.equal(calls[0].type, 'reload');
    assert.equal(calls[0].cssOnly, true);
    assert.ok(Array.isArray(calls[0].files));
    assert.ok(calls[0].files.includes('styles.css'));
  });

  it('sends cssOnly: false reload on HTML file change', async () => {
    tmpDir = makeTmpDir({ 'index.html': '<html></html>' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body></body></html>');

    const calls = await spy.waitFor(1);
    assert.equal(calls[0].type, 'reload');
    assert.equal(calls[0].cssOnly, false);
  });

  it('sends cssOnly: false reload on JS file change', async () => {
    tmpDir = makeTmpDir({ 'app.js': 'console.log("hi")' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("updated")');

    const calls = await spy.waitFor(1);
    assert.equal(calls[0].type, 'reload');
    assert.equal(calls[0].cssOnly, false);
  });

  it('debounces rapid changes into one reload', async () => {
    tmpDir = makeTmpDir({ 'a.css': 'a{}' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 150,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    // Fire multiple rapid changes
    fs.writeFileSync(path.join(tmpDir, 'a.css'), 'a{color:red}');
    fs.writeFileSync(path.join(tmpDir, 'a.css'), 'a{color:blue}');
    fs.writeFileSync(path.join(tmpDir, 'a.css'), 'a{color:green}');

    // Wait for the debounce to settle, then check we got exactly one broadcast
    const calls = await spy.waitFor(1);
    await waitForSilence(spy, 400);
    assert.equal(spy.calls.length, 1, 'Expected exactly one debounced broadcast');
    assert.equal(calls[0].type, 'reload');
    assert.equal(calls[0].cssOnly, true);
  });

  it('groups multiple CSS files changed within debounce window', async () => {
    tmpDir = makeTmpDir({
      'a.css': 'a{}',
      'b.css': 'b{}',
      'c.css': 'c{}',
    });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 150,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'a.css'), 'a{color:red}');
    fs.writeFileSync(path.join(tmpDir, 'b.css'), 'b{color:red}');
    fs.writeFileSync(path.join(tmpDir, 'c.css'), 'c{color:red}');

    const calls = await spy.waitFor(1);
    await waitForSilence(spy, 400);
    assert.equal(spy.calls.length, 1, 'Expected one grouped broadcast');
    assert.equal(calls[0].cssOnly, true);
    assert.ok(calls[0].files.includes('a.css'), 'Should include a.css');
    assert.ok(calls[0].files.includes('b.css'), 'Should include b.css');
    assert.ok(calls[0].files.includes('c.css'), 'Should include c.css');
  });

  it('ignores changes in node_modules', async () => {
    tmpDir = makeTmpDir({
      'node_modules/pkg/style.css': 'a{}',
      'app.css': 'a{}',
    });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    // Change inside node_modules — should be ignored
    fs.writeFileSync(path.join(tmpDir, 'node_modules/pkg/style.css'), 'a{color:red}');

    // Wait to ensure it would have fired if not ignored
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(spy.calls.length, 0, 'Should not broadcast for node_modules changes');

    // Now change a real file to confirm the watcher is operational
    fs.writeFileSync(path.join(tmpDir, 'app.css'), 'a{color:blue}');
    const calls = await spy.waitFor(1);
    assert.equal(calls[0].type, 'reload');
  });

  it('calls registered onFileChange callbacks', async () => {
    tmpDir = makeTmpDir({ 'style.css': 'a{}' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });

    const changedFiles = [];
    watcher.onFileChange((filePath) => {
      changedFiles.push(filePath);
    });

    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'a{color:red}');

    // Wait for the callback to fire
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (changedFiles.length > 0) return resolve();
        if (Date.now() - start > 5000) return reject(new Error('Timed out waiting for callback'));
        setTimeout(check, 30);
      };
      check();
    });

    assert.ok(changedFiles.length > 0, 'Callback should have been called');
    assert.ok(
      changedFiles[0].endsWith('style.css'),
      `Expected path ending with style.css, got ${changedFiles[0]}`
    );
  });

  it('ignores non-watched file extensions', async () => {
    tmpDir = makeTmpDir({ 'data.json': '{}', 'app.css': 'a{}' });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 30,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    // Change a JSON file — should be ignored
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"updated":true}');

    await new Promise((r) => setTimeout(r, 400));
    assert.equal(spy.calls.length, 0, 'Should not broadcast for non-watched extensions');
  });

  it('full reload wins when CSS and HTML change within same debounce window', async () => {
    tmpDir = makeTmpDir({
      'style.css': 'a{}',
      'index.html': '<html></html>',
    });
    const spy = createBroadcastSpy();
    watcher = createWatcher(tmpDir, {
      broadcast: spy.broadcast,
      debounceMs: 150,
      chokidarOptions: TEST_CHOKIDAR_OPTS,
    });
    await waitForReady(watcher);

    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'a{color:red}');
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>hi</body></html>');

    const calls = await spy.waitFor(1);
    await waitForSilence(spy, 400);
    assert.equal(spy.calls.length, 1, 'Expected one broadcast');
    assert.equal(calls[0].cssOnly, false, 'Should be full reload when HTML changed');
  });
});
