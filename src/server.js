import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createWriter } from './writer.js';

// ── Per-message-type handlers ─────────────────────────────────────

function handleSelectMessage(ws, message, resolver) {
  const desc = `<${message.tag}${message.id ? '#' + message.id : ''}${
    message.classes?.length ? '.' + message.classes.join('.') : ''
  }>`;
  console.log(`Polish: selected ${desc}`);
  console.log(`Polish: ancestors = ${JSON.stringify((message.ancestors || []).map(a => a.classes?.length ? '.' + a.classes.join('.') : a.tag))}`);

  if (!resolver) return;

  const result = resolver.resolve({
    tag: message.tag,
    id: message.id,
    classes: message.classes,
    inlineStyles: message.inlineStyles || '',
    ancestors: message.ancestors || [],
    viewport: message.viewport || null,
  });

  ws.send(
    JSON.stringify({
      type: 'source',
      file: result.file,
      line: result.line,
      selector: result.selector,
      styleType: result.styleType || null,
      cssRule: result.cssRule || null,
      properties: result.properties,
      matchedRules: result.matchedRules,
      cssFiles: result.cssFiles || [],
      ambiguous: result.ambiguous || false,
      ambiguousProperties: result.ambiguousProperties || [],
      pseudoStates: result.pseudoStates || {},
    })
  );
}

function validateAndNormalizeChangeMessage(message, projectDir) {
  if (!message.file || typeof message.file !== 'string') {
    return 'missing or invalid "file" field';
  }
  // Normalize absolute paths to relative (resolver sends absolute paths)
  if (path.isAbsolute(message.file) && projectDir) {
    const resolved = path.resolve(message.file);
    if (resolved.startsWith(projectDir + path.sep) || resolved === projectDir) {
      message.file = path.relative(projectDir, resolved);
    } else {
      return 'file path is outside the project directory';
    }
  }
  if (message.file.includes('..')) {
    return '"file" field must not contain ".."';
  }
  if (!message.property || typeof message.property !== 'string') {
    return 'missing or invalid "property" field';
  }
  if (message.value == null || typeof message.value !== 'string') {
    return 'missing or invalid "value" field';
  }
  return null;
}

function handleChangeMessage(message, writer, projectDir) {
  const error = validateAndNormalizeChangeMessage(message, projectDir);
  if (error) {
    console.error(`Polish: rejected change message — ${error}`);
    return;
  }

  console.log(
    `Polish: change ${message.selector} { ${message.property}: ${message.value} } in ${message.file}`
  );
  writer.applyChange(message);
}

function handleFlushMessage(writer) {
  writer.flushAll();
}

// ── WebSocket server factory ──────────────────────────────────────

export { validateAndNormalizeChangeMessage as _validateChangeMessage };

export function createWebSocketServer(httpServer, config) {
  const writer = createWriter(config.dir);

  let resolver = null;

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/__polish__/ws',
    verifyClient: ({ origin }) => {
      if (!origin) return true; // non-browser clients (CLI tools)
      try {
        const url = new URL(origin);
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      } catch { return false; }
    },
  });

  wss.on('connection', (ws) => {
    console.log('Polish: overlay connected');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (err) {
        console.error('Polish: invalid message received:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('Polish: overlay disconnected');
    });

    ws.on('error', (err) => {
      console.error('Polish: WebSocket error:', err.message);
    });
  });

  function handleMessage(ws, message) {
    switch (message.type) {
      case 'select':
        handleSelectMessage(ws, message, resolver);
        break;
      case 'deselect':
        console.log('Polish: deselected');
        break;
      case 'change':
        handleChangeMessage(message, writer, config.dir);
        break;
      case 'flush':
        handleFlushMessage(writer);
        break;
      default:
        console.log('Polish: unknown message type:', message.type);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  function broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  /**
   * Set the resolver instance for source resolution.
   * Called by CLI on startup after the resolver is initialized.
   */
  function setResolver(resolverInstance) {
    resolver = resolverInstance;
  }

  function flushAll() {
    writer.flushAll();
  }

  // Attach to wss for backward-compatible access via cli.js
  wss.broadcast = broadcast;
  wss.setResolver = setResolver;
  wss.flushAll = flushAll;

  return wss;
}
