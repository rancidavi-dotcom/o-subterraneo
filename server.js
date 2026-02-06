const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

let wss;
try {
    wss = new WebSocket.Server({ port: PORT });
    console.log(`Servidor WebSocket rodando na porta ${PORT}`);
} catch (e) {
    console.error("Não foi possível iniciar o servidor (talvez a porta já esteja em uso):", e.message);
    process.exit(0); // Sai silenciosamente se já houver um servidor
}

wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('Porta 8080 já em uso. Assumindo que outro servidor já está rodando.');
        process.exit(0);
    }
});

// Armazena as salas de jogo. 
// Estrutura: { gameCode: { host: ws, clients: [ws], state: {}, actions: [] } }
const rooms = {};

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    // ID temporário para identificar o socket antes do login
    ws.id = Math.random().toString(36).substring(7);

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

    if (!code) return;

    // Criar sala se não existir
    if (!rooms[code]) {
        rooms[code] = { 
            host: null, 
            clients: new Set(), 
            gameState: null 
        };
    }
    
    const room = rooms[code];

    switch (type) {
        case 'join':
            // Payload: { id, name, isHost }
            ws.playerId = payload.id;
            ws.playerName = payload.name;
            ws.gameCode = code;
            
            if (payload.isHost) {
                room.host = ws;
                console.log(`Host ${payload.name} conectou na sala ${code}`);
            } else {
                room.clients.add(ws);
                console.log(`Cliente ${payload.name} entrou na sala ${code}`);
            }
            break;

        case 'player_update':
            // Payload: { x, y, angle, scene, ... }
            // Se for Host, ele manda o estado do jogo também
            // Se for Cliente, ele manda só a posição dele + ações pendentes
            
            if (ws === room.host) {
                // O Host envia o estado do jogo para todos os clientes
                if (payload.gameState) {
                    room.gameState = payload.gameState;
                    broadcastToClients(room, {
                        type: 'game_state_update',
                        gameState: payload.gameState,
                        hostData: { 
                            id: ws.playerId, 
                            x: payload.x, 
                            y: payload.y, 
                            angle: payload.angle,
                            scene: payload.scene
                        }
                    });
                }
            } else {
                // Cliente envia sua posição para o Host (e para outros clientes, se necessário)
                // E envia AÇÕES para o Host processar
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                    room.host.send(JSON.stringify({
                        type: 'client_data',
                        playerId: ws.playerId,
                        playerData: payload
                    }));
                }

                // Opcional: Replicar posição deste cliente para outros clientes (para verem uns aos outros sem depender 100% do roundtrip do host para posição crua, mas idealmente o host autoriza)
                // Para simplificar e evitar desync, vamos deixar o Host retransmitir a posição de todos no gameState ou num pacote separado.
                // Mas para movimento suave, podemos fazer broadcast direto de posições entre clientes:
                broadcastToEveryoneElse(room, ws, {
                    type: 'other_player_moved',
                    id: ws.playerId,
                    name: ws.playerName,
                    x: payload.x,
                    y: payload.y,
                    angle: payload.angle,
                    scene: payload.scene
                });
            }
            break;

        case 'chat':
            broadcastToRoom(room, {
                type: 'chat',
                sender: payload.sender,
                message: payload.message,
                id: Date.now()
            });
            break;
            
        case 'action':
            // Cliente enviando ação específica (ex: comprar ovo)
            // Encaminhar DIRETAMENTE para o Host
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(JSON.stringify({
                    type: 'client_action',
                    playerId: ws.playerId,
                    action: payload
                }));
            }
            break;
    }
}

function handleDisconnect(ws) {
    if (!ws.gameCode || !rooms[ws.gameCode]) return;
    
    const room = rooms[ws.gameCode];
    
    if (ws === room.host) {
        console.log(`Host saiu da sala ${ws.gameCode}. Encerrando sala.`);
        // Notificar clientes que o host saiu
        broadcastToClients(room, { type: 'host_disconnected' });
        delete rooms[ws.gameCode];
    } else {
        if (room.clients.has(ws)) {
            room.clients.delete(ws);
            console.log(`Cliente ${ws.playerName} saiu da sala ${ws.gameCode}`);
            
            // Avisar o host e outros
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(JSON.stringify({
                    type: 'player_disconnected',
                    playerId: ws.playerId
                }));
            }
            broadcastToEveryoneElse(room, ws, {
                type: 'player_left',
                id: ws.playerId
            });
        }
    }
}

function broadcastToClients(room, data) {
    const msg = JSON.stringify(data);
    for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

function broadcastToRoom(room, data) {
    const msg = JSON.stringify(data);
    if (room.host && room.host.readyState === WebSocket.OPEN) room.host.send(msg);
    for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
}

function broadcastToEveryoneElse(room, senderWs, data) {
    const msg = JSON.stringify(data);
    if (room.host && room.host !== senderWs && room.host.readyState === WebSocket.OPEN) {
        room.host.send(msg);
    }
    for (const client of room.clients) {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

// Ping para manter conexões vivas
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
