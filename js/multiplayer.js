// js/multiplayer.js
// Usando WebSocket nativo do navegador (disponível no Electron Renderer)

let ws = null;
let isConnected = false;
let isMultiplayerHost = false; 

// Estado local do multiplayer
let multiplayerState = {
    PLAYER_ID: null,
    GAME_CODE: null,
    myPlayerNickname: null,
    API_URL: 'wss://o-subterraneo.onrender.com', // Sua URL real do Render
    queen: null,
    otherPlayers: new Map(), // Map<id, Ant>
    currentScene: null,
    gamePaused: null,
    
    // Referências para o estado do jogo (para o Host ler e Cliente escrever)
    colonyName: null,
    chambers: null,
    eggs: null,
    leaves: null,
    storedLeaves: null,
    workers: null,
    gameYear: null,
    gameDay: null,
    gameHour: null,
    dayProgress: null,
    
    // Funções do engine
    displayChatMessage: null,
    serializeGameState: null,
    updateHUD: null,
    updateGameTimeDisplay: null,
    togglePause: null,
    
    // Função para o Host processar ações reais no jogo
    processHostAction: null,
    applyGameState: null
};

// Chat
let isChatOpen = false;

function generateRandomCode(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// Inicializa a conexão WebSocket
function connectToMultiplayer() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    console.log("Conectando ao servidor Multiplayer:", multiplayerState.API_URL);
    ws = new WebSocket(multiplayerState.API_URL);

    ws.onopen = () => {
        console.log("Conectado ao servidor WebSocket!");
        isConnected = true;
        
        // Envia pacote de entrada
        ws.send(JSON.stringify({
            type: 'join',
            code: multiplayerState.GAME_CODE,
            payload: {
                id: multiplayerState.PLAYER_ID,
                name: multiplayerState.myPlayerNickname,
                isMultiplayerHost: isMultiplayerHost
            }
        }));

        multiplayerState.displayChatMessage('Sistema', 'Conectado ao servidor multiplayer.', true);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        } catch (e) {
            console.error("Erro ao processar mensagem do servidor:", e);
        }
    };

    ws.onclose = () => {
        console.log("Desconectado do servidor.");
        isConnected = false;
        multiplayerState.displayChatMessage('Sistema', 'Desconectado do servidor.', true);
    };

    ws.onerror = (err) => {
        console.error("Erro no WebSocket:", err);
        multiplayerState.displayChatMessage('Sistema', 'Erro de conexão.', true);
    };
}

// Loop principal de envio de dados
let lastUpdate = 0;
const UPDATE_RATE = 50; 

function syncMultiplayerLoop() {
    if (!isConnected || !multiplayerState.queen) return;

    const now = Date.now();
    if (now - lastUpdate < UPDATE_RATE) return;
    lastUpdate = now;

    // Pega o estado ATUAL da cena (global do engine.js)
    const currentSceneValue = typeof currentScene !== 'undefined' ? currentScene : multiplayerState.currentScene;

    // Pacote de atualização do jogador
    const updatePayload = {
        x: multiplayerState.queen.x,
        y: multiplayerState.queen.y,
        angle: multiplayerState.queen.angle,
        scene: currentSceneValue,
        hp: multiplayerState.queen.hp,
        hunger: typeof queenHunger !== 'undefined' ? queenHunger : 100
    };

    // Se for HOST, anexa o estado do jogo completo
    if (isMultiplayerHost) {
        if (multiplayerState.serializeGameState) {
            updatePayload.gameState = multiplayerState.serializeGameState();
        }
    }

    ws.send(JSON.stringify({
        type: 'player_update',
        code: multiplayerState.GAME_CODE,
        payload: updatePayload
    }));
}

// Processa mensagens recebidas do servidor
function handleServerMessage(msg) {
    switch (msg.type) {
        case 'room_update':
        case 'game_started':
        case 'room_created':
            // Ignorar mensagens de lobby dentro do jogo
            break;
            
        case 'chat':
            multiplayerState.displayChatMessage(msg.sender, msg.message);
            break;

        case 'other_player_moved':
            updateOtherPlayer(msg);
            break;

        case 'game_state_update':
            // CLIENTE: Recebe estado do jogo do Host
            if (!isMultiplayerHost) {
                if (multiplayerState.applyGameState) {
                    multiplayerState.applyGameState(msg.gameState);
                }
                // Também atualiza a posição do Host se vier junto
                if (msg.hostData) {
                    updateOtherPlayer({
                        id: msg.hostData.id,
                        name: "Host", 
                        x: msg.hostData.x,
                        y: msg.hostData.y,
                        angle: msg.hostData.angle,
                        scene: msg.hostData.scene || "underground" 
                    });
                }
            }
            break;

        case 'client_data':
            // HOST: Recebe dados de um cliente (posição)
            if (isMultiplayerHost) {
                updateOtherPlayer({
                    id: msg.playerId,
                    x: msg.playerData.x,
                    y: msg.playerData.y,
                    angle: msg.playerData.angle,
                    scene: msg.playerData.scene,
                    name: "Player " + msg.playerId.substr(0,4)
                });
            }
            break;

        case 'client_action':
            // HOST: Recebe pedido de ação de um cliente
            if (isMultiplayerHost) {
                console.log(`Host recebeu ação de ${msg.playerId}:`, msg.action);
                if (multiplayerState.processHostAction) {
                    multiplayerState.processHostAction(msg.action, msg.playerId);
                }
            }
            break;
            
        case 'player_left':
            if (multiplayerState.otherPlayers.has(msg.id)) {
                const p = multiplayerState.otherPlayers.get(msg.id);
                multiplayerState.displayChatMessage('Sistema', `Jogador ${p.name || msg.id} saiu.`, true);
                multiplayerState.otherPlayers.delete(msg.id);
            }
            break;
            
        case 'host_disconnected':
            multiplayerState.displayChatMessage('Sistema', 'O Host desconectou. O jogo acabou.', true);
            break;
    }
}

function updateOtherPlayer(data) {
    if (data.id === multiplayerState.PLAYER_ID) return;

    let ant = multiplayerState.otherPlayers.get(data.id);
    if (!ant) {
        // Assume Ant is globally available from ant.js
        if (typeof Ant !== 'undefined') {
            ant = new Ant(data.x, data.y, 'queen', data.id, data.name || 'Unknown');
            multiplayerState.otherPlayers.set(data.id, ant);
        }
    }

    if (ant) {
        ant.targetX = data.x;
        ant.targetY = data.y;
        ant.angle = data.angle;
        if (data.scene) ant.currentMap = data.scene;
        if (data.name && ant.name === 'Unknown') ant.name = data.name;
    }
}

// --- Funções Exportadas ---

function sendAction(actionType, payload = {}) {
    if (isMultiplayerHost) {
        if (multiplayerState.processHostAction) {
            multiplayerState.processHostAction({ type: actionType, ...payload }, multiplayerState.PLAYER_ID);
        }
    } else {
        if (isConnected) {
            ws.send(JSON.stringify({
                type: 'action',
                code: multiplayerState.GAME_CODE,
                payload: { type: actionType, ...payload }
            }));
        }
    }
}

function sendChatMessage(sender, message) {
    if (!isConnected) return;
    ws.send(JSON.stringify({
        type: 'chat',
        code: multiplayerState.GAME_CODE,
        payload: { sender, message }
    }));
}

function initializeMultiplayer(engineState) {
    Object.assign(multiplayerState, engineState);
    
    // Detecta se é Host pela URL
    const params = new URLSearchParams(window.location.search);
    isMultiplayerHost = params.get('host') === 'true';
    
    // Sincroniza a variável global do engine se ela existir
    if (typeof isHost !== 'undefined') isHost = isMultiplayerHost;

    if (multiplayerState.GAME_CODE) {
        connectToMultiplayer();
    }

    setInterval(syncMultiplayerLoop, UPDATE_RATE);

    window.addEventListener('keydown', (e) => { 
        if (e.key.toLowerCase() === 't') {
            e.preventDefault();
            isChatOpen = !isChatOpen;
            const chatInput = document.getElementById('chat-input');
            const chatContainer = document.getElementById('chat-container');

            if (isChatOpen) {
                chatContainer.style.display = 'flex';
                chatInput.disabled = false;
                chatInput.focus();
                if(multiplayerState.togglePause) multiplayerState.togglePause(true);
            } else {
                chatContainer.style.display = 'none';
                chatInput.disabled = true;
                chatInput.blur();
                if(multiplayerState.togglePause) multiplayerState.togglePause(false);
            }
        }
    });

    window.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && isChatOpen) {
            const chatInput = document.getElementById('chat-input');
            const message = chatInput.value.trim();
            if (message) {
                sendChatMessage(multiplayerState.myPlayerNickname, message);
                chatInput.value = '';
            }
            chatInput.focus();
        }
    });
}

async function disconnectPlayer() {
    if (ws) ws.close();
}

// module.exports = {
//     initializeMultiplayer,
//     generateRandomCode,
//     sendChatMessage,
//     sendAction,
//     disconnectPlayer,
//     get isMultiplayerHost() { return isMultiplayerHost; },
//     set isMultiplayerHost(val) { isMultiplayerHost = val; }
// };

// Tornar global para o browser
window.Multiplayer = {
    initialize: initializeMultiplayer,
    generateRandomCode: generateRandomCode,
    sendChatMessage: sendChatMessage,
    sendAction: sendAction,
    disconnect: disconnectPlayer,
    get isMultiplayerHost() { return isMultiplayerHost; },
    set isMultiplayerHost(val) { isMultiplayerHost = val; }
};