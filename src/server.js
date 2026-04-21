import { WebSocketServer } from 'ws';
import { createWriter } from './writer.js';

export function createWebSocketServer(httpServer, config) {
  const writer = createWriter(config.dir);

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/__polish__/ws',
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
        console.log(
          `Polish: selected <${message.tag}${message.id ? '#' + message.id : ''}${
            message.classes?.length ? '.' + message.classes.join('.') : ''
          }>`
        );
        break;

      case 'deselect':
        console.log('Polish: deselected');
        break;

      case 'change':
        console.log(
          `Polish: change ${message.selector} { ${message.property}: ${message.value} } in ${message.file}`
        );
        writer.applyChange(message);
        break;

      case 'flush':
        writer.flushAll();
        break;

      default:
        console.log('Polish: unknown message type:', message.type);
    }
  }

  function broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  wss.broadcast = broadcast;

  return wss;
}
