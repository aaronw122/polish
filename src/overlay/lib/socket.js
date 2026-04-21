/**
 * WebSocket client — connect, send, reconnect.
 * Dispatches received messages to a provided handler.
 */

let ws = null;
let reconnectTimer = null;
let messageHandler = null;

export function setMessageHandler(handler) {
  messageHandler = handler;
}

export function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/__polish__/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[Polish] Connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (messageHandler) {
        messageHandler(message);
      }
    } catch (err) {
      console.error('[Polish] Invalid message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[Polish] Disconnected, reconnecting...');
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 2000);
}

export function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
