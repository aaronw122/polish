import { Command } from 'commander';
import { createProxyServer } from './proxy.js';
import { createWebSocketServer } from './server.js';
import { createWatcher } from './watcher.js';

const program = new Command();

program
  .name('polish')
  .description('Visually edit CSS/HTML on your live page')
  .version('0.1.0')
  .option('--port <number>', 'Port of the dev server to proxy', '3000')
  .option('--dir <path>', 'Project directory to watch/resolve files from', '.')
  .action((options) => {
    const targetPort = parseInt(options.port, 10);
    const polishPort = targetPort + 1;
    const dir = options.dir;

    const config = {
      targetPort,
      polishPort,
      dir,
      targetUrl: `http://localhost:${targetPort}`,
      polishUrl: `http://localhost:${polishPort}`,
    };

    const httpServer = createProxyServer(config);
    const wss = createWebSocketServer(httpServer, config);
    const watcher = createWatcher(dir, { broadcast: wss.broadcast.bind(wss) });

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
  });

program.parse();
