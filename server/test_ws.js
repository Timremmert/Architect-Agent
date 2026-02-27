const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001/api/live');
ws.on('open', () => console.log('Connected'));
ws.on('message', data => console.log('Msg:', data.toString()));
ws.on('error', err => console.log('Err:', err));
ws.on('close', code => console.log('Closed', code));
