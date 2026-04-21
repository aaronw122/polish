import { WebSocketServer } from 'ws';

export function createWebSocketServer(httpServer, config) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/__polish__/ws',
  });

  let resolver = null;

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
      case 'select': {
        const desc = `<${message.tag}${message.id ? '#' + message.id : ''}${
          message.classes?.length ? '.' + message.classes.join('.') : ''
        }>`;
        console.log(`Polish: selected ${desc}`);

        if (resolver) {
          const result = resolver.resolve({
            tag: message.tag,
            id: message.id,
            classes: message.classes,
            inlineStyles: message.inlineStyles || '',
          });

          ws.send(
            JSON.stringify({
              type: 'source',
              file: result.file,
              line: result.line,
              selector: result.selector,
              properties: result.properties,
              matchedRules: result.matchedRules,
            })
          );
        }
        break;
      }

      case 'deselect':
        console.log('Polish: deselected');
        break;

      case 'change':
        console.log(
          `Polish: change ${message.selector} { ${message.property}: ${message.value} } in ${message.file}`
        );
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

  /**
   * Set the resolver instance for source resolution.
   * Called by CLI on startup after the resolver is initialized.
   */
  function setResolver(resolverInstance) {
    resolver = resolverInstance;
  }

  wss.broadcast = broadcast;
  wss.setResolver = setResolver;

  return wss;
}
