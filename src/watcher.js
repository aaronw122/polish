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

const WATCHED_EXTENSIONS = new Set(['.css', '.html', '.htm', '.js']);

// ── Path filtering ────────────────────────────────────────────────

function isWatchRoot(filePath, watchDir) {
  return path.resolve(filePath) === watchDir;
}

function isPolishInstallPath(filePath, watchDir, polishDir) {
  const resolved = path.resolve(filePath);
  if (polishDir === watchDir) return false;
  // File is under the watched directory — it's a project file, not Polish source
  if (resolved.startsWith(watchDir + path.sep)) return false;
  return resolved.startsWith(polishDir + path.sep);
}

function containsIgnoredSegment(filePath, watchDir) {
  const relative = path.relative(watchDir, path.resolve(filePath));
  const segments = relative.split(path.sep);
  return segments.some((seg) => IGNORED_SEGMENTS.has(seg));
}

function shouldIgnorePath(filePath, watchDir, polishDir) {
  if (isWatchRoot(filePath, watchDir)) return false;
  if (isPolishInstallPath(filePath, watchDir, polishDir)) return true;
  return containsIgnoredSegment(filePath, watchDir);
}

// ── File event handling ───────────────────────────────────────────

function isRelevantSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return WATCHED_EXTENSIONS.has(ext);
}

function notifyCallbacks(filePath, callbacks) {
  for (const cb of callbacks) {
    try {
      cb(filePath);
    } catch (err) {
      console.error('Polish: file change callback error:', err.message);
    }
  }
}

function queueReload(filePath, pendingState) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.css') {
    pendingState.cssFiles.add(path.basename(filePath));
  } else {
    pendingState.fullReload = true;
  }
}

// ── Factory ───────────────────────────────────────────────────────

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
  const pending = { cssFiles: new Set(), fullReload: false };
  let debounceTimer = null;

  const watcher = chokidar.watch(resolvedDir, {
    ignored: (filePath) => shouldIgnorePath(filePath, resolvedDir, polishDir),
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: false,
    ...chokidarOptions,
  });

  watcher.on('change', (filePath) => onFileEvent(filePath));
  watcher.on('add', (filePath) => onFileEvent(filePath));

  function onFileEvent(filePath) {
    if (!isRelevantSourceFile(filePath)) return;

    console.log(`Polish: file changed → ${path.relative(resolvedDir, filePath)}`);
    notifyCallbacks(filePath, changeCallbacks);
    queueReload(filePath, pending);
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

    if (pending.fullReload) {
      console.log('Polish: broadcasting full reload');
      broadcast({ type: 'reload', cssOnly: false });
    } else if (pending.cssFiles.size > 0) {
      console.log(`Polish: broadcasting CSS reload → ${Array.from(pending.cssFiles).join(', ')}`);
      broadcast({
        type: 'reload',
        cssOnly: true,
        files: Array.from(pending.cssFiles),
      });
    }

    pending.cssFiles = new Set();
    pending.fullReload = false;
  }

  // ── Public API ──────────────────────────────────────────────────

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
