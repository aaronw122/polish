import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { createStaticServer } from './static-server.js';
import { createWebSocketServer } from './server.js';
import { createResolver } from './resolver.js';
import { createWatcher } from './watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY_JS = path.join(__dirname, '..', 'dist', 'overlay.js');
const OVERLAY_CSS = path.join(__dirname, 'overlay', 'overlay.css');

/**
 * Lightweight server that only serves Polish overlay assets.
 * Used in --src mode where the user's dev server is already running.
 */
function createOverlayServer() {
  return http.createServer((req, res) => {
    // CORS — overlay is loaded cross-origin from the user's dev server
    res.setHeader('Access-Control-Allow-Origin', '*');

    const urlPath = req.url.split('?')[0];

    if (urlPath === '/__polish__/overlay.js' || urlPath === '/overlay.js') {
      const content = fs.readFileSync(OVERLAY_JS, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
      res.end(content);
      return;
    }

    if (urlPath === '/__polish__/overlay.css' || urlPath === '/overlay.css') {
      const content = fs.readFileSync(OVERLAY_CSS, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
      res.end(content);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
}

function startPolish(httpServer, dir, port, mode) {
  const resolver = createResolver(dir);
  console.log(`Polish: scanned ${dir} (${resolver.rules.length} CSS rules found)`);

  const wss = createWebSocketServer(httpServer, { dir });
  wss.setResolver(resolver);

  const watcher = createWatcher(dir, { broadcast: wss.broadcast.bind(wss) });
  watcher.onFileChange(() => resolver.rescan());

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      process.exit(1);
    }
    console.error('Server error:', err);
  });

  process.on('SIGINT', () => {
    console.log('\nPolish: shutting down...');
    try { wss.flushAll(); } catch {}
    for (const client of wss.clients) {
      try { client.close(1000, 'Polish shutting down'); } catch {}
    }
    watcher.close().catch(() => {});
    httpServer.close(() => { console.log('Polish: stopped.'); process.exit(0); });
    setTimeout(() => process.exit(0), 3000);
  });

  httpServer.listen(port, () => {
    if (mode === 'src') {
      console.log(`Polish ready on http://localhost:${port}`);
      console.log(`Watching ${dir} for CSS changes`);
      console.log('');
      console.log('Inject into your running app — paste in browser console:');
      console.log(`  (()=>{let s=document.createElement('script');s.src='http://localhost:${port}/overlay.js';document.body.appendChild(s)})()`);
      console.log('');
    } else {
      console.log(`Polish serving ${dir} on http://localhost:${port}`);
    }
  });
}

const program = new Command();

program
  .name('polish')
  .description('Visually edit CSS/HTML on your live page')
  .version('0.1.0')
  .option('--port <number>', 'Port for Polish server', '3000')
  .option('--dir <path>', 'Serve and edit a static site')
  .option('--src <path>', 'Watch source files (use with your own dev server)')
  .action((options) => {
    const port = parseInt(options.port, 10);

    if (options.src) {
      const dir = path.resolve(options.src);
      const httpServer = createOverlayServer();
      startPolish(httpServer, dir, port, 'src');
    } else {
      const dir = path.resolve(options.dir || '.');
      const httpServer = createStaticServer({ dir });
      startPolish(httpServer, dir, port, 'dir');
    }
  });

program.parse();
