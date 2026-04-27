import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLISH_PREFIX = '/__polish__/';
const OVERLAY_JS_PATH = path.join(__dirname, '..', 'dist', 'overlay.js');
const OVERLAY_CSS_PATH = path.join(__dirname, 'overlay', 'overlay.css');

const INJECT_SCRIPT = `<script src="${POLISH_PREFIX}overlay.js"></script>\n<link rel="stylesheet" href="${POLISH_PREFIX}overlay.css">`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

function servePolishAsset(req, res) {
  const urlPath = req.url.split('?')[0];
  if (urlPath === `${POLISH_PREFIX}overlay.js`) {
    const content = fs.readFileSync(OVERLAY_JS_PATH, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
    res.end(content);
    return true;
  }
  if (urlPath === `${POLISH_PREFIX}overlay.css`) {
    const content = fs.readFileSync(OVERLAY_CSS_PATH, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
    res.end(content);
    return true;
  }
  return false;
}

function injectOverlay(html) {
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + INJECT_SCRIPT : html.slice(0, i) + INJECT_SCRIPT + '\n' + html.slice(i);
}

function resolveFilePath(dir, urlPath) {
  let filePath = path.join(dir, decodeURIComponent(urlPath));
  if (!filePath.startsWith(dir)) return null;

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    return null;
  }

  return fs.existsSync(filePath) ? filePath : null;
}

export function createStaticServer(config) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith(POLISH_PREFIX)) {
      if (servePolishAsset(req, res)) return;
    }

    const urlPath = req.url.split('?')[0];
    const filePath = resolveFilePath(config.dir, urlPath);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    if (contentType.startsWith('text/html')) {
      const html = injectOverlay(fs.readFileSync(filePath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-cache' });
      res.end(html);
    } else {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
      res.end(content);
    }
  });

  return server;
}
