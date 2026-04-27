import path from 'node:path';
import { Command } from 'commander';
import { createStaticServer } from './static-server.js';
import { createWebSocketServer } from './server.js';
import { createResolver } from './resolver.js';
import { createWatcher } from './watcher.js';

const program = new Command();

program
  .name('polish')
  .description('Visually edit CSS/HTML on your live page')
  .version('0.1.0')
  .option('--port <number>', 'Port to serve on', '3000')
  .option('--dir <path>', 'Project directory', '.')
  .action((options) => {
    const port = parseInt(options.port, 10);
    const dir = path.resolve(options.dir);

    const resolver = createResolver(dir);
    console.log(`Polish: scanned ${dir} (${resolver.rules.length} CSS rules found)`);

    const httpServer = createStaticServer({ dir });
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
      console.log(`Polish serving ${dir} on http://localhost:${port}`);
    });
  });

program.parse();
