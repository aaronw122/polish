import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLISH_PREFIX = '/__polish__/';

// Svelte bundle — all JS + CSS compiled into a single IIFE
const OVERLAY_JS_PATH = path.join(__dirname, '..', 'dist', 'overlay.js');
const OVERLAY_CSS_PATH = path.join(__dirname, 'overlay', 'overlay.css');

const INJECT_SCRIPT = `<script src="${POLISH_PREFIX}overlay.js"></script>
<link rel="stylesheet" href="${POLISH_PREFIX}overlay.css">
</body>`;

// ── Small helpers ─────────────────────────────────────────────────

function servePolishAsset(req, res) {
  const urlPath = req.url.split('?')[0];

  if (urlPath === `${POLISH_PREFIX}overlay.js`) {
    // Serve the pre-built Svelte bundle — no runtime inlining needed
    const content = fs.readFileSync(OVERLAY_JS_PATH, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(content);
    return true;
  }

  if (urlPath === `${POLISH_PREFIX}overlay.css`) {
    const content = fs.readFileSync(OVERLAY_CSS_PATH, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(content);
    return true;
  }

  return false;
}

function isHtmlResponse(proxyRes) {
  const contentType = proxyRes.headers['content-type'] || '';
  return contentType.includes('text/html');
}

function getDecompressor(encoding) {
  switch (encoding) {
    case 'gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

function injectOverlay(html) {
  const bodyCloseIndex = html.lastIndexOf('</body>');
  if (bodyCloseIndex === -1) {
    return html + INJECT_SCRIPT;
  }
  return html.slice(0, bodyCloseIndex) + INJECT_SCRIPT;
}

// ── Extracted concerns ────────────────────────────────────────────

/**
 * Intercept an HTML proxy response: decompress, inject overlay, send.
 */
function handleHtmlResponse(proxyRes, res) {
  const encoding = proxyRes.headers['content-encoding'];
  const decompressor = getDecompressor(encoding);
  const chunks = [];

  const source = decompressor ? proxyRes.pipe(decompressor) : proxyRes;

  source.on('data', (chunk) => {
    chunks.push(chunk);
  });

  source.on('end', () => {
    let html = Buffer.concat(chunks).toString('utf-8');
    html = injectOverlay(html);

    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    delete responseHeaders['transfer-encoding'];
    responseHeaders['content-length'] = Buffer.byteLength(html);

    res.writeHead(proxyRes.statusCode, responseHeaders);
    res.end(html);
  });

  source.on('error', (err) => {
    console.error('Decompression error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Polish proxy error: failed to decompress response');
  });
}

/**
 * Render the "upstream unavailable" error page.
 */
function handleProxyError(res, targetUrl, err) {
  if (!res || res.headersSent) return;

  res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<html><body style="font-family:system-ui;padding:2rem">` +
      `<h1>Polish — Upstream Unavailable</h1>` +
      `<p>Could not reach <code>${targetUrl}</code></p>` +
      `<p style="color:#888">${err.message}</p>` +
      `</body></html>`
  );
}

/**
 * Build the HTTP request handler that serves Polish assets or proxies.
 */
function createRequestHandler(proxy) {
  return (req, res) => {
    if (req.url.startsWith(POLISH_PREFIX)) {
      if (servePolishAsset(req, res)) return;
    }
    proxy.web(req, res);
  };
}

// ── Factory ───────────────────────────────────────────────────────

export function createProxyServer(config) {
  const proxy = httpProxy.createProxyServer({
    target: config.targetUrl,
    selfHandleResponse: true,
    ws: true,
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    if (!isHtmlResponse(proxyRes)) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }
    handleHtmlResponse(proxyRes, res);
  });

  proxy.on('error', (err, req, res) => {
    handleProxyError(res, config.targetUrl, err);
  });

  const server = http.createServer(createRequestHandler(proxy));

  server.on('upgrade', (req, socket, head) => {
    if (req.url === `${POLISH_PREFIX}ws`) {
      return; // Handled by the WebSocket server
    }
    proxy.ws(req, socket, head);
  });

  server._polishProxy = proxy;

  return server;
}
