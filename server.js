const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// Tipos de arquivos suportados para o servidor estático
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

// Cria um servidor HTTP que serve os arquivos do jogo e o WebSocket
const server = http.createServer((req, res) => {
    // Remove parâmetros da URL (como ?mode=new) para encontrar o arquivo correto
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let filePath = '.' + parsedUrl.pathname;
    
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end("Arquivo não encontrado");
            } else {
                res.writeHead(500);
                res.end(`Erro no servidor: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

console.log(`Servidor iniciado na porta ${PORT}`);

const rooms = {};

wss.on('connection', (ws) => {
    console.log("Nova conexão estabelecida!");
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (e) {
            console.error("Erro ao processar mensagem:", e);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleMessage(ws, data) {
    const { type, code, payload } = data;
    if (!code && type !== 'create_room') return;

    switch (type) {
        case 'create_room':
            const newCode = Math.random().toString(36).substr(2, 5).toUpperCase();
            rooms[newCode] = { 
                host: ws, 
                clients: new Set(), 
                gameState: null,
                players: [{ id: payload.id, name: payload.name, isHost: true, ready: true }]
            };
            ws.gameCode = newCode;
            ws.playerId = payload.id;
            ws.playerName = payload.name;
            ws.send(JSON.stringify({ type: 'room_created', code: newCode, players: rooms[newCode].players }));
            console.log(`[SALA ${newCode}] Criada por ${payload.name}`);
            break;

        case 'join_room':
            if (!rooms[code]) {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada' }));
                return;
            }
            const room = rooms[code];
            if (room.players.length >= 4) {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala cheia (máx 4)' }));
                return;
            }
            
            ws.gameCode = code;
            ws.playerId = payload.id;
            ws.playerName = payload.name;
            room.clients.add(ws);
            room.players.push({ id: payload.id, name: payload.name, isHost: false, ready: false });
            
            broadcastToRoom(room, { type: 'room_update', players: room.players });
            console.log(`[SALA ${code}] ${payload.name} entrou`);
            break;

        case 'toggle_ready':
            if (rooms[code]) {
                const p = rooms[code].players.find(p => p.id === ws.playerId);
                if (p) p.ready = !p.ready;
                broadcastToRoom(rooms[code], { type: 'room_update', players: rooms[code].players });
            }
            break;

        case 'start_game':
            if (rooms[code] && ws === rooms[code].host) {
                broadcastToRoom(rooms[code], { type: 'game_started' });
                console.log(`[SALA ${code}] Jogo iniciado pelo Host`);
            }
            break;

        case 'player_update':
            // Log silencioso para depuração (opcional, remova se der muito spam)
            // console.log(`Atualização de ${ws.playerName} na sala ${code}`);
            
            if (ws === room.host) {
                if (payload.gameState) {
                    room.gameState = payload.gameState;
                    broadcastToClients(room, {
                        type: 'game_state_update',
                        gameState: payload.gameState,
                        hostData: { id: ws.playerId, x: payload.x, y: payload.y, angle: payload.angle, scene: payload.scene }
                    });
                }
            } else {
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                    room.host.send(JSON.stringify({ type: 'client_data', playerId: ws.playerId, playerData: payload }));
                }
                broadcastToEveryoneElse(room, ws, {
                    type: 'other_player_moved',
                    id: ws.playerId, name: ws.playerName, x: payload.x, y: payload.y, angle: payload.angle, scene: payload.scene
                });
            }
            break;

        case 'chat':
            broadcastToRoom(room, { type: 'chat', sender: payload.sender, message: payload.message });
            break;
            
        case 'action':
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(JSON.stringify({ type: 'client_action', playerId: ws.playerId, action: payload }));
            }
            break;
    }
}

function handleDisconnect(ws) {
    if (!ws.gameCode || !rooms[ws.gameCode]) return;
    const room = rooms[ws.gameCode];
    
    if (ws === room.host) {
        console.log(`[SALA ${ws.gameCode}] Host saiu. Fechando sala.`);
        broadcastToClients(room, { type: 'host_disconnected' });
        delete rooms[ws.gameCode];
    } else {
        room.clients.delete(ws);
        room.players = room.players.filter(p => p.id !== ws.playerId);
        broadcastToRoom(room, { type: 'room_update', players: room.players });
        console.log(`[SALA ${ws.gameCode}] Cliente desconectado.`);
    }
}

function broadcastToClients(room, data) {
    const msg = JSON.stringify(data);
    room.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(msg); });
}

function broadcastToRoom(room, data) {
    const msg = JSON.stringify(data);
    if (room.host && room.host.readyState === WebSocket.OPEN) room.host.send(msg);
    room.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(msg); });
}

function broadcastToEveryoneElse(room, senderWs, data) {
    const msg = JSON.stringify(data);
    if (room.host && room.host !== senderWs && room.host.readyState === WebSocket.OPEN) room.host.send(msg);
    room.clients.forEach(client => { if (client !== senderWs && client.readyState === WebSocket.OPEN) client.send(msg); });
}

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`ERRO: A porta ${PORT} já está em uso por outro processo.`);
        process.exit(0); // Sai silenciosamente se a porta estiver ocupada
    } else {
        console.error("Erro no servidor HTTP:", e);
    }
});

server.listen(PORT, () => {
    console.log(`Servidor rodando e aceitando conexões na porta ${PORT}`);
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);