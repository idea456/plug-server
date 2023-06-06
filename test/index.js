const Websocket = require('ws');

const socket = new Websocket('ws://localhost:4567');

socket.on('connection', ws => {
    console.log('Successfully connected to Plug server!');
    ws.on('error', console.error);
    ws.on('message', console.log);
    ws.on('data', console.log);
});

console.log(socket.readyState);
