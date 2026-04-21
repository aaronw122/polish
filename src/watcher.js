import chokidar from 'chokidar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEBOUNCE_MS = 50;

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.next',
]);

/**
 * Create a file watcher that monitors a project directory for changes
 * and triggers smart reloads via the WebSocket broadcast function.
 *
 * @param {string} projectDir - The directory to watch for file changes
 * @param {object} options
 * @param {Function} options.broadcast - WebSocket broadcast function to send reload messages
 * @param {number} [options.debounceMs] - Debounce delay in milliseconds (default 50)
 * @param {object} [options.chokidarOptions] - Extra options passed to chokidar.watch()
 * @returns {{ close(): Promise<void>, onFileChange(cb: Function): void }}
 */
export function createWatcher(projectDir, { broadcast, debounceMs = DEBOUNCE_MS, chokidarOptions = {} } = {}) {
  const resolvedDir = path.resolve(projectDir);
  const polishDir = path.resolve(__dirname, '..');
  const changeCallbacks = [];

  // Pending changes accumulated during the debounce window
  let pendingCSS = new Set();
  let pendingFull = false;
  let debounceTimer = null;

  const watcher = chokidar.watch(resolvedDir, {
    ignored: (filePath) => {
      const resolved = path.resolve(filePath);
      // Never ignore the root watched directory itself
      if (resolved === resolvedDir) return false;
      // Ignore Polish's own install directory
      if (resolved.startsWith(polishDir + path.sep) && polishDir !== resolvedDir) return true;
      // Ignore common non-source directories by checking path segments
      const relative = path.relative(resolvedDir, resolved);
      const segments = relative.split(path.sep);
      return segments.some((seg) => IGNORED_SEGMENTS.has(seg));
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: false,
    ...chokidarOptions,
  });

  watcher.on('change', (filePath) => onFileEvent(filePath));
  watcher.on('add', (filePath) => onFileEvent(filePath));

  function onFileEvent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.css' && ext !== '.html' && ext !== '.htm' && ext !== '.js') {
      return;
    }

    // Notify registered callbacks
    for (const cb of changeCallbacks) {
      try {
        cb(filePath);
      } catch (err) {
        console.error('Polish: file change callback error:', err.message);
      }
    }

    // Accumulate changes for debounced reload
    if (ext === '.css') {
      pendingCSS.add(path.basename(filePath));
    } else {
      pendingFull = true;
    }

    scheduleFlush();
  }

  function scheduleFlush() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(flush, debounceMs);
  }

  function flush() {
    debounceTimer = null;

    if (!broadcast) return;

    if (pendingFull) {
      // Any HTML or JS change means full reload, even if CSS also changed
      broadcast({ type: 'reload', cssOnly: false });
    } else if (pendingCSS.size > 0) {
      broadcast({
        type: 'reload',
        cssOnly: true,
        files: Array.from(pendingCSS),
      });
    }

    pendingCSS = new Set();
    pendingFull = false;
  }

  /**
   * Register a callback that fires on every watched file change.
   * Useful for the source resolver to re-scan its maps.
   *
   * @param {Function} cb - Called with the changed file path
   */
  function onFileChange(cb) {
    if (typeof cb === 'function') {
      changeCallbacks.push(cb);
    }
  }

  /**
   * Stop watching and clean up resources.
   */
  async function close() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await watcher.close();
  }

  return { close, onFileChange, _watcher: watcher };
}
