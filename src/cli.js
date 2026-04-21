import http from 'node:http';
import path from 'node:path';
import { Command } from 'commander';
import { createProxyServer } from './proxy.js';
import { createWebSocketServer } from './server.js';
import { createResolver } from './resolver.js';
import { createWatcher } from './watcher.js';

/**
 * Check if the target port has something running by sending a quick HTTP request.
 * Returns true if we get a response (or connection refused-like error means nothing is running).
 */
function checkTargetPort(targetUrl) {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, { timeout: 2000 }, (res) => {
      res.resume(); // Drain response
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

const program = new Command();

program
  .name('polish')
  .description('Visually edit CSS/HTML on your live page')
  .version('0.1.0')
  .option('--port <number>', 'Port of the dev server to proxy', '3000')
  .option('--dir <path>', 'Project directory to watch/resolve files from', '.')
  .action(async (options) => {
    const targetPort = parseInt(options.port, 10);
    const polishPort = targetPort + 1;
    const dir = path.resolve(options.dir);

    const config = {
      targetPort,
      polishPort,
      dir,
      targetUrl: `http://localhost:${targetPort}`,
      polishUrl: `http://localhost:${polishPort}`,
    };

    // Startup validation: check if target port has something running
    const targetAvailable = await checkTargetPort(config.targetUrl);
    if (!targetAvailable) {
      console.warn(
        `Polish: warning — nothing appears to be running on http://localhost:${targetPort}. ` +
        `Make sure your dev server is started, or Polish will show a "503" page.`
      );
    }

    const resolver = createResolver(dir);
    console.log(`Polish: scanned ${dir} for CSS/HTML sources (${resolver.rules.length} rules found)`);

    const httpServer = createProxyServer(config);
    const wss = createWebSocketServer(httpServer, config);
    wss.setResolver(resolver);
    wss.resolver = resolver;
    const watcher = createWatcher(dir, { broadcast: wss.broadcast.bind(wss) });
    watcher.onFileChange(() => resolver.rescan());

    httpServer.listen(polishPort, () => {
      console.log(
        `Polish running on http://localhost:${polishPort} → proxying http://localhost:${targetPort}`
      );
      console.log(`Press Cmd+Shift+P (Mac) / Ctrl+Shift+P (Win) to toggle overlay`);
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${polishPort} is already in use. Try a different --port value.`);
        process.exit(1);
      }
      console.error('Server error:', err);
    });

    // Graceful shutdown on Ctrl+C
    function gracefulShutdown() {
      console.log('\nPolish: shutting down...');

      // Close WebSocket connections
      for (const client of wss.clients) {
        try {
          client.close(1000, 'Polish shutting down');
        } catch {
          // Ignore errors closing individual clients
        }
      }

      // Close the watcher
      watcher.close().catch(() => {});

      // Close the HTTP server
      httpServer.close(() => {
        console.log('Polish: stopped.');
        process.exit(0);
      });

      // Force exit after 3 seconds if clean shutdown stalls
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    }

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  });

program.parse();
