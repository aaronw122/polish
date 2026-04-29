import path from 'node:path';
import { parseArgs } from 'node:util';
import { createProxyServer } from './proxy.js';
import { createWebSocketServer } from './server.js';
import { createResolver } from './resolver.js';
import { createWatcher } from './watcher.js';

function startPolish(httpServer, dir, port) {
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
    console.log(`Polish proxying → http://localhost:${port}`);
    console.log(`Watching ${dir} for CSS changes`);
  });
}

const { values } = parseArgs({
  options: {
    proxy: { type: 'string' },
    port:  { type: 'string', default: '3333' },
    dir:   { type: 'string', default: '.' },
  },
  strict: true,
});

if (!values.proxy) {
  console.error('Error: --proxy is required');
  process.exit(1);
}

const port = parseInt(values.port, 10);
const dir = path.resolve(values.dir);
const httpServer = createProxyServer({ targetUrl: values.proxy });
startPolish(httpServer, dir, port);
