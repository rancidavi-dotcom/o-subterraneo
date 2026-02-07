// const { ipcRenderer } = require('electron'); // REMOVIDO PARA RODAR NO NAVEGADOR
// const multiplayer = require('./js/multiplayer.js'); // Removido para multiplayer local
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Expor helpers para UI (sidebar.js) - Adaptados para multiplayer
window.multiplayerIsHost = () => {
    if (window.Multiplayer) return window.Multiplayer.isHost;
    return true; // Solo mode is always host
};
window.getGameCode = () => {
    return GAME_CODE;
};
window.sendMultiplayerAction = (action, payload) => {
    if (window.Multiplayer) {
        window.Multiplayer.sendAction(action, payload);
    }
};


// 1. CONFIGURAÇÕES E CONSTANTES
const WORLD_SIZE = 10000;
const TILE_SIZE = 200; 
const CX = WORLD_SIZE / 2;
const CY = WORLD_SIZE / 2;
let FOOD_CAPACITY = 20; // Level 1 default
let ANT_CAPACITY = 10;  // Level 1 default
const INITIAL_CHAMBER_RADIUS = 250;
const MAX_CHAT_MESSAGES = 50; 
const SAVE_VERSION = 1; // Current save file version

// 2. ESTADO DO JOGO
let mapName = "A Superfície";
let currentScene = "surface"; 
let queen = null;
let workers = [];
let otherPlayers = new Map(); 
let gamePaused = false;
let isMouseDown = false;
let colonyName = "";
let gregCongratulated = false;
let skipVotes = new Set(); // Declarado globalmente
const PLAYER_ID = Math.random().toString(36).substr(2, 9);

let gameDay = 1;
let gameYear = 1;
let gameHour = 0; 
let dayProgress = 0; 
const DAY_LENGTH_SECONDS = 7200; 
const HOURS_PER_DAY = 24;
const SEASONS = ["Primavera", "Verão", "Outono", "Inverno", "Estação das Monções"];
let currentSeasonIndex = 0;
let seasonOverlayColor = null; 
let isStockpilingEnabled = true;
let leafSpawnTimer = 0;
let creatureSpawnTimer = 0;
let dropletSpawnTimer = 0;

// Sistema de Partículas
let particles = [];
function createParticle(x, y, color, type = 'dust') {
    particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
        life: 1.0,
        size: Math.random() * 3 + 1,
        color: color,
        type: type
    });
}

function updateParticles() {
    if (graphicQuality === 'ultralow') {
        particles = [];
        return;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.01;
        if (p.life <= 0) particles.splice(i, 1);
    }
    
    // Partículas ambientais (REDUZIDAS conforme qualidade)
    let particleChance = 0.15;
    if (graphicQuality === 'medium') particleChance = 0.08;
    else if (graphicQuality === 'low') particleChance = 0.03;

    if (Math.random() < particleChance) {
        const rx = camera.x + (Math.random() - 0.5) * canvas.width / zoom;
        const ry = camera.y + (Math.random() - 0.5) * canvas.height / zoom;
        createParticle(rx, ry, currentScene === "surface" ? "rgba(255,255,200,0.2)" : "rgba(150,100,50,0.15)");
    }

    // Poeira ao andar (Apenas Médio+)
    if (graphicQuality !== 'low' && queen && queen.isMoving && Math.random() < 0.1) {
        createParticle(queen.x, queen.y + 5, "rgba(139,69,19,0.3)");
    }
}

// Sistema de Feromônios
let pheromones = []; // {x, y, life, type}
let isMarkingMode = false;

// Sistema de Fome
let queenHunger = 100;
let maxQueenHunger = 100;
let colonyHungerTimer = 0;

let grassTexture = new Image();
let mudTexture = new Image();
let dirtTexture = new Image();
let nightOverlayAlpha = 0; 
let globalTime = 0; 

// Gerador de Texturas Realistas (Off-screen)
function createProceduralTexture(type) {
    const size = 512;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tCtx = tempCanvas.getContext('2d');

    if (type === 'grass') {
        // ... (mantendo a lógica de base da grama já otimizada)
        tCtx.fillStyle = '#2d4c0f';
        tCtx.fillRect(0, 0, size, size);
        for(let i=0; i<5000; i++) {
            tCtx.fillStyle = `rgba(40, 30, 10, ${Math.random() * 0.3})`;
            tCtx.fillRect(Math.random()*size, Math.random()*size, 2, 2);
        }
    } else if (type === 'dirt' || type === 'mud') {
        // 1. BASE: Camada de Sedimento Variável
        tCtx.fillStyle = type === 'dirt' ? '#3d2b1f' : '#1a0f05';
        tCtx.fillRect(0, 0, size, size);

        // 2. RUÍDO DE TEXTURA (Grãos de areia e minerais)
        for(let i=0; i<15000; i++) {
            const s = Math.random() * 1.5;
            const lum = Math.random() * 40;
            tCtx.fillStyle = `rgba(${60+lum}, ${45+lum}, ${30+lum}, ${0.1 + Math.random()*0.2})`;
            tCtx.fillRect(Math.random()*size, Math.random()*size, s, s);
        }

        // 3. PEDREGULHOS (Seixos com profundidade)
        for(let i=0; i<80; i++) {
            const px = Math.random() * size;
            const py = Math.random() * size;
            const pSize = 2 + Math.random() * 5;
            
            // Sombra da pedra
            tCtx.fillStyle = 'rgba(0,0,0,0.4)';
            tCtx.beginPath(); tCtx.arc(px+1, py+1, pSize, 0, Math.PI*2); tCtx.fill();
            
            // Corpo da pedra
            const pGrad = tCtx.createRadialGradient(px-1, py-1, 0, px, py, pSize);
            const pCol = 80 + Math.random()*40;
            pGrad.addColorStop(0, `rgb(${pCol+20},${pCol+15},${pCol})`);
            pGrad.addColorStop(1, `rgb(${pCol-20},${pCol-25},${pCol-30})`);
            tCtx.fillStyle = pGrad;
            tCtx.beginPath(); tCtx.arc(px, py, pSize, 0, Math.PI*2); tCtx.fill();
        }

        // 4. RACHADURAS E VEIOS ORGÂNICOS
        tCtx.strokeStyle = 'rgba(0,0,0,0.25)';
        tCtx.lineWidth = 0.8;
        for(let i=0; i<40; i++) {
            let rx = Math.random() * size;
            let ry = Math.random() * size;
            tCtx.beginPath();
            tCtx.moveTo(rx, ry);
            for(let j=0; j<5; j++) {
                rx += (Math.random()-0.5) * 20;
                ry += (Math.random()-0.5) * 20;
                tCtx.lineTo(rx, ry);
            }
            tCtx.stroke();
        }

        // 5. VARIAÇÃO DE UMIDADE (Manchas escuras)
        for(let i=0; i<15; i++) {
            const mx = Math.random() * size;
            const my = Math.random() * size;
            const mSize = 40 + Math.random() * 80;
            const mGrad = tCtx.createRadialGradient(mx, my, 0, mx, my, mSize);
            mGrad.addColorStop(0, 'rgba(0,0,0,0.15)');
            mGrad.addColorStop(1, 'rgba(0,0,0,0)');
            tCtx.fillStyle = mGrad;
            tCtx.fillRect(0, 0, size, size); // Pinta a mancha usando o gradiente
        }
    }

    const img = new Image();
    img.src = tempCanvas.toDataURL();
    return img;
}

// Sistema de Alertas
let lastGregAlertTime = 0;
function showQuickAlert(text) {
    const alertEl = document.getElementById('quick-alert');
    const textEl = document.getElementById('quick-alert-text');
    if (!alertEl || !textEl) return;

    textEl.innerText = text;
    alertEl.style.display = 'block';
    alertEl.style.opacity = '1';

    // Esconder após 5 segundos
    setTimeout(() => {
        alertEl.style.opacity = '0';
        setTimeout(() => { alertEl.style.display = 'none'; }, 500);
    }, 5000);
}

function checkProximityAlerts() {
    if (currentScene !== "surface") return;
    if (Date.now() - lastGregAlertTime < 30000) return; // Cooldown de 30 segundos entre alertas

    const dangerCreature = creatures.find(c => {
        if (c.isDead || c.isDefeated || c.isTamed) return false;
        if (c.type !== 'spider' && c.type !== 'beetle') return false;
        
        const distToBase = Math.sqrt(Math.pow(c.x - CX, 2) + Math.pow(c.y - CY, 2));
        return distToBase < 1000;
    });

    if (dangerCreature) {
        showQuickAlert(`Cuidado! Um predador (${dangerCreature.name}) foi detectado perto do Império!`);
        lastGregAlertTime = Date.now();
    }
}

// Flag de segurança para impedir reset acidental
let isGameRunning = false;
let isTransitioning = false; // Evita spam de troca de cena

// Sistema de Notificação de Morte
window.addEventListener('ant-died', (e) => {
    const data = e.detail;
    if (data.isQueen) {
        showQuickAlert("⚠️ A RAINHA ESTÁ MORRENDO! O Império está em colapso!");
        
        // PENALIDADE FATAL:
        // 1. Perder 70% das formigas
        const antsToKill = Math.floor(workers.length * 0.7);
        for(let i = 0; i < antsToKill; i++) {
            if (workers.length > 0) {
                const randomIndex = Math.floor(Math.random() * workers.length);
                workers.splice(randomIndex, 1);
            }
        }

        // 2. Perder todas as folhas e fungos
        storedLeaves = [];
        stockpiledLeaves = [];
        fungusFood = 0;

        setTimeout(() => {
            alert("CATÁSTROFE: A Rainha quase pereceu. A colônia perdeu 70% da população e todos os recursos estocados.");
            // Restaurar vida mínima para continuar o jogo em vez de reload
            queen.hp = 20; 
            queen.isDead = false;
            queenHunger = 50;
            saveGame();
            if (typeof updateHUD === 'function') updateHUD();
        }, 2000);
    } else {
        let label = "Uma operária";
        if (data.type === 'soldier') label = "Uma soldada";
        else if (data.type === 'scout') label = "Uma exploradora";
        
        showQuickAlert(`💀 ${label} morreu!`);
    }
});

function toggleMarkingModeFromSettings() {
    isMarkingMode = !isMarkingMode;
    const btn = document.getElementById('settings-pheromone-btn');
    if (btn) {
        btn.innerText = isMarkingMode ? "ATIVADO" : "DESATIVADO";
        btn.style.background = isMarkingMode ? "#9370DB" : "#555";
    }
    showQuickAlert(isMarkingMode ? "MODO DE MARCAÇÃO: ATIVADO" : "MODO DE MARCAÇÃO: DESATIVADO");
}

// Controles
let controlMode = 'mouse'; 
let graphicQuality = 'ultra'; // Default: Ultra
const keys = { w: false, a: false, s: false, d: false };

function updateGraphicQuality(q) {
    graphicQuality = q;
    saveGame();
    showQuickAlert(`Qualidade gráfica alterada para: ${q.toUpperCase()}`);
}

let camera = { x: CX, y: CY };
let zoom = 1.0;

// Mundo e Recursos
let chambers = { eggs: 0, food: 0, fungus: 0, domestication: 0, stockpile: 0 }; 
let eggs = []; 
let leaves = []; 
let bigLeaves = []; // Nova lista de Folhas de Bananeira
let seeds = []; 
let mapDroplets = []; 
let waterDroplets = 0; 
let creatures = []; 
let storedLeaves = []; 
let stockpiledLeaves = []; 
let foodDeliveryCounter = 0; 
let fungusFood = 0; 

function generateBananaLeaves() {
    bigLeaves = [];
    // Apenas 10 no mapa inteiro (raras)
    for (let i = 0; i < 10; i++) {
        let rx, ry, dist;
        do {
            rx = Math.random() * WORLD_SIZE;
            ry = Math.random() * WORLD_SIZE;
            dist = Math.sqrt(Math.pow(rx - CX, 2) + Math.pow(ry - CY, 2));
        } while (dist < 2000);

        bigLeaves.push({
            x: rx, y: ry,
            width: 120, height: 40,
            angle: Math.random() * Math.PI,
            carriers: [],
            name: "Folha de Bananeira Gigante",
            description: "Enorme! Precisa de 5 formigas e rende 10 folhas."
        });
    }
}

let terrainGrid = []; 
let hoveredLeaf = null;
let hoveredSeed = null; 
let hoveredCreature = null; // Nova variável para criatura

const urlParams = new URLSearchParams(window.location.search);
const HOST_IP = urlParams.get('host') || 'localhost';
let GAME_CODE = urlParams.get('code') || ''; 
let myPlayerNickname = localStorage.getItem('playerNickname') || urlParams.get('nickname') || "Visitante"; 
const API_URL = localStorage.getItem('osubterraneo_server_url') || `wss://o-subterraneo.onrender.com`; 

let isHost = urlParams.get('host') === 'true'; 
if (urlParams.get('code')) GAME_CODE = urlParams.get('code');

// 3. INICIALIZAÇÃO
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function generateTerrain() {
    terrainGrid = [];
    const gridDim = WORLD_SIZE / TILE_SIZE;
    for (let x = 0; x < gridDim; x++) {
        terrainGrid[x] = [];
        for (let y = 0; y < gridDim; y++) {
            const val = Math.random();
            if (val > 0.9) terrainGrid[x][y] = 'mud';
            else if (val < 0.1) terrainGrid[x][y] = 'dirt';
            else terrainGrid[x][y] = 'grass';
        }
    }
}

function generateLeaves() {
    leaves = [];
    for (let i = 0; i < 1000; i++) {
        leaves.push({
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            size: 6 + Math.random() * 4,
            angle: Math.random() * Math.PI,
            name: "Folha Fresca",
            description: "Recurso básico para a colônia."
        });
    }
}

function generateSeeds() {
    seeds = [];
    // A ÚNICA semente perto da base (80 pixels de distância)
    seeds.push({
        x: CX + 80,
        y: CY + 80,
        size: 28,
        angle: 0,
        name: "Semente Primordial",
        description: "Uma semente enorme! Fornece 20 fungos.",
        carriers: []
    });

    // Apenas 5 sementes num raio BEM LONGE (mínimo 1500px)
    for (let i = 0; i < 5; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 1500 + Math.random() * 1000; // Entre 1500 e 2500 pixels
        seeds.push({
            x: CX + Math.cos(ang) * r,
            y: CY + Math.sin(ang) * r,
            size: 22,
            angle: Math.random() * Math.PI,
            name: "Semente Pesada",
            description: "Rende 15 fungos, mas precisa de 2 formigas.",
            carriers: []
        });
    }

    // O restante espalhado pelo mundo gigante (mínimo 3000px de distância)
    for (let i = 0; i < 20; i++) {
        let rx, ry, dist;
        do {
            rx = Math.random() * WORLD_SIZE;
            ry = Math.random() * WORLD_SIZE;
            dist = Math.sqrt(Math.pow(rx - CX, 2) + Math.pow(ry - CY, 2));
        } while (dist < 3000);

        seeds.push({
            x: rx,
            y: ry,
            size: 20,
            angle: Math.random() * Math.PI,
            name: "Semente Selvagem",
            description: "Rende 15 fungos, mas precisa de 2 formigas.",
            carriers: []
        });
    }
}

function generateWaterDroplets() {
    mapDroplets = [];
    // Gera apenas 3 gotas em todo o mapa, longe da base
    for (let i = 0; i < 3; i++) {
        let rx, ry, dist;
        do {
            rx = Math.random() * WORLD_SIZE;
            ry = Math.random() * WORLD_SIZE;
            dist = Math.sqrt(Math.pow(rx - CX, 2) + Math.pow(ry - CY, 2));
        } while (dist < 2000); // Mínimo 2000px de distância

        mapDroplets.push({
            x: rx,
            y: ry,
            size: 15,
            name: "Gota D'água Pura",
            description: "Item Raríssimo! Necessário para domesticação."
        });
    }
}

function generateCreatures() {
    creatures = [];
    const types = ['beetle', 'spider', 'ladybug'];
    
    // NENHUMA criatura num raio de 3000px do formigueiro
    // Isso garante paz total na zona inicial
    for (let i = 0; i < 200; i++) {
        let rx, ry, dist;
        do {
            rx = Math.random() * WORLD_SIZE;
            ry = Math.random() * WORLD_SIZE;
            dist = Math.sqrt(Math.pow(rx - CX, 2) + Math.pow(ry - CY, 2));
        } while (dist < 3000);

        creatures.push(new Creature(rx, ry, types[Math.floor(Math.random() * types.length)]));
    }
}

function initGame(showEffect) { 
    console.log('initGame() called', 'showEffect:', showEffect);

    if (isGameRunning) return;

    const mode = urlParams.get('mode');
    
    // TEXTURAS SEMPRE SÃO GERADAS (INDISPENSÁVEL PARA DESENHO)
    grassTexture = createProceduralTexture('grass');
    mudTexture = createProceduralTexture('mud');
    dirtTexture = createProceduralTexture('dirt');

    // MODOS OFFLINE (Geram mundo novo ou carregam save)
    generateTerrain();
    generateLeaves();
    generateBananaLeaves();
    generateSeeds();
    generateWaterDroplets();
    generateCreatures();

    queen = new Ant(CX, CY, 'queen', null, myPlayerNickname);
    queen.targetX = CX; queen.targetY = CY;
    camera.x = CX; camera.y = CY;

    if (mode === 'new') {
        console.log('initGame: Explicitly starting a new game.');
        // Resetar variáveis para novo jogo
        chambers = { eggs: 0, food: 0, fungus: 0, domestication: 0 };
        ANT_CAPACITY = 2; // Capacidade mínima inicial
        FOOD_CAPACITY = 5; // Capacidade mínima inicial
        eggs = [];
        leaves = [];
        seeds = [];
        generateSeeds(); // Gera as sementes raras para o novo jogo
        workers = [];
        storedLeaves = [];
        fungusFood = 0;
        creatures = [];
        gregCongratulated = false;
        colonyName = ""; // Começa vazio, mas vamos pedir o nome logo abaixo
        gameYear = 1;
        gameDay = 1;
        gameHour = 6;
        dayProgress = 0;

        startGame();

        // --- CORREÇÃO AQUI ---
        // Força a abertura da janela de nomeação após 1.5 segundos
        // (tempo suficiente para a intro do Dr. Greg desaparecer)
        setTimeout(() => {
            const namingModal = document.getElementById('naming-modal');
            const nameInput = document.getElementById('colony-name-input');
            if (namingModal && nameInput) {
                gamePaused = true; // PAUSA O JOGO PARA DIGITAR
                namingModal.style.display = 'flex';
                nameInput.value = "";
                nameInput.placeholder = "Digite o nome da sua colônia...";
                
                // Garante o foco no próximo frame para Electron
                setTimeout(() => nameInput.focus(), 10);

                // Atalho Enter para confirmar
                nameInput.onkeydown = (e) => {
                    if (e.key === 'Enter') confirmColonyName();
                };
            }
        }, 1500);
        // ---------------------

    } else if (mode === 'load') {
        const loadedData = localStorage.getItem('temp_save_data');
        if (loadedData) {
            console.log('initGame: Attempting to load game from localStorage (mode=load).');
            try {
                const data = JSON.parse(loadedData);
                const loadedVersion = data.saveVersion ?? 0;
                const migratedData = migrateSaveData(data, loadedVersion);
                applyLoadedData(migratedData);
                localStorage.removeItem('temp_save_data');
            } catch (error) {
                console.error('Erro ao carregar save de arquivo:', error);
                alert('Erro ao carregar o save de arquivo. Iniciando um novo jogo.');
                localStorage.removeItem('temp_save_data');
            }
        }
        startGame();
    } else if (mode === 'continue_multi') {
        console.log('initGame: Restoring multiplayer world state...');
        const multiSave = localStorage.getItem('osubterraneo_multiplayer_save');
        if (multiSave) {
            try {
                const data = JSON.parse(multiSave);
                const loadedVersion = data.saveVersion ?? 0;
                const migratedData = migrateSaveData(data, loadedVersion);
                applyLoadedData(migratedData);
            } catch (e) { console.error("Erro ao carregar save multiplayer", e); }
        }
        startGame();
    } else { // 'continue' mode or default
        console.log('initGame: Checking for auto-save (mode=continue or default).');
        const dataStr = localStorage.getItem('osubterraneo_save');
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                console.log('initGame: Restoring game state from auto-save...');
                const loadedVersion = data.saveVersion ?? 0;
                const migratedData = migrateSaveData(data, loadedVersion);
                applyLoadedData(migratedData);
            } catch (error) {
                console.error('Erro ao restaurar save automático:', error);
            }
        } else {
            console.log('No auto-save data found. Starting a new game.');
            // Se não houver save, inicia como novo e também pede o nome (APENAS HOST)
            if (window.multiplayerIsHost()) {
                setTimeout(() => {
                    const namingModal = document.getElementById('naming-modal');
                    if (namingModal) namingModal.style.display = 'flex';
                }, 1000);
            }
        }
        startGame();
    }
}

// Função auxiliar para aplicar dados carregados (evita duplicação de código)
function applyLoadedData(migratedData) {
    colonyName = migratedData.colonyName || "";
    if (!colonyName && document.getElementById('naming-modal')) {
        document.getElementById('naming-modal').style.display = 'flex';
        document.getElementById('colony-name-input').value = "Nome corrompido! Digite um novo nome.";
    }
    chambers = migratedData.chambers || { eggs: 0, food: 0, fungus: 0, domestication: 0 };
    
    // Recalcular capacidades baseadas nos níveis
    if (chambers.eggs === 2) ANT_CAPACITY = 40;
    else if (chambers.eggs === 1) ANT_CAPACITY = 10;
    else ANT_CAPACITY = 2; // Mínimo inicial

    if (chambers.food === 2) FOOD_CAPACITY = 100;
    else if (chambers.food === 1) FOOD_CAPACITY = 20;
    else FOOD_CAPACITY = 5; // Mínimo inicial

    if (migratedData.chambers) {
        // ... (resto da lógica de botões se necessário, mas updateHUD já trata)
    }
    zoom = migratedData.zoom ?? 1.0;
    controlMode = migratedData.controlMode ?? 'mouse';
    graphicQuality = migratedData.graphicQuality ?? 'ultra';
    
    // Atualiza o select do menu se ele existir
    const gSelect = document.getElementById('graphic-quality-select');
    if (gSelect) gSelect.value = graphicQuality;

    gregCongratulated = migratedData.gregCongratulated ?? false;
    eggs = migratedData.eggs || [];
    leaves = migratedData.leaves || [];
    
    // Se houver MUITAS sementes (mais de 30), limpa o mapa para aplicar a nova raridade
    let loadedSeeds = migratedData.seeds || [];
    if (loadedSeeds.length > 30) {
        console.log("Sementes excessivas detectadas. Limpando mapa...");
        generateSeeds();
    } else if (loadedSeeds.length === 0) {
        generateSeeds();
    } else {
        seeds = loadedSeeds;
    }
    
    storedLeaves = migratedData.storedLeaves || [];
    stockpiledLeaves = migratedData.stockpiledLeaves || [];
    bigLeaves = migratedData.bigLeaves || [];
    fungusFood = migratedData.fungusFood ?? 0;
    queenHunger = migratedData.queenHunger ?? 100;
    currentSeasonIndex = migratedData.currentSeasonIndex ?? 0;

    if (migratedData.creatures) {
        creatures = migratedData.creatures.map(c => {
            const creature = new Creature(c.x, c.y, c.type);
            creature.isTamed = c.isTamed || false;
            creature.isDefeated = c.isDefeated || false;
            creature.hp = c.hp;
            if (creature.isTamed) creature.color = '#ffd700';
            return creature;
        });
    }

    if (migratedData.workers) {
        workers = migratedData.workers.map(w => {
            const ant = new Ant(w.x, w.y, w.type || 'worker'); // Usar o tipo salvo
            ant.task = w.task || 'idle';
            ant.hasFood = w.hasFood || false;
            ant.currentMap = w.currentMap || "underground";
            ant.targetLeaf = w.targetLeaf ?? null;
            ant.hp = w.hp ?? ant.hp;
            ant.hunger = w.hunger ?? 100;
            return ant;
        });
    }

    // --- CORREÇÃO MULTIPLAYER: Inicializa a Rainha Local se estiver nula ---
    if (!queen) {
        const qPos = migratedData.queen || { x: CX, y: CY };
        queen = new Ant(qPos.x, qPos.y, 'queen');
        queen.targetX = qPos.x; queen.targetY = qPos.y;
        camera.x = qPos.x; camera.y = qPos.y;
    }

    gameYear = migratedData.gameYear ?? 1;
    gameDay = migratedData.gameDay ?? 1;
    gameHour = migratedData.gameHour ?? 6;
    dayProgress = migratedData.dayProgress ?? 0;
}

function startGame() {
    console.log('startGame() called');
    isGameRunning = true; // Marca o jogo como rodando para evitar resets
    const ls = document.getElementById('loading-screen');
    if (ls) { 
        ls.style.opacity = '0'; 
        setTimeout(() => ls.style.display = 'none', 800); 
    }
    
    // Inicializar Multiplayer se houver código de sala
    const urlParams = new URLSearchParams(window.location.search);
    const gameCode = urlParams.get('code');
    if (gameCode && window.Multiplayer) {
        window.Multiplayer.initialize({
            PLAYER_ID: PLAYER_ID,
            GAME_CODE: gameCode,
            myPlayerNickname: myPlayerNickname,
            queen: queen,
            otherPlayers: otherPlayers,
            currentScene: currentScene,
            gamePaused: gamePaused,
            displayChatMessage: displayChatMessage,
            serializeGameState: serializeGameState,
            applyGameState: applyGameState,
            processHostAction: processHostAction, // ADICIONADO
            updateHUD: typeof updateHUD === 'function' ? updateHUD : null,
            updateGameTimeDisplay: updateGameTimeDisplay,
            togglePause: (p) => { gamePaused = p; }
        });
    }

    if (typeof updateHUD === 'function') updateHUD();
    
    // Inicializar contador de skip com loop de verificação
    if (window.Multiplayer && window.Multiplayer.GAME_CODE) {
        const skipCheckInterval = setInterval(() => {
            const overlay = document.getElementById('intro-overlay');
            if (!overlay || overlay.style.display === 'none') {
                clearInterval(skipCheckInterval);
                return;
            }
            const total = 1 + otherPlayers.size;
            const current = typeof skipVotes !== 'undefined' ? skipVotes.size : 0;
            updateSkipUI(current, total);
            
            // Host avisa os outros sobre o total atualizado
            if (window.multiplayerIsHost()) {
                window.sendMultiplayerAction('update_skip_counter', { current, total });
            }
        }, 1000);
    }

    requestAnimationFrame(gameLoop);
}

function synchronize_multiplayer() {
    if (!window.Multiplayer || !window.Multiplayer.GAME_CODE) return;

    // Se sou cliente, eu apenas recebo. O envio de posição já acontece no loop do multiplayer.js
    // Mas posso forçar atualizações de UI aqui se necessário.
    if (!window.multiplayerIsHost()) {
        if (typeof updateHUD === 'function') updateHUD();
    }
}

function serializeGameState() {
    return {
        colonyName,
        chambers,
        eggs,
        leaves,
        storedLeaves,
        stockpiledLeaves,
        bigLeaves,
        mapDroplets,
        waterDroplets,
        fungusFood,
        queenHunger,
        queenHP: queen ? queen.hp : 100,
        gameYear,
        gameDay,
        gameHour,
        dayProgress,
        // Sincronizar workers com mais detalhes (incluindo HP e Fome)
        workers: workers.map(w => ({
            x: w.x, y: w.y, type: w.type, task: w.task, 
            hasFood: w.hasFood, currentMap: w.currentMap,
            hp: w.hp, hunger: w.hunger, angle: w.angle
        }))
    };
}

function applyGameState(data) {
    if (!data || window.multiplayerIsHost()) return;

    // Sincronização básica do mundo
    colonyName = data.colonyName || colonyName;
    chambers = data.chambers || chambers;
    eggs = data.eggs || [];
    leaves = data.leaves || [];
    storedLeaves = data.storedLeaves || [];
    stockpiledLeaves = data.stockpiledLeaves || [];
    bigLeaves = data.bigLeaves || [];
    mapDroplets = data.mapDroplets || [];
    waterDroplets = data.waterDroplets ?? waterDroplets;
    fungusFood = data.fungusFood ?? fungusFood;
    
    // Sincronização de Tempo
    gameYear = data.gameYear || gameYear;
    gameDay = data.gameDay || gameDay;
    gameHour = data.gameHour || gameHour;
    dayProgress = data.dayProgress || dayProgress;

    // Sincronização de Status (Rainha Compartilhada)
    queenHunger = data.queenHunger ?? queenHunger;
    if (queen && data.queenHP !== undefined) {
        queen.hp = data.queenHP;
    }

    // Sincronização de Workers (Refletir o Host)
    if (data.workers) {
        if (workers.length !== data.workers.length) {
            workers = data.workers.map(dw => {
                const ant = new Ant(dw.x, dw.y, dw.type);
                Object.assign(ant, dw);
                return ant;
            });
        } else {
            data.workers.forEach((dw, i) => {
                if (workers[i]) {
                    workers[i].x = dw.x;
                    workers[i].y = dw.y;
                    workers[i].angle = dw.angle;
                    workers[i].task = dw.task;
                    workers[i].currentMap = dw.currentMap;
                    workers[i].hasFood = dw.hasFood;
                    workers[i].hp = dw.hp;
                    workers[i].hunger = dw.hunger;
                }
            });
        }
    }
    
    // Atualiza HUD local para refletir dados do host
    if (typeof updateHUD === 'function') updateHUD();
}



// 4. LÓGICA DE MOVIMENTAÇÃO E IA
function isPointWalkable(x, y) {
    if (currentScene === "surface") return true;

    // Central chamber
    const distToCenter = Math.sqrt(Math.pow(x - CX, 2) + Math.pow(y - CY, 2));
    if (distToCenter <= INITIAL_CHAMBER_RADIUS) return true;

    // Eggs chamber and tunnel
    if (chambers.eggs) {
        const distToEggsChamber = Math.sqrt(Math.pow(x - (CX + 400), 2) + Math.pow(y - CY, 2));
        if (distToEggsChamber <= 150) return true;
        if (x >= CX && x <= CX + 400 && y >= CY - 30 && y <= CY + 30) return true;
    }

    // Food chamber and tunnel
    if (chambers.food) {
        const distToFoodChamber = Math.sqrt(Math.pow(x - (CX - 400), 2) + Math.pow(y - CY, 2));
        if (distToFoodChamber <= 150) return true;
        if (x >= CX - 400 && x <= CX && y >= CY - 30 && y <= CY + 30) return true;
    }
    
    // Fungus chamber and tunnel
    if (chambers.fungus) {
         const distToFungusChamber = Math.sqrt(Math.pow(x - (CX + 800), 2) + Math.pow(y - CY, 2));
         if (distToFungusChamber <= 150) return true;
         // Tunnel for fungus (assuming it extends from egg chamber or center, adjusted to CX+800)
         if (x >= CX && x <= CX + 800 && y >= CY - 30 && y <= CY + 30) return true;
    }
    
    return false;
}


let pendingDefeatedCreature = null; // Guarda a criatura derrotada enquanto o modal está aberto

function updateCombat() {
    if (currentScene !== "surface") return;

    creatures.forEach(c => {
        if (c.isDead || c.isDefeated || c.isTamed) return;

        // Formigas atacam criatura
        workers.forEach(w => {
            if (w.currentMap === "surface" && !w.isDead) {
                const dist = Math.sqrt(Math.pow(w.x - c.x, 2) + Math.pow(w.y - c.y, 2));
                // Aumentei o hitbox para 60px para facilitar o ataque
                if (dist < 60) {
                    const now = Date.now();
                    // COOLDOWN: Formigas só atacam a cada 1 segundo (1000ms)
                    if (now - (w.lastAttackTime || 0) > 1000) {
                        c.takeDamage(w.attackPower, w); // Dano total (sem dividir, pois tem cooldown)
                        w.lastAttackTime = now;
                        
                        // Efeito visual de ataque (pulo leve)
                        w.x += (c.x - w.x) * 0.1;
                        w.y += (c.y - w.y) * 0.1;

                        if (c.isDefeated) {
                            handleCreatureDefeat(c);
                        }
                    }
                }
            }
        });

        // Rainha ataca criatura (se estiver perto)
        const queens = [queen].filter(q => q && !q.isDead);
        queens.forEach(q => {
            const dQ = Math.sqrt(Math.pow(q.x - c.x, 2) + Math.pow(q.y - c.y, 2));
            if (dQ < 60) {
                 const now = Date.now();
                 if (now - (q.lastAttackTime || 0) > 800) {
                    c.takeDamage(q.attackPower, q);
                    q.lastAttackTime = now;
                    if (c.isDefeated) handleCreatureDefeat(c);
                 }
            }
        });

        // Criatura ataca formigas ou as Rainhas
        if (c.type === 'spider' || c.type === 'beetle' || Math.random() < 0.05) { // Aumentei chance de agressividade random
            const now = Date.now();
            if (now - (c.lastAttackTime || 0) > 800) { // Cooldown reduzido para 800ms
                const targets = [...workers, queen];
                let hitAny = false;

                targets.forEach(ant => {
                    if (ant && ant.currentMap === "surface" && !ant.isDead) {
                        const dist = Math.sqrt(Math.pow(ant.x - c.x, 2) + Math.pow(ant.y - c.y, 2));
                        
                        // Alcance de ataque da criatura aumentado para 70px
                        const attackRange = c.type === 'beetle' ? 70 : 60;
                        
                        if (dist < attackRange) {
                            ant.takeDamage(c.attackPower);
                            hitAny = true;
                            
                            if (ant === queen) {
                                console.log("A Rainha está sob ataque!");
                                showQuickAlert("A Rainha está sendo atacada!"); // Alerta visual
                            }
                            
                            // Se NÃO for besouro, ele para no primeiro alvo que atingir
                            if (c.type !== 'beetle') {
                                // Lógica de alvo único (simulada pelo cooldown global)
                            }
                        }
                    }
                });

                if (hitAny) {
                    c.lastAttackTime = now;
                }
            }
        }
    });
}

function handleCreatureDefeat(c) {
    // Pausa o jogo e abre o modal HTML (seguro contra travamentos)
    gamePaused = true;
    pendingDefeatedCreature = c;
    
    const modal = document.getElementById('victory-modal');
    const text = document.getElementById('victory-text');
    if (modal && text) {
        text.innerText = `Você derrotou: ${c.name}!\nEscolha o destino dela:`;
        modal.style.display = 'flex';
    }
}

// Função chamada pelos botões do modal de vitória
window.resolveVictory = function(choice) {
    const c = pendingDefeatedCreature;
    const modal = document.getElementById('victory-modal');
    
    if (!c) { // Segurança caso algo estranho aconteça
        if (modal) modal.style.display = 'none';
        gamePaused = false;
        return;
    }

    if (choice === 'eat') {
        // Virar comida
        creatures = creatures.filter(creature => creature !== c);
        // Ganha 50 folhas (espalhadas como loot)
        for(let i=0; i<50; i++) {
            if (storedLeaves.length < FOOD_CAPACITY) {
                storedLeaves.push({ x: CX + (Math.random()-0.5)*100, y: CY + (Math.random()-0.5)*100 });
            }
        }
        showQuickAlert("Criatura processada! +50 Comida.");
    } else if (choice === 'tame') {
        if (!chambers.domestication) {
            alert("Você precisa da Câmara de Domesticação para isso! A criatura fugiu."); // Esse alert é ok pois o jogo já está pausado
            creatures = creatures.filter(creature => creature !== c);
        } else {
            // Domar
            c.isTamed = true;
            c.isDefeated = false;
            c.hp = c.maxHp;
            c.color = '#ffd700'; // Dourado
            c.name = "Aliado: " + c.name;
            showQuickAlert("Criatura domesticada com sucesso!");
        }
    }

    // Limpeza
    pendingDefeatedCreature = null;
    if (modal) modal.style.display = 'none';
    gamePaused = false;
    saveGame();
};

function updateWorkersAI() {
    workers.forEach(w => {
        if (w.task === 'idle') { 
            // IA DE FEROMÔNIO: Seguir trilha se houver uma por perto
            if (currentScene === "surface") {
                const nearbyPheromone = pheromones.find(p => {
                    const d = Math.sqrt(Math.pow(w.x - p.x, 2) + Math.pow(w.y - p.y, 2));
                    return d < 200; // Raio de detecção do olfato
                });

                if (nearbyPheromone) {
                    w.targetX = nearbyPheromone.x + (Math.random()-0.5)*20;
                    w.targetY = nearbyPheromone.y + (Math.random()-0.5)*20;
                    
                    // Se chegar no feromônio, tenta achar comida perto dele
                    const dToP = Math.sqrt(Math.pow(w.x - nearbyPheromone.x, 2) + Math.pow(w.y - nearbyPheromone.y, 2));
                    if (dToP < 30) {
                        const foodNear = leaves.find(l => Math.sqrt(Math.pow(l.x - w.x, 2) + Math.pow(l.y - w.y, 2)) < 150);
                        if (foodNear) {
                            w.task = 'food'; // Começa a trabalhar automaticamente!
                            w.targetLeaf = foodNear;
                        }
                    }
                } else {
                    w.targetX = CX; w.targetY = CY; // Volta pra base se não sentir nada
                }
            } else {
                w.targetX = CX; w.targetY = CY;
            }
        }
        else if (w.task === 'food') {
            const distB = Math.sqrt(Math.pow(w.x - CX, 2) + Math.pow(w.y - CY, 2));
            if (!w.hasFood && !w.hasSeed) { 
                if (storedLeaves.length >= FOOD_CAPACITY) {
                    w.targetX = CX; w.targetY = CY; 
                    w.targetLeaf = null; w.targetSeed = null;
                } else if (w.currentMap === "underground") { 
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "surface"; w.x = CX; w.y = CY; } 
                    w.targetLeaf = null; w.targetSeed = null;
                } else { 
                    // IA Decisória: Folha Gigante, Semente ou Folha Comum
                    if (!w.targetSeed && !w.targetLeaf && !w.targetBigLeaf) {
                        // 1. Procurar Folha Gigante Primeiro (Prioridade Alta)
                        let nearestBig = null;
                        let minBigDist = 1000;
                        bigLeaves.forEach(bl => {
                            if (bl.carriers.length < 5) {
                                const d = Math.sqrt(Math.pow(w.x - bl.x, 2) + Math.pow(w.y - bl.y, 2));
                                if (d < minBigDist) { minBigDist = d; nearestBig = bl; }
                            }
                        });
                        
                        if (nearestBig) {
                            w.targetBigLeaf = nearestBig;
                        } else {
                            // 2. Tentar achar semente APENAS se estiver num raio de 1500px
                            let nearestSeed = null;
                            let minSeedDist = 1500; 
                            
                            seeds.forEach(s => {
                                if (s.carriers.length < 2) {
                                    const d = Math.sqrt(Math.pow(w.x - s.x, 2) + Math.pow(w.y - s.y, 2));
                                    if (d < minSeedDist) {
                                        minSeedDist = d;
                                        nearestSeed = s;
                                    }
                                }
                            });

                            if (nearestSeed) {
                                w.targetSeed = nearestSeed;
                            } else if (leaves.length > 0) {
                                // 3. Se não tem semente nem big leaf, busca a folha mais próxima
                                let nearestLeaf = null;
                                let minLeafDist = Infinity;
                                leaves.forEach(l => {
                                    const d = Math.sqrt(Math.pow(w.x - l.x, 2) + Math.pow(w.y - l.y, 2));
                                    if (d < minLeafDist) { minLeafDist = d; nearestLeaf = l; }
                                });
                                w.targetLeaf = nearestLeaf; 
                            }
                        }
                    }

                    if (w.targetBigLeaf) {
                        const idx = bigLeaves.indexOf(w.targetBigLeaf);
                        if (idx === -1) { w.targetBigLeaf = null; }
                        else {
                            w.targetX = w.targetBigLeaf.x; w.targetY = w.targetBigLeaf.y;
                            const dToBL = Math.sqrt(Math.pow(w.x - w.targetBigLeaf.x, 2) + Math.pow(w.y - w.targetBigLeaf.y, 2));
                            if (dToBL < 30) {
                                if (!w.targetBigLeaf.carriers.includes(w)) w.targetBigLeaf.carriers.push(w);
                                if (w.targetBigLeaf.carriers.length === 5) {
                                    w.hasBigLeaf = true;
                                    w.targetBigLeaf.carriers.forEach(c => { c.hasBigLeaf = true; });
                                } else {
                                    w.isMoving = false; return;
                                }
                            }
                        }
                    } else if (w.targetSeed) {
                        const seedIndex = seeds.indexOf(w.targetSeed);
                        if (seedIndex === -1) { w.targetSeed = null; }
                        else {
                            w.targetX = w.targetSeed.x; w.targetY = w.targetSeed.y;
                            const dToS = Math.sqrt(Math.pow(w.x - w.targetSeed.x, 2) + Math.pow(w.y - w.targetSeed.y, 2));
                            if (dToS < 20) {
                                if (!w.targetSeed.carriers.includes(w)) {
                                    w.targetSeed.carriers.push(w);
                                }
                                if (w.targetSeed.carriers.length === 2) {
                                    w.hasSeed = true;
                                    w.targetSeed.carriers.forEach(c => { c.hasSeed = true; c.isMovingWithSeed = true; });
                                } else {
                                    // Espera o parceiro
                                    w.isMoving = false;
                                    return; // Não atualiza movimento enquanto espera
                                }
                            }
                        }
                    } else if (w.targetLeaf) {
                        const targetLeafIndex = leaves.indexOf(w.targetLeaf);
                        if (targetLeafIndex === -1) {
                            w.targetLeaf = null; 
                            w.targetX = CX; w.targetY = CY; 
                        } else {
                            w.targetX = w.targetLeaf.x;
                            w.targetY = w.targetLeaf.y;
                            const distToTargetLeaf = Math.sqrt(Math.pow(w.x - w.targetLeaf.x, 2) + Math.pow(w.y - w.targetLeaf.y, 2));
                            if (distToTargetLeaf < 20) { 
                                if (w.type === 'soldier') {
                                    w.targetLeaf = null;
                                    w.targetX = CX; w.targetY = CY;
                                } else {
                                    w.hasFood = true; 
                                    leaves.splice(targetLeafIndex, 1); 
                                    w.targetLeaf = null; 
                                }
                            }
                        }
                    }
                }
            } else if (w.hasBigLeaf) {
                // Lógica de Retorno com Folha Gigante
                if (w.currentMap === "surface") {
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "underground"; w.x = CX; w.y = CY; }
                } else {
                    const tx = chambers.food ? CX - 400 : CX;
                    w.targetX = tx; w.targetY = CY;
                    if (Math.sqrt(Math.pow(w.x - tx, 2) + Math.pow(w.y - CY, 2)) < 50) {
                        if (w.targetBigLeaf) {
                            const blIdx = bigLeaves.indexOf(w.targetBigLeaf);
                            // RECOMPENSA: 10 Folhas Comuns
                            for (let i = 0; i < 10; i++) {
                                if (storedLeaves.length < FOOD_CAPACITY) {
                                    storedLeaves.push({ x: tx + (Math.random()-0.5)*80, y: CY + (Math.random()-0.5)*80 });
                                }
                            }
                            if (blIdx !== -1) bigLeaves.splice(blIdx, 1);
                            if (w.targetBigLeaf.carriers) {
                                w.targetBigLeaf.carriers.forEach(c => {
                                    c.hasBigLeaf = false; c.targetBigLeaf = null;
                                });
                            }
                            showQuickAlert("Folha de Bananeira processada! +10 Comida.");
                            saveGame();
                        }
                    }
                }
                w.x += Math.cos(w.angle) * (w.speed * -0.6); // Muito pesada, anda devagar
            } else if (w.hasSeed) {
                // Lógica de Retorno com Semente
                if (w.currentMap === "surface") {
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "underground"; w.x = CX; w.y = CY; }
                } else {
                    const tx = chambers.food ? CX - 400 : CX;
                    w.targetX = tx; w.targetY = CY;
                    if (Math.sqrt(Math.pow(w.x - tx, 2) + Math.pow(w.y - CY, 2)) < 50) {
                        // Entrega a semente
                        if (w.targetSeed) {
                            const sIdx = seeds.indexOf(w.targetSeed);
                            
                            // Recompensa alta: 15 fungos E 5 folhas (respeitando limite de 50 fungos)
                            fungusFood = Math.min(50, fungusFood + 15);
                            
                            // Adiciona até 5 folhas ao estoque, respeitando a capacidade
                            for (let i = 0; i < 5; i++) {
                                if (storedLeaves.length < FOOD_CAPACITY) {
                                    storedLeaves.push({ 
                                        x: tx + (Math.random()-0.5)*80, 
                                        y: CY + (Math.random()-0.5)*80 
                                    });
                                }
                            }

                            if (sIdx !== -1) seeds.splice(sIdx, 1);
                            
                            // Libera as duas formigas
                            if (w.targetSeed.carriers) {
                                w.targetSeed.carriers.forEach(c => {
                                    c.hasSeed = false;
                                    c.targetSeed = null;
                                    c.isMovingWithSeed = false;
                                });
                            }
                            saveGame();
                        }
                    }
                }
                // Movimento mais lento ao carregar semente
                w.x += Math.cos(w.angle) * (w.speed * -0.5); // Compensa a velocidade para ser metade
            } else { 
                if (w.currentMap === "surface") {
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "underground"; w.x = CX; w.y = CY; }
                } else {
                    const tx = chambers.food ? CX - 400 : CX;
                    w.targetX = tx; w.targetY = CY;
                    if (Math.sqrt(Math.pow(w.x - tx, 2) + Math.pow(w.y - CY, 2)) < 50) {
                        w.hasFood = false;
                        
                        // Lógica de Estoque Permanente (2:1) com TOGGLE
                        if (chambers.stockpile && isStockpilingEnabled) {
                            foodDeliveryCounter++;
                            if (foodDeliveryCounter >= 2) {
                                // A cada 2 folhas, 1 vai para o estoque permanente
                                stockpiledLeaves.push({ 
                                    x: CX - 400 + (Math.random()-0.5)*150, 
                                    y: CY + 400 + (Math.random()-0.5)*150 
                                });
                                foodDeliveryCounter = 0;
                                showQuickAlert("Uma folha foi enviada para o Estoque Permanente!");
                            } else {
                                if (storedLeaves.length < FOOD_CAPACITY) storedLeaves.push({ x: w.x + (Math.random()-0.5)*80, y: w.y + (Math.random()-0.5)*80 });
                            }
                        } else {
                            if (storedLeaves.length < FOOD_CAPACITY) storedLeaves.push({ x: w.x + (Math.random()-0.5)*80, y: w.y + (Math.random()-0.5)*80 });
                        }
                        
                        saveGame();
                    }
                }
            }
        } else if (w.task === 'guard') {
            // Seguir a Rainha
            const distToQueen = Math.sqrt(Math.pow(w.x - queen.x, 2) + Math.pow(w.y - queen.y, 2));
            
            // Define uma posição de "guarda" ao redor da rainha baseada no ID ou índice da formiga
            const angle = (workers.indexOf(w) / workers.length) * Math.PI * 2;
            const guardRadius = 50 + (workers.indexOf(w) % 3) * 20; // Círculos concêntricos
            
            const gx = queen.x + Math.cos(angle) * guardRadius;
            const gy = queen.y + Math.sin(angle) * guardRadius;

            if (distToQueen > guardRadius + 20) {
                w.targetX = gx;
                w.targetY = gy;
            } else if (distToQueen < guardRadius - 10) {
                // Afastar um pouco se estiver colada na rainha
                w.targetX = gx;
                w.targetY = gy;
            } else {
                // Se estiver perto da posição de guarda, movimenta-se levemente
                if (Math.random() < 0.05) {
                    w.targetX = gx + (Math.random()-0.5)*20;
                    w.targetY = gy + (Math.random()-0.5)*20;
                }
            }

            // Se estiver na superfície, procurar inimigos próximos para atacar automaticamente
            if (currentScene === "surface") {
                const nearestEnemy = creatures.find(c => {
                    if (c.isDead || c.isDefeated || c.isTamed) return false;
                    const d = Math.sqrt(Math.pow(w.x - c.x, 2) + Math.pow(w.y - c.y, 2));
                    return d < 200; // Raio de agressividade da formiga guarda
                });

                if (nearestEnemy) {
                    w.targetX = nearestEnemy.x;
                    w.targetY = nearestEnemy.y;
                }
            }
        } else if (w.task === 'fungus') {
            const distB = Math.sqrt(Math.pow(w.x - CX, 2) + Math.pow(w.y - CY, 2));
            if (!w.hasFood) { 
                if (w.currentMap === "surface") { 
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "underground"; w.x = CX; w.y = CY; }
                } else { 
                    const tx = chambers.food ? CX - 400 : CX; 
                    w.targetX = tx; w.targetY = CY;
                    
                    // Se chegou na câmara de comida
                    if (Math.sqrt(Math.pow(w.x - tx, 2) + Math.pow(w.y - CY, 2)) < 50) {
                        if (storedLeaves.length > 0) {
                            if (w.type !== 'soldier') { // Soldados não trabalham
                                storedLeaves.pop(); 
                                w.hasFood = true;
                                saveGame();
                            }
                        } else {
                            // Se não tem comida, ela espera (fica "idle" visualmente na câmara)
                            w.isMoving = false;
                        }
                    }
                }
            } else { 
                if (w.currentMap === "surface") { 
                    w.targetX = CX; w.targetY = CY;
                    if (distB < 30) { w.currentMap = "underground"; w.x = CX; w.y = CY; }
                } else { 
                    const tx = chambers.fungus ? CX + 800 : CX; 
                    w.targetX = tx; w.targetY = CY;
                    if (Math.sqrt(Math.pow(w.x - tx, 2) + Math.pow(w.y - CY, 2)) < 50) {
                        w.hasFood = false; 
                        // Trava de limite de 50
                        if (fungusFood < 50) {
                            fungusFood += 0.5; // 2 folhas = 1 fungo
                        }
                        saveGame();
                    }
                }
            }
        }
        w.update();
    });
}

// 5. RENDERIZAÇÃO
function drawWorld() {
    globalTime += 0.016; 
    
    ctx.fillStyle = "#0a0a05"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!queen) return;

    // Renderiza a visão do Jogador 1 em tela cheia
    renderView(queen, camera, 0, 0, canvas.width, canvas.height);

    // Overlay global e Vinheta
    const vignette = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100 * zoom,
        canvas.width / 2, canvas.height / 2, canvas.width / 1.2
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderView(targetQueen, targetCamera, vx, vy, vw, vh) {
    ctx.save();
    // Define a área de desenho (clipping)
    ctx.beginPath();
    ctx.rect(vx, vy, vw, vh);
    ctx.clip();

    targetCamera.x += (targetQueen.x - targetCamera.x) * 0.1;
    targetCamera.y += (targetQueen.y - targetCamera.y) * 0.1;

    ctx.translate(vx + vw / 2, vy + vh / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-targetCamera.x, -targetCamera.y);

    if (currentScene === "surface") {
        drawSurface(targetCamera, vw, vh);
        // Sombras simples
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        workers.filter(w => w.currentMap === "surface").forEach(w => {
            ctx.beginPath(); ctx.ellipse(w.x + 2, w.y + 2, w.size, w.size/2, 0, 0, Math.PI*2); ctx.fill();
        });
        workers.filter(w => w.currentMap === "surface").forEach(w => w.draw(ctx));
    } else {
        drawUnderground();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        workers.filter(w => w.currentMap === "underground").forEach(w => {
            ctx.beginPath(); ctx.ellipse(w.x + 2, w.y + 2, w.size, w.size/2, 0, 0, Math.PI*2); ctx.fill();
        });
        workers.filter(w => w.currentMap === "underground").forEach(w => w.draw(ctx));
    }

    // Partículas leves
    particles.forEach(p => {
        ctx.fillStyle = p.color.replace(')', `, ${p.life})`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });

    // Outros Jogadores Online (Sincronizados por Cena)
    otherPlayers.forEach(p => {
        if (p.currentMap === currentScene) {
            p.draw(ctx);
        }
    });

    if (targetQueen.isMoving && controlMode === 'mouse' && targetQueen === queen) {
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2/zoom;
        ctx.strokeRect(targetQueen.targetX-5, targetQueen.targetY-5, 10, 10);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.fillRect(targetQueen.targetX-5, targetQueen.targetY-5, 10, 10);
    }
    targetQueen.draw(ctx);
    ctx.restore();

    // Tooltips e Overlays individuais
    ctx.save();
    ctx.beginPath();
    ctx.rect(vx, vy, vw, vh);
    ctx.clip();
    
    if (hoveredLeaf && currentScene === "surface") drawTooltip(hoveredLeaf, targetCamera, vx, vy, vw, vh);
    if (hoveredSeed && currentScene === "surface") drawTooltip(hoveredSeed, targetCamera, vx, vy, vw, vh);
    if (window.hoveredBigLeaf && currentScene === "surface") drawTooltip(window.hoveredBigLeaf, targetCamera, vx, vy, vw, vh);
    if (window.hoveredDroplet && currentScene === "surface") drawTooltip(window.hoveredDroplet, targetCamera, vx, vy, vw, vh);
    if (hoveredCreature && currentScene === "surface") drawTooltip(hoveredCreature, targetCamera, vx, vy, vw, vh);

    // Overlay de Estação
    if (currentScene === "surface" && seasonOverlayColor) {
        ctx.fillStyle = seasonOverlayColor;
        ctx.fillRect(vx, vy, vw, vh);
    }

    if (nightOverlayAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 50, ${nightOverlayAlpha})`; 
        ctx.fillRect(vx, vy, vw, vh);
    }
    ctx.restore();
}


function drawSurface(targetCamera, vw, vh) {
    const sX = Math.max(0, Math.floor((targetCamera.x - vw/2/zoom)/TILE_SIZE));
    const sY = Math.max(0, Math.floor((targetCamera.y - vh/2/zoom)/TILE_SIZE));
    const eX = Math.min(terrainGrid.length, Math.ceil((targetCamera.x + vw/2/zoom)/TILE_SIZE));
    const eY = Math.min(terrainGrid[0] ? terrainGrid[0].length : 0, Math.ceil((targetCamera.y + vh/2/zoom)/TILE_SIZE));

    for (let x = sX; x < eX; x++) {
        for (let y = sY; y < eY; y++) {
            const t = terrainGrid[x][y];
            let textureToDraw;
            if (t === 'grass') textureToDraw = grassTexture;
            else if (t === 'mud') textureToDraw = mudTexture;
            else textureToDraw = dirtTexture;

            if (textureToDraw.complete && textureToDraw.naturalWidth !== 0) {
                ctx.drawImage(textureToDraw, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
            } else {
                ctx.fillStyle = t === 'grass' ? '#3a5f0b' : (t === 'mud' ? '#2d1b0d' : '#4a2c10');
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
            }

            // --- PELINHOS DE GRAMA INTERATIVOS (DENSIDADE DINÂMICA POR QUALIDADE) ---
            if (t === 'grass' && graphicQuality !== 'ultralow') {
                let bladeCount = 900;
                if (graphicQuality === 'medium') bladeCount = 300;
                else if (graphicQuality === 'low') bladeCount = 50;

                const interactors = [];
                const checkDist = TILE_SIZE + 100;
                
                // Só processa interatores se não estiver no Low
                if (graphicQuality !== 'low') {
                    const potential = (graphicQuality === 'ultra') 
                        ? [queen, ...workers.filter(w => w.currentMap === "surface"), ...creatures, ...leaves, ...seeds]
                        : [queen]; // Médio interage apenas com a rainha

                    potential.forEach(p => {
                        if (p && Math.abs(p.x - (x * TILE_SIZE + TILE_SIZE/2)) < checkDist && 
                                 Math.abs(p.y - (y * TILE_SIZE + TILE_SIZE/2)) < checkDist) {
                            interactors.push(p);
                        }
                    });
                }

                const hasInteractors = interactors.length > 0;
                const colors = ["#4d7a1a", "#3a5f0b", "#5c8a20"];
                const batchSize = Math.ceil(bladeCount / 3);
                
                for(let c=0; c<3; c++) {
                    ctx.strokeStyle = colors[c];
                    ctx.beginPath();
                    for(let i=0; i<batchSize; i++) {
                        const idx = c * batchSize + i;
                        const bx = x * TILE_SIZE + (Math.abs(Math.sin(x * 12.98 + y * 78.23 + idx) * 43758.54) % 1) * TILE_SIZE;
                        const by = y * TILE_SIZE + (Math.abs(Math.cos(x * 12.98 + y * 78.23 + idx) * 43758.54) % 1) * TILE_SIZE;
                        
                        if (bx > targetCamera.x - vw/zoom/1.8 && bx < targetCamera.x + vw/zoom/1.8 &&
                            by > targetCamera.y - vh/zoom/1.8 && by < targetCamera.y + vh/zoom/1.8) {
                            
                            let swayX = Math.sin(globalTime * 1.5 + bx * 0.05) * 3;
                            let swayY = -12;

                            if (hasInteractors) {
                                interactors.forEach(p => {
                                    const dx = bx - p.x; const dy = by - p.y;
                                    const distSq = dx*dx + dy*dy;
                                    const range = (p.size || 15) + 35;
                                    if (distSq < range * range) {
                                        const dist = Math.sqrt(distSq);
                                        const force = (range - dist) / range;
                                        swayX += (dx / (dist || 1)) * (range/1.5) * force;
                                        swayY = -1 + (Math.abs(dy / (dist || 1)) * 4 * force);
                                    }
                                });
                            }
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx + swayX, by + swayY);
                        }
                    }
                    ctx.stroke();
                }
            } else if (t === 'dirt' || t === 'mud') {
                // --- CAMADA DE DETRITOS INTERATIVOS NA TERRA ---
                const debrisCount = 40;
                const interactors = [];
                const checkDist = TILE_SIZE + 50;
                const potential = [queen, ...workers.filter(w => w.currentMap === "surface"), ...creatures];
                potential.forEach(p => {
                    if (p && Math.abs(p.x - (x * TILE_SIZE + TILE_SIZE/2)) < checkDist) interactors.push(p);
                });

                for(let i=0; i<debrisCount; i++) {
                    const idx = i + 500; // Offset para o hash
                    const bx = x * TILE_SIZE + (Math.abs(Math.sin(x * 15.1 + y * 92.7 + idx) * 43758.54) % 1) * TILE_SIZE;
                    const by = y * TILE_SIZE + (Math.abs(Math.cos(x * 15.1 + y * 92.7 + idx) * 43758.54) % 1) * TILE_SIZE;

                    if (bx > targetCamera.x - vw/zoom/1.8 && bx < targetCamera.x + vw/zoom/1.8) {
                        let shiftX = 0;
                        let shiftY = 0;
                        let rotation = (Math.sin(idx) * Math.PI);

                        // Reação ao passo (vibração/deslocamento)
                        interactors.forEach(p => {
                            const dx = bx - p.x; const dy = by - p.y;
                            const distSq = dx*dx + dy*dy;
                            if (distSq < 1600) { // Raio de 40px
                                const force = (40 - Math.sqrt(distSq)) / 40;
                                shiftX += (dx * 0.2) * force;
                                shiftY += (dy * 0.2) * force;
                                rotation += force * 0.5;
                            }
                        });

                        ctx.save();
                        ctx.translate(bx + shiftX, by + shiftY);
                        ctx.rotate(rotation);
                        
                        // Sorteia o tipo de detrito
                        const typeIdx = (idx % 3);
                        if (typeIdx === 0) { // Graveto/Raiz
                            ctx.strokeStyle = "#2a1b0d";
                            ctx.lineWidth = 1.5;
                            ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
                        } else if (typeIdx === 1) { // Pedrinha solta
                            ctx.fillStyle = "#555";
                            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
                        } else { // Fragmento orgânico
                            ctx.fillStyle = "#3d2b1f";
                            ctx.fillRect(-2, -1, 4, 2);
                        }
                        ctx.restore();
                    }
                }
            }
        }
    }
    leaves.forEach(l => {
        if (Math.abs(l.x-targetCamera.x) < vw/zoom) {
            ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.angle);
            
            const lSize = l.size * 1.8; // Folhas maiores (80% de aumento)
            
            // Sombra projetada
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.beginPath(); ctx.ellipse(2, 2, lSize, lSize/1.8, 0, 0, Math.PI*2); ctx.fill();

            // Lâmina da Folha (Verde escuro orgânico)
            const leafGrad = ctx.createLinearGradient(-lSize, 0, lSize, 0);
            leafGrad.addColorStop(0, "#1b3d14");
            leafGrad.addColorStop(0.5, "#2e5a1c");
            leafGrad.addColorStop(1, "#1b3d14");
            ctx.fillStyle = leafGrad;
            
            ctx.beginPath();
            ctx.ellipse(0, 0, lSize, lSize/1.8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Nervuras (Veins)
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1.5;
            ctx.beginPath(); // Nervura central
            ctx.moveTo(-lSize, 0); ctx.lineTo(lSize, 0); ctx.stroke();
            
            ctx.lineWidth = 0.8;
            for(let i=-2; i<=2; i++) {
                if(i===0) continue;
                ctx.beginPath();
                ctx.moveTo(i * (lSize/3), 0);
                ctx.lineTo(i * (lSize/2), lSize/2);
                ctx.moveTo(i * (lSize/3), 0);
                ctx.lineTo(i * (lSize/2), -lSize/2);
                ctx.stroke();
            }

            // Buracos de Mordida (Bite Holes)
            ctx.fillStyle = "#0a0a05"; // Cor do fundo/chão para simular transparência
            const holes = [
                {x: lSize*0.4, y: lSize*0.2, r: lSize*0.15},
                {x: -lSize*0.3, y: -lSize*0.2, r: lSize*0.12},
                {x: lSize*0.6, y: -lSize*0.1, r: lSize*0.08}
            ];
            holes.forEach(h => {
                ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.fill();
            });

            ctx.restore();
        }
    });

    // --- DESENHAR FOLHAS DE BANANEIRA GIGANTES ---
    bigLeaves.forEach(bl => {
        if (Math.abs(bl.x - targetCamera.x) < vw / zoom) {
            ctx.save();
            ctx.translate(bl.x, bl.y);
            ctx.rotate(bl.angle);

            // Sombra
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath(); ctx.ellipse(5, 5, bl.width/2, bl.height/2, 0, 0, Math.PI*2); ctx.fill();

            // Lâmina (Verde Bananeira)
            const blGrad = ctx.createLinearGradient(-bl.width/2, 0, bl.width/2, 0);
            blGrad.addColorStop(0, "#228b22");
            blGrad.addColorStop(0.5, "#32cd32");
            blGrad.addColorStop(1, "#228b22");
            ctx.fillStyle = blGrad;
            
            ctx.beginPath();
            ctx.ellipse(0, 0, bl.width/2, bl.height/2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Nervura Central Forte
            ctx.strokeStyle = "#1a4d1a";
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(-bl.width/2, 0); ctx.lineTo(bl.width/2, 0); ctx.stroke();

            // Nervuras Paralelas (Estilo Bananeira)
            ctx.lineWidth = 0.5;
            for(let i = -bl.width/2; i < bl.width/2; i += 10) {
                ctx.beginPath();
                ctx.moveTo(i, 0); ctx.lineTo(i + 5, bl.height/2);
                ctx.moveTo(i, 0); ctx.lineTo(i + 5, -bl.height/2);
                ctx.stroke();
            }

            ctx.restore();

            // Contador de Carregadores
            if (bl.carriers.length > 0) {
                ctx.fillStyle = "white";
                ctx.font = "bold 12px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`Transporte: ${bl.carriers.length}/5`, bl.x, bl.y - bl.height);
            }
        }
    });

    seeds.forEach(s => {
        const margin = 150;
        if (s.x > targetCamera.x - (vw/2/zoom) - margin && 
            s.x < targetCamera.x + (vw/2/zoom) + margin &&
            s.y > targetCamera.y - (vh/2/zoom) - margin && 
            s.y < targetCamera.y + (vh/2/zoom) + margin) {
            
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
            
            const sSize = s.size * 2.2; 
            
            // 1. SOMBRA REALISTA
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.arc(4, 4, sSize, 0, Math.PI * 2); ctx.fill();

            // 2. CORPO DA SEMENTE (Gradiente de Casca)
            const sGrad = ctx.createRadialGradient(-sSize/3, -sSize/3, 0, 0, 0, sSize);
            sGrad.addColorStop(0, "#d2a679"); 
            sGrad.addColorStop(0.6, "#8b4513"); 
            sGrad.addColorStop(1, "#3d1f00"); 
            ctx.fillStyle = sGrad;
            
            // Formato irregular
            ctx.beginPath();
            ctx.moveTo(sSize, 0);
            for(let a=0; a<Math.PI*2; a+=0.5) {
                const r = sSize + (Math.sin(a*3 + s.x) * 2); 
                ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            ctx.closePath();
            ctx.fill();

            // 3. TEXTURA DE CASCA
            ctx.strokeStyle = "rgba(0,0,0,0.2)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for(let i=-2; i<=2; i++) {
                ctx.moveTo(-sSize, i*2);
                ctx.quadraticCurveTo(0, i*sSize*0.8, sSize, i*2);
            }
            ctx.stroke();

            // 4. BRILHO ESPECULAR
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.ellipse(-sSize*0.4, -sSize*0.4, sSize*0.3, sSize*0.2, Math.PI/4, 0, Math.PI*2);
            ctx.fill();
            
            ctx.restore();
        }
    });

    // Desenhar Gotas D'água
    mapDroplets.forEach(d => {
        if (Math.abs(d.x - targetCamera.x) < vw / zoom) {
             ctx.save(); ctx.translate(d.x, d.y);
             
             // Efeito de brilho azulado
             const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, d.size);
             gradient.addColorStop(0, "white");
             gradient.addColorStop(1, "#00bfff");
             
             ctx.fillStyle = gradient;
             ctx.shadowColor = "#00bfff";
             ctx.shadowBlur = 10;
             
             // Forma de gota
             ctx.beginPath();
             ctx.arc(0, 0, d.size, 0, Math.PI * 2);
             ctx.fill();
             ctx.shadowBlur = 0;
             ctx.restore();
        }
    });

    // Desenhar Feromônios
    if (currentScene === "surface") {
        pheromones.forEach(p => {
            const alpha = Math.min(0.3, p.life / 45); // Desaparece visualmente
            ctx.fillStyle = `rgba(147, 112, 219, ${alpha})`; // Roxo suave
            ctx.beginPath();
            ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
            ctx.fill();
            
            // Núcleo um pouco mais forte
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Desenhar Criaturas
    creatures.forEach(c => {
        if (Math.abs(c.x-targetCamera.x) < vw/zoom) {
            c.draw(ctx);
        }
    });

    ctx.fillStyle = '#1a0f00'; ctx.beginPath(); ctx.ellipse(CX, CY, 60, 40, 0, 0, Math.PI * 2); ctx.fill();
}

function drawUnderground() {
    ctx.fillStyle = '#050300'; ctx.fillRect(CX-1200, CY-1200, 2400, 2400);
    
    // Padrão de solo para as câmaras
    const drawChamber = (x, y, radius, label, glowColor = null) => {
        ctx.save();
        // Sombra externa profunda
        ctx.shadowBlur = 30;
        ctx.shadowColor = "black";
        
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        
        // Textura de Terra Realista
        if (dirtTexture.complete) {
            ctx.drawImage(dirtTexture, x - radius, y - radius, radius * 2, radius * 2);
        } else {
            ctx.fillStyle = '#2d1b0d'; ctx.fill();
        }
        
        // Sombras de borda (Cave depth)
        const edgeGrad = ctx.createRadialGradient(x, y, radius * 0.7, x, y, radius);
        edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
        edgeGrad.addColorStop(1, "rgba(0,0,0,0.8)");
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

        // Brilho Bioluminescente (se houver)
        if (glowColor) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, glowColor);
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = glow;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            ctx.globalCompositeOperation = "source-over";
        }

        // --- RAÍZES PENDURADAS (DETALHE ULTRA) ---
        ctx.strokeStyle = "rgba(60, 40, 20, 0.6)";
        ctx.lineWidth = 1.5;
        const seed = x + y;
        for(let r=0; r<15; r++) {
            let rx = x + (Math.sin(seed + r) * radius * 0.8);
            let ry = y - radius;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.quadraticCurveTo(rx + 10, ry + 30, rx, ry + 20 + Math.abs(Math.sin(r)*40));
            ctx.stroke();
        }

        ctx.restore();

        if (label) {
            ctx.fillStyle = "rgba(255,255,255,0.7)"; 
            ctx.font = "bold 16px 'Segoe UI', Arial"; 
            ctx.textAlign="center"; 
            ctx.fillText(label, x, y - radius - 15);
        }
    };

    // Túneis com textura
    ctx.lineCap = 'round';
    const drawTunnel = (x1, y1, x2, y2) => {
        ctx.save();
        ctx.strokeStyle = '#1a0d00';
        ctx.lineWidth = 70;
        ctx.shadowBlur = 15; ctx.shadowColor = "black";
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 60;
        ctx.setLineDash([5, 15]);
        ctx.stroke();
        ctx.restore();
    };
    
    if (chambers.eggs) drawTunnel(CX, CY, CX+400, CY);
    if (chambers.food) drawTunnel(CX, CY, CX-400, CY);
    if (chambers.fungus) drawTunnel(CX, CY, CX+800, CY);
    if (chambers.domestication) drawTunnel(CX, CY, CX, CY+400);
    if (chambers.stockpile) drawTunnel(CX, CY+400, CX-400, CY+400);

    // Câmaras individuais com efeitos únicos
    drawChamber(CX, CY, INITIAL_CHAMBER_RADIUS); // Centro
    
    if (chambers.eggs) drawChamber(CX + 400, CY, 150, "BERÇÁRIO", "rgba(255,255,200,0.1)");
    if (chambers.food) drawChamber(CX - 400, CY, 150, "DEPÓSITO");
    if (chambers.fungus) drawChamber(CX + 800, CY, 150, "CULTIVO DE FUNGOS", "rgba(139, 69, 19, 0.2)");
    if (chambers.domestication) drawChamber(CX, CY+400, 150, "DOMESTICAÇÃO", "rgba(0, 255, 255, 0.05)");
    if (chambers.stockpile) drawChamber(CX - 400, CY + 400, 150, "ESTOQUE PERMANENTE");

    // LUZ DE ENTRADA (VOLUMÉTRICA)
    const entranceGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 120);
    entranceGlow.addColorStop(0, "rgba(255, 255, 200, 0.4)");
    entranceGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = entranceGlow;
    ctx.beginPath(); ctx.arc(CX, CY, 120, 0, Math.PI*2); ctx.fill();

    // Itens e Entidades no subterrâneo
    if (chambers.eggs) {
        eggs.forEach(egg => {
            ctx.fillStyle = egg.isHatching ? '#ffffcc' : '#fffaf0';
            ctx.beginPath(); ctx.ellipse(egg.x, egg.y, 8, 12, 0, 0, Math.PI*2); ctx.fill();
        });
    }
    if (chambers.food) {
        ctx.fillStyle = '#2e8b57';
        storedLeaves.forEach(leaf => { ctx.beginPath(); ctx.ellipse(leaf.x, leaf.y, 8, 4, 0, 0, Math.PI*2); ctx.fill(); });
    }
    if (chambers.fungus) { 
        ctx.fillStyle = '#8B4513'; 
        for (let i = 0; i < Math.floor(fungusFood); i++) {
            const angle = i * 0.5; const dist = (i * 5) % 120;
            ctx.beginPath(); ctx.arc(CX + 800 + Math.cos(angle) * dist, CY + Math.sin(angle) * dist, 6, 0, Math.PI * 2); ctx.fill();
        }
    }
    if (chambers.stockpile) {
        ctx.fillStyle = '#1e5d3b';
        stockpiledLeaves.forEach(leaf => { ctx.beginPath(); ctx.ellipse(leaf.x, leaf.y, 8, 4, 0, 0, Math.PI*2); ctx.fill(); });
    }

    // Ícone de Saída
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(CX, CY, 40, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "white"; ctx.font = "bold 12px Arial"; ctx.fillText("SAIR", CX, CY + 45);
}

// 6. EVENTOS E AUXILIARES
function drawTooltip(item, targetCamera, vx, vy, vw, vh) {
    if (!item) return;
    const screenX = (item.x - targetCamera.x) * zoom + vx + vw / 2;
    const screenY = (item.y - targetCamera.y) * zoom + vy + vh / 2;
    
    // Verifica se o item está dentro da área de visualização atual
    if (screenX < vx || screenX > vx + vw || screenY < vy || screenY > vy + vh) return;

    const tooltipWidth = 180;
    const tooltipHeight = 50;
    const offsetX = 20; 
    const offsetY = -30; 
    let tooltipX = screenX + offsetX;
    let tooltipY = screenY + offsetY;
    
    if (tooltipX + tooltipWidth > vx + vw) tooltipX = vx + vw - tooltipWidth;
    if (tooltipY + tooltipHeight > vy + vh) tooltipY = vy + vh - tooltipHeight;
    if (tooltipX < vx) tooltipX = vx;
    if (tooltipY < vy) tooltipY = vy;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(item.name, tooltipX + 5, tooltipY + 15);
    ctx.font = '10px Arial';
    ctx.fillText(item.description || "Um recurso natural.", tooltipX + 5, tooltipY + 30);
    
    if (item.carriers && item.carriers.length > 0) {
        ctx.fillStyle = '#ffa500';
        ctx.fillText(`Carregadores: ${item.carriers.length}/${item.name.includes('Semente') ? 2 : 5}`, tooltipX + 5, tooltipY + 45);
    }

    // Se for uma criatura, mostra a vida
    if (item.hp !== undefined && item.maxHp !== undefined) {
         ctx.fillStyle = item.hp < item.maxHp * 0.3 ? '#ff4444' : '#00ff00';
         ctx.fillText(`Vida: ${Math.floor(item.hp)}/${item.maxHp}`, tooltipX + 5, tooltipY + 45);
    }
}

function updateDayNightEffect() {
    let currentTotalHours = gameHour + dayProgress * HOURS_PER_DAY % 1; 

    if (currentTotalHours >= 6 && currentTotalHours < 18) { 
        nightOverlayAlpha = 0;
    } else if (currentTotalHours >= 18 && currentTotalHours < 21) { 
        nightOverlayAlpha = (currentTotalHours - 18) / 3 * 0.5;
    } else if (currentTotalHours >= 21 || currentTotalHours < 3) { 
        nightOverlayAlpha = 0.5;
    } else { 
        nightOverlayAlpha = 0.5 - ((currentTotalHours - 3) / 3 * 0.5);
    }
    
    if (nightOverlayAlpha < 0) nightOverlayAlpha = 0;
    if (nightOverlayAlpha > 0.5) nightOverlayAlpha = 0.5;
}

function updatePheromones() {
    // 1. Evaporação (Decaimento)
    for (let i = pheromones.length - 1; i >= 0; i--) {
        pheromones[i].life -= 1/60;
        if (pheromones[i].life <= 0) pheromones.splice(i, 1);
    }

    // 2. Deposição pela Rainha
    if (isMarkingMode && queen && queen.isMoving && currentScene === "surface") {
        // Solta uma nuvem a cada ~10 pixels de distância para não sobrecarregar
        const lastP = pheromones[pheromones.length - 1];
        const dist = lastP ? Math.sqrt(Math.pow(queen.x - lastP.x, 2) + Math.pow(queen.y - lastP.y, 2)) : 999;
        
        if (dist > 30) {
            pheromones.push({
                x: queen.x,
                y: queen.y,
                life: 45, // Dura 45 segundos
                type: 'command' 
            });
        }
    }
}

function updateHunger() {
    if (gamePaused) return;

    // 1. FOME DA RAINHA
    queenHunger -= (1 / 60) * 0.3;
    if (queenHunger < 0) {
        queenHunger = 0;
        queen.takeDamage(0.05); 
    }

    // Atualizar Barras na UI
    const hungerBar = document.getElementById('queen-hunger-bar');
    const hpBar = document.getElementById('queen-hp-bar');
    if (hungerBar) hungerBar.style.width = `${queenHunger}%`;
    if (hpBar && queen) hpBar.style.width = `${(queen.hp / queen.maxHp) * 100}%`;

    // 2. FOME DAS FORMIGAS (Individual)
    workers.forEach(w => {
        if (w.isDead) return;

        // Fome cai constantemente (mais rápido para soldados, mais devagar para exploradoras)
        let hungerDropRate = 0.2;
        if (w.type === 'soldier') hungerDropRate = 0.3;
        else if (w.type === 'scout') hungerDropRate = 0.15;

        w.hunger -= (1 / 60) * hungerDropRate;

        // Lógica de Alimentação Automática
        if (w.hunger < 50) { // Se estiver com 50% de fome
            // Se estiver perto do estoque (Câmara de Comida ou Entrada)
            const distToFood = Math.sqrt(Math.pow(w.x - (CX - 400), 2) + Math.pow(w.y - CY, 2));
            const distToEntrance = Math.sqrt(Math.pow(w.x - CX, 2) + Math.pow(w.y - CY, 2));

            if ((distToFood < 150 || distToEntrance < 100) && w.currentMap === "underground") {
                if (storedLeaves.length > 0) {
                    storedLeaves.pop();
                    w.hunger = 100; // Enche o bucho
                    w.hp = Math.min(w.maxHp, w.hp + 5); // Comer também cura um pouco
                } else if (stockpiledLeaves.length > 0) {
                    stockpiledLeaves.pop();
                    w.hunger = 100;
                    w.hp = Math.min(w.maxHp, w.hp + 5);
                }
            }
        }

        // Dano por inanição
        if (w.hunger <= 0) {
            w.hunger = 0;
            w.takeDamage(0.1); // Perde vida gradualmente
            if (Math.random() < 0.01) showQuickAlert("Uma formiga está morrendo de fome!");
        }
    });
}

window.feedQueen = function(q) {
    if (!q) return;
    const isP2 = q === queen2;
    let currentHunger = isP2 ? queen2Hunger : queenHunger;

    if (storedLeaves.length > 0 || stockpiledLeaves.length > 0) {
        if (currentHunger >= 95) {
            showQuickAlert(`A Rainha ${isP2 ? '2' : '1'} já está satisfeita.`);
            return;
        }

        if (storedLeaves.length > 0) storedLeaves.pop();
        else stockpiledLeaves.pop();

        if (isP2) queen2Hunger = Math.min(100, queen2Hunger + 30);
        else queenHunger = Math.min(100, queenHunger + 30);
        
        q.hp = Math.min(q.maxHp, q.hp + 10);
        showQuickAlert(`A Rainha ${isP2 ? '2' : '1'} comeu uma folha deliciosa!`);
        saveGame();
    } else {
        showQuickAlert("Não há comida no estoque!");
    }
}

function updateResources() {
    if (currentScene !== "surface") return;
    
    const season = SEASONS[currentSeasonIndex];
    let leafRate = 0;
    let creatureRate = 0;
    let dropletRate = 0;
    
    // 1. REPOSIÇÃO DINÂMICA (Perlin Noise)
    // Se houver poucas folhas gigantes ou gotas, o mapa "gera" novas organicamente
    if (bigLeaves.length < 5 || mapDroplets.length < 2 || leaves.length < 800 || seeds.length < 15) {
        // Tenta encontrar um local rico via Perlin Noise
        const rx = Math.random() * WORLD_SIZE;
        const ry = Math.random() * WORLD_SIZE;
        const dist = Math.sqrt(Math.pow(rx - CX, 2) + Math.pow(ry - CY, 2));
        
        if (dist > 1000) { // Comuns podem nascer mais perto que as raras
            const fertility = (window.perlin.noise(rx * 0.002, ry * 0.002) + 1) / 2;
            
            // LOGICA PARA ITENS COMUNS (Taxa de spawn alta)
            if (fertility > 0.4) { 
                if (leaves.length < 1000 && Math.random() < 0.2) { // 20% de chance por tentativa
                    leaves.push({
                        x: rx, y: ry, size: 6 + Math.random() * 4, angle: Math.random() * Math.PI,
                        name: "Folha Fresca", description: "Recurso básico."
                    });
                }
                if (seeds.length < 30 && Math.random() < 0.05) {
                    seeds.push({
                        x: rx, y: ry, size: 20, angle: Math.random() * Math.PI,
                        name: "Semente Selvagem", description: "Rende 15 fungos.", carriers: []
                    });
                }
            }

            // LOGICA PARA ITENS RAROS
            if (fertility > 0.7) { 
                if (bigLeaves.length < 10 && Math.random() < 0.01) {
                    bigLeaves.push({
                        x: rx, y: ry, width: 120, height: 40, angle: Math.random() * Math.PI,
                        carriers: [], name: "Folha de Bananeira Gigante", description: "Rende 10 folhas."
                    });
                }
                if (mapDroplets.length < 3 && Math.random() < 0.005) {
                    mapDroplets.push({
                        x: rx, y: ry, size: 15, name: "Gota D'água Pura", description: "Item Raríssimo!"
                    });
                }
            }
        }
    }

    // Configurações da Estação (Lógica original mantida)
    switch(season) {
        case "Primavera":
            seasonOverlayColor = null;
            leafRate = 0.5; // Nascem rápido
            creatureRate = 0.05;
            dropletRate = 0.01;
            break;
        case "Verão":
            seasonOverlayColor = "rgba(255, 200, 0, 0.1)"; // Tom quente
            leafRate = 0.2;
            creatureRate = 0.15; // Mais inimigos
            dropletRate = 0.005;
            break;
        case "Outono":
            seasonOverlayColor = "rgba(139, 69, 19, 0.15)"; // Tom sépia
            leafRate = 0.8; // Muitas folhas caindo
            creatureRate = 0.05;
            dropletRate = 0.01;
            break;
        case "Inverno":
            seasonOverlayColor = "rgba(255, 255, 255, 0.3)"; // Neve
            leafRate = 0.0; // Nada nasce!
            creatureRate = 0.02; // Poucos bichos (mas perigosos: Aranhas Brancas)
            dropletRate = 0.0;
            break;
        case "Estação das Monções":
            seasonOverlayColor = "rgba(0, 0, 100, 0.3)"; // Chuva escura
            leafRate = 0.4;
            creatureRate = 0.08;
            dropletRate = 0.0; // CORREÇÃO: Não gera gotas raras (elas são únicas)
            break;
    }

    // Spawn de Folhas
    leafSpawnTimer += leafRate;
    if (leafSpawnTimer >= 60) { // A cada ~1 segundo (60 frames) se taxa for 1.0
        if (leaves.length < 500) { // Limite global
            leaves.push({
                x: Math.random() * WORLD_SIZE,
                y: Math.random() * WORLD_SIZE,
                size: 6 + Math.random() * 4,
                angle: Math.random() * Math.PI,
                name: season === "Outono" ? "Folha Seca" : "Folha Fresca",
                description: season === "Outono" ? "Uma folha seca caída." : "Recurso básico."
            });
        }
        leafSpawnTimer = 0;
    }

    // Spawn de Criaturas
    creatureSpawnTimer += creatureRate;
    if (creatureSpawnTimer >= 100) {
        if (creatures.length < 50) {
            let rx = Math.random() * WORLD_SIZE;
            let ry = Math.random() * WORLD_SIZE;
            // Distância segura da base
            if (Math.sqrt(Math.pow(rx-CX,2) + Math.pow(ry-CY,2)) > 1500) {
                const types = ['beetle', 'spider', 'ladybug'];
                let type = types[Math.floor(Math.random() * types.length)];
                
                // Mobs Especiais de Estação
                let creature = new Creature(rx, ry, type);
                
                if (season === "Inverno") {
                     creature = new Creature(rx, ry, 'spider');
                     creature.color = "#eee"; // Aranha das Neves
                     creature.name = "Aranha das Neves";
                     creature.hp = 250; // Mais forte
                } else if (season === "Estação das Monções") {
                     creature = new Creature(rx, ry, 'beetle');
                     creature.color = "#004400"; // Besouro do Pântano
                     creature.name = "Besouro do Pântano";
                }
                
                creatures.push(creature);
            }
        }
        creatureSpawnTimer = 0;
    }
    
    // Spawn de Gotas
    dropletSpawnTimer += dropletRate;
    if (dropletSpawnTimer >= 200) {
        if (mapDroplets.length < 10) {
            let rx = Math.random() * WORLD_SIZE;
            let ry = Math.random() * WORLD_SIZE;
             mapDroplets.push({
                x: rx, y: ry, size: 15,
                name: "Gota D'água",
                description: "Água da chuva."
            });
        }
        dropletSpawnTimer = 0;
    }
}

function updateGameTimeDisplay() {
    const gameYearElement = document.getElementById('game-year');
    const gameSeasonElement = document.getElementById('game-season');
    const gameDayElement = document.getElementById('game-day');
    const gameHourElement = document.getElementById('game-hour'); 

    if (gameYearElement) gameYearElement.innerText = gameYear;
    if (gameSeasonElement) gameSeasonElement.innerText = SEASONS[currentSeasonIndex];
    if (gameDayElement) gameDayElement.innerText = gameDay;
    if (gameHourElement) {
        const formattedHour = String(gameHour).padStart(2, '0');
        gameHourElement.innerText = formattedHour + ":00"; 
    }
}

function gameLoop() {
    if (!gamePaused) {
        // CLIENTES: Apenas o Host processa o tempo e os recursos
        if (window.multiplayerIsHost()) {
            dayProgress += (1 / 60) / DAY_LENGTH_SECONDS; 
            gameHour = Math.floor(dayProgress * HOURS_PER_DAY); 

            if (dayProgress >= 1.0) {
                dayProgress = 0.0;
                gameDay++;
                gameHour = 6; 
                
                currentSeasonIndex = Math.floor((gameDay - 1) / 6);
                if (currentSeasonIndex > 4) currentSeasonIndex = 4;

                if (gameDay > 30) { 
                    gameDay = 1;
                    gameYear++;
                    currentSeasonIndex = 0;
                }
            }

            updateEggs(); updateWorkersAI(); 
            updateResources(); // DINÂMICA DE ESTAÇÕES
            updateHunger(); // SISTEMA DE FOME
        }

        updateStatsUI(); // Atualiza o relatório se estiver aberto
        updatePheromones(); // SISTEMA DE FEROMÔNIOS
        updateParticles(); // SISTEMA DE PARTÍCULAS
        updateUISentinels(); // SISTEMA DE SENTINELAS DE UI
        
        // Remover formigas mortas da lista (Host decide)
        if (window.multiplayerIsHost()) {
            workers = workers.filter(w => !w.isDead);
        }

        // Atualizar posição das folhas gigantes sendo carregadas
        bigLeaves.forEach(bl => {
            if (bl.carriers && bl.carriers.length === 5) {
                let avgX = 0, avgY = 0;
                bl.carriers.forEach(c => { avgX += c.x; avgY += c.y; });
                bl.x = avgX / 5;
                bl.y = avgY / 5;
            }
        });

        // Atualizar posição das sementes sendo carregadas
        seeds.forEach(s => {
            if (s.carriers && s.carriers.length === 2) {
                s.x = (s.carriers[0].x + s.carriers[1].x) / 2;
                s.y = (s.carriers[0].y + s.carriers[1].y) / 2;
            }
        });

        if (currentScene === "surface") {
            const potentialTargets = [queen, ...workers.filter(w => w.currentMap === "surface")];
            
            // Multiplicador de agressividade noturna
            const nightMultiplier = nightOverlayAlpha > 0.3 ? 2.0 : 1.0;
            
            creatures.forEach(c => {
                if (window.multiplayerIsHost()) {
                    const originalRange = c.detectionRange;
                    c.detectionRange *= nightMultiplier;
                    c.update(potentialTargets);
                    c.detectionRange = originalRange;
                }
            });

            if (window.multiplayerIsHost()) {
                updateCombat();
                checkProximityAlerts();
            }
        }
        if (queen) { 
            queen.update();
            if (window.multiplayerIsHost()) {
                updateQueenLogic(queen);
            }
            if (controlMode !== 'mouse') handleWASD();
        }
        for (const playerAnt of otherPlayers.values()) {
            playerAnt.update();
        }
        updateDayNightEffect(); 
        updateGameTimeDisplay(); 
    }
    drawWorld();
    synchronize_multiplayer();
    requestAnimationFrame(gameLoop);
}

function handleWASD() {
    if (gamePaused || !queen) return;
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1; if (keys.s) dy += 1; if (keys.a) dx -= 1; if (keys.d) dx += 1;
    if (dx !== 0 || dy !== 0) {
        queen.targetX = queen.x + dx * 100;
        queen.targetY = queen.y + dy * 100;
        queen.isMoving = true;
    }
}

canvas.addEventListener('mousedown', (e) => {
    if (gamePaused || !queen) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    if (currentScene === "underground" && pos.x >= CX-50 && pos.x <= CX+50 && pos.y >= CY-240 && pos.y <= CY-180) { openStats(); return; }
    
    // Troca de Cena
    const distH = Math.sqrt(Math.pow(pos.x - CX, 2) + Math.pow(pos.y - CY, 2));
    if (distH < 60) {
        const distQ = Math.sqrt(Math.pow(queen.x - CX, 2) + Math.pow(queen.y - CY, 2));
        if (distQ < 150) switchScene(currentScene === "surface" ? "underground" : "surface");
        return;
    }
    if (controlMode === 'mouse') { isMouseDown = true; queen.targetX = pos.x; queen.targetY = pos.y; }
});

canvas.addEventListener('mousemove', (e) => {
    const pos = screenToWorld(e.clientX, e.clientY);
    if (currentScene === "surface") {
        const foundLeaf = leaves.find(l => Math.sqrt(Math.pow(pos.x-l.x,2)+Math.pow(pos.y-l.y,2)) < 30);
        if (foundLeaf !== hoveredLeaf) { hoveredLeaf = foundLeaf; }
        
        const foundSeed = seeds.find(s => Math.sqrt(Math.pow(pos.x-s.x,2)+Math.pow(pos.y-s.y,2)) < 30);
        if (foundSeed !== hoveredSeed) { hoveredSeed = foundSeed; }

        const foundBigLeaf = bigLeaves.find(bl => Math.sqrt(Math.pow(pos.x-bl.x,2)+Math.pow(pos.y-bl.y,2)) < 40);
        if (foundBigLeaf) { window.hoveredBigLeaf = foundBigLeaf; } else { window.hoveredBigLeaf = null; }

        // Detecção de Gota D'água
        const foundDroplet = mapDroplets.find(d => Math.sqrt(Math.pow(pos.x-d.x,2)+Math.pow(pos.y-d.y,2)) < 30);
        // Reuso a variável hoveredSeed/hoveredLeaf ou crio uma nova? Vamos usar hoveredLeaf temporariamente ou criar hoveredDroplet
        // Como o drawTooltip é genérico, posso chamar direto no drawWorld se eu setar uma variável.
        if (foundDroplet) {
             // Hack rápido: vamos desenhar o tooltip direto aqui ou criar a variável hoveredDroplet
             window.hoveredDroplet = foundDroplet; 
        } else {
             window.hoveredDroplet = null;
        }

        const foundCreature = creatures.find(c => !c.isDead && Math.sqrt(Math.pow(pos.x-c.x,2)+Math.pow(pos.y-c.y,2)) < c.size + 10);
        if (foundCreature !== hoveredCreature) { hoveredCreature = foundCreature; }

    } else {
        if (hoveredLeaf) hoveredLeaf = null;
        if (hoveredSeed) hoveredSeed = null;
        if (hoveredCreature) hoveredCreature = null;
    }
    if (isMouseDown && controlMode === 'mouse') { queen.targetX = pos.x; queen.targetY = pos.y; }
});

window.addEventListener('mouseup', () => isMouseDown = false);
window.addEventListener('keydown', (e) => { 
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key.toLowerCase()==='escape') togglePause(); 
    if (e.key.toLowerCase()==='f') {
        isMarkingMode = !isMarkingMode;
        const btn = document.getElementById('settings-pheromone-btn');
        if (btn) {
            btn.innerText = isMarkingMode ? "ATIVADO" : "DESATIVADO";
            btn.style.background = isMarkingMode ? "#9370DB" : "#555";
        }
        showQuickAlert(isMarkingMode ? "MODO DE MARCAÇÃO: ATIVADO (Soltando Feromônio)" : "MODO DE MARCAÇÃO: DESATIVADO");
    }
    keys[e.key.toLowerCase()] = true; 
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });


document.addEventListener('DOMContentLoaded', () => {
    const colonyDisplayNameElement = document.getElementById('colony-display-name');
    if (colonyDisplayNameElement) {
        colonyDisplayNameElement.addEventListener('click', () => {
            document.getElementById('naming-modal').style.display = 'flex';
            document.getElementById('colony-name-input').value = colonyName; 
        });
    }
});
window.addEventListener('start-game', (event) => {
    console.log('start-game event received, calling initGame');
    initGame(event.detail.showEffect); 
});

function saveGame() { 
    if(!queen) return; 
    
    // Criamos uma cópia das sementes sem as referências circulares das formigas
    const sanitizedSeeds = seeds.map(s => ({
        x: s.x, y: s.y, size: s.size, angle: s.angle, 
        name: s.name, description: s.description, 
        carriers: [] // Não salvamos os objetos das formigas aqui
    }));

    const saveData = { 
        queen:{x:queen.x,y:queen.y, hp:queen.hp}, 
        colonyName, chambers, zoom, controlMode, gregCongratulated, 
        eggs, leaves, 
        seeds: sanitizedSeeds, 
        storedLeaves, fungusFood, 
        workers: workers.map(w=>({
            x:w.x, y:w.y, task:w.task, hasFood:w.hasFood, 
            hasSeed:w.hasSeed, currentMap:w.currentMap, type:w.type, hp:w.hp, hunger:w.hunger
        })), 
        gameYear, gameDay, gameHour 
    };

    const isMulti = window.Multiplayer && window.Multiplayer.GAME_CODE;
    const saveKey = isMulti ? 'osubterraneo_multiplayer_save' : 'osubterraneo_save';
    
    localStorage.setItem(saveKey, JSON.stringify(saveData));
    console.log(`Jogo salvo no localStorage (${isMulti ? 'Multiplayer' : 'Solo'})`);
}
function setColonyName(n) { colonyName = n; let d = document.getElementById('colony-display-name') || document.createElement('div'); d.id='colony-display-name'; d.innerText = `Formigueiro: ${n}`; if(!document.getElementById('colony-display-name')) document.getElementById('game-container').appendChild(d); }
window.confirmColonyName = function() { 
    const n = document.getElementById('colony-name-input').value.trim(); 
    if(n){ 
        if (window.multiplayerIsHost()) {
            setColonyName(n); 
            document.getElementById('naming-modal').style.display='none'; 
            gamePaused = false;
            saveGame();
        } else {
            // Se um cliente de alguma forma abrir, ele apenas fecha
            document.getElementById('naming-modal').style.display='none';
        }
    } 
};

window.buildChamber = function(type) {
    if (window.multiplayerIsHost()) {
        // Lógica original de construção (Host executa)
        executeBuild(type);
    } else {
        // Cliente pede ao Host para construir
        window.sendMultiplayerAction('build_chamber', { chamberType: type });
        document.getElementById('construction-hud').style.display = 'none';
    }
};

function executeBuild(type) {
    // Vou extrair a lógica que estava dentro de buildChamber para uma função interna
    console.log("Host executando construção:", type);
    // ... (restante da lógica será movida para cá)
}
function openStats() {
    const modal = document.getElementById('stats-modal');
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(20px) brightness(0.5)'; // Efeito dramático ao abrir
    updateStatsUI(); 

    const activeQueensList = document.getElementById('active-queens-list');
    if (activeQueensList) {
        activeQueensList.innerHTML = ''; 
        const localQueenItem = document.createElement('li');
        localQueenItem.innerText = `👑 ${myPlayerNickname} (Você)`;
        activeQueensList.appendChild(localQueenItem);

        for (const playerAnt of otherPlayers.values()) {
            const otherQueenItem = document.createElement('li');
            otherQueenItem.innerText = `👑 ${playerAnt.name}`;
            activeQueensList.appendChild(otherQueenItem);
        }
    }
}

function updateStatsUI() {
    const modal = document.getElementById('stats-modal');
    if (!modal || modal.style.display === 'none') return; 

    // Capacidades
    const fungusMaxVal = chambers.fungus ? 50 : 0;

    const foodCount = document.getElementById('stat-food-count');
    const foodMax = document.getElementById('stat-food-max');
    const antCount = document.getElementById('stat-ant-count');
    const antMax = document.getElementById('stat-ant-max');
    const fungusCount = document.getElementById('stat-fungus-count');
    const fungusMax = document.getElementById('stat-fungus-max');
    const fungusBox = document.getElementById('stat-box-fungus');
    
    // Gota D'água
    const waterBox = document.getElementById('stat-box-water');
    const waterCount = document.getElementById('stat-water-count');
    
    if (waterBox) {
        waterBox.style.display = 'block'; // Sempre mostrar se existir o elemento
        if (waterCount) waterCount.innerText = waterDroplets;
    }

    if (foodCount) foodCount.innerText = storedLeaves.length;
    if (foodMax) foodMax.innerText = FOOD_CAPACITY;
    if (antCount) antCount.innerText = workers.length;
    if (antMax) antMax.innerText = ANT_CAPACITY;
    
    // Lógica da Câmara de Fungos no Relatório
    if (chambers.fungus) {
        if (fungusBox) fungusBox.style.display = 'block';
        if (fungusCount) fungusCount.innerText = Math.floor(fungusFood);
        if (fungusMax) fungusMax.innerText = fungusMaxVal;
        
        const barFungus = document.getElementById('bar-fungus');
        if (barFungus) barFungus.style.width = `${Math.min(100, (fungusFood / fungusMaxVal) * 100)}%`;
    } else {
        if (fungusBox) fungusBox.style.display = 'none';
    }

    const barFood = document.getElementById('bar-food');
    const barAnts = document.getElementById('bar-ants');

    if (barFood) barFood.style.width = `${Math.min(100, (storedLeaves.length / FOOD_CAPACITY) * 100)}%`;
    if (barAnts) barAnts.style.width = `${Math.min(100, (workers.length / ANT_CAPACITY) * 100)}%`;
}

function closeStats() { document.getElementById('stats-modal').style.display = 'none'; }
// 5. SISTEMA DE CONSTRUÇÃO E MULTIPLAYER ACTIONS
function executeBuild(t) {
    const currentLevel = chambers[t] || 0;
    if (currentLevel >= 2) return;

    if (t === 'eggs') {
        if (currentLevel === 0) {
            chambers.eggs = 1; ANT_CAPACITY = 10;
            eggs = [{x:CX+400,y:CY-30,timer:10,total:10},{x:CX+440,y:CY+20,timer:10,total:10}]; 
        } else if (currentLevel === 1) {
            if (fungusFood < 50) return;
            fungusFood -= 50; chambers.eggs = 2; ANT_CAPACITY = 40;
        }
    } else if (t === 'food') {
        if (currentLevel === 0) {
            chambers.food = 1; FOOD_CAPACITY = 20;
        } else if (currentLevel === 1) {
            if (storedLeaves.length < 30) return;
            storedLeaves.splice(0, 30); chambers.food = 2; FOOD_CAPACITY = 100;
        }
    } else if (t === 'fungus') {
        if (storedLeaves.length < 20) return;
        storedLeaves.splice(0, 20); chambers.fungus = 1;
    } else if (t === 'domestication') {
        if (storedLeaves.length < 200 || waterDroplets < 1) return;
        storedLeaves.splice(0, 200); waterDroplets--; chambers.domestication = 1;
    } else if (t === 'stockpile') {
        if (storedLeaves.length < 40 || fungusFood < 10) return;
        storedLeaves.splice(0, 40); fungusFood -= 10; chambers.stockpile = 1;
    }

    if (typeof updateHUD === 'function') updateHUD();
    saveGame(); 
}

window.voteSkipIntro = function() {
    if (window.Multiplayer && window.Multiplayer.GAME_CODE) {
        window.sendMultiplayerAction('vote_skip_intro', { id: PLAYER_ID });
    } else {
        finishIntro();
    }
};

window.updateSkipUI = function(current, total) {
    const btn = document.getElementById('btn-skip-intro');
    if (btn) {
        const displayTotal = total > 0 ? total : 1;
        btn.innerText = `Pular Cutscene (${current}/${displayTotal})`;
    }
}

function finishIntro() {
    console.log("Finalizando introdução...");
    const overlay = document.getElementById('intro-overlay');
    if (overlay) overlay.style.display = 'none';
    gamePaused = false; // Garante que o jogo despausa
}

function processHostAction(action, senderId) {
    if (!window.multiplayerIsHost()) return;
    
    switch (action.type) {
        case 'vote_skip_intro':
            skipVotes.add(senderId);
            // Conta você + outros jogadores do Map
            const totalPlayers = 1 + otherPlayers.size;
            
            updateSkipUI(skipVotes.size, totalPlayers);
            window.sendMultiplayerAction('update_skip_counter', { 
                current: skipVotes.size, 
                total: totalPlayers 
            });

            if (skipVotes.size >= totalPlayers) {
                window.sendMultiplayerAction('force_skip_intro');
                finishIntro();
            }
            break;
        case 'build_chamber':
            executeBuild(action.chamberType);
            break;
        case 'generate_ant':
            executeGenerateAnt(action.antType);
            break;
    }
}

function executeGenerateAnt(antType) {
    if (!chambers.eggs) return;
    let cost = 20;
    if (antType === 'soldier') cost = 40;
    else if (antType === 'scout') cost = 15;

    if (fungusFood >= cost) {
        fungusFood -= cost;
        const newAnt = new Ant(CX + 400, CY, antType);
        newAnt.currentMap = "underground";
        workers.push(newAnt);
        if (typeof updateHUD === 'function') updateHUD();
        saveGame();
    }
}

window.generateWorkerAnt = function(antType) {
    if (window.multiplayerIsHost()) {
        executeGenerateAnt(antType);
    } else {
        window.sendMultiplayerAction('generate_ant', { antType: antType });
    }
};

window.buildChamber = function(t) {
    if (window.multiplayerIsHost()) {
        executeBuild(t);
    } else {
        window.sendMultiplayerAction('build_chamber', { chamberType: t });
        const modal = document.getElementById('construction-hud');
        if (modal) modal.style.display = 'none';
    }
};

function updateQueenLogic(q) {
    if (!q) return;
    
    // Coleta de Gotas D'água
    if (currentScene === "surface") {
        for (let i = mapDroplets.length - 1; i >= 0; i--) {
            const d = mapDroplets[i];
            const dist = Math.sqrt(Math.pow(q.x - d.x, 2) + Math.pow(q.y - d.y, 2));
            if (dist < 40) { // Raio de coleta
                mapDroplets.splice(i, 1);
                waterDroplets++;
                showQuickAlert(`${q.name} encontrou uma Gota D'água Rara!`);
                saveGame();
            }
        }
    }
}


function recallAllToQueen() {
    workers.forEach(w => {

        w.task = 'guard';

        w.hasFood = false;

        w.hasSeed = false;

        w.targetLeaf = null;

        w.targetSeed = null;

        // Se estiver longe, faz ela vir para o mapa atual da rainha

        if (w.currentMap !== currentScene) {

            w.currentMap = currentScene;

            w.x = CX; w.y = CY; // Teleporta para a entrada se estiver trocando de mapa

        }

    });



    showQuickAlert("Todas as formigas convocadas para escolta!");

    if (typeof updateHUD === 'function') updateHUD();

}



function dismissGuard() {
    // Verificação Multiplayer: Se for Cliente, pede ao Host
    if (typeof multiplayer !== 'undefined' && !multiplayer.isHost && GAME_CODE) {
        multiplayer.sendAction('dismiss_guard', {});
        return;
    }

    workers.forEach(w => {
        if (w.task === 'guard') {
            w.task = 'idle';
        }
    });

    showQuickAlert("Escolta dispensada. Voltando ao trabalho!");
    if (typeof updateHUD === 'function') updateHUD();
}



// Sistema de Animação de UI (Formigas das Sidebars)
function updateUISentinels() {
    const canvases = document.querySelectorAll('.sidebar-ant-canvas');
    canvases.forEach(canvas => {
        const uctx = canvas.getContext('2d');
        const time = Date.now();
        
        uctx.clearRect(0, 0, canvas.width, canvas.height);
        uctx.save();
        uctx.translate(40, 60);
        uctx.rotate(0.2); // Leve inclinação de apoio

        const scale = 1.5;
        const bodyColor = "#2a1b0d";
        const darkColor = "#050300";

        // 1. PERNAS (Apoiadas na borda)
        uctx.strokeStyle = darkColor;
        uctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            [1, -1].forEach(side => {
                uctx.save();
                uctx.translate(0, side * 3);
                const angleBase = (0.6 + i * 0.9) * side;
                const twitch = Math.sin(time / 500 + i) * 0.1;
                uctx.beginPath();
                uctx.moveTo(0, 0);
                uctx.lineTo(Math.cos(angleBase + twitch) * 15 * scale, side * 15 * scale);
                uctx.lineTo(Math.cos(angleBase + twitch) * 25 * scale, side * 25 * scale);
                uctx.stroke();
                
                // Cerdas nas pernas
                uctx.strokeStyle = "rgba(255,255,255,0.1)";
                uctx.lineWidth = 0.5;
                for(let j=0; j<5; j++) {
                    uctx.beginPath();
                    uctx.moveTo(Math.cos(angleBase)*10*scale, side*10*scale + j*2);
                    uctx.lineTo(Math.cos(angleBase)*12*scale, side*12*scale + j*2);
                    uctx.stroke();
                }
                uctx.restore();
            });
        }

        // 2. ABDÔMEN (Gástro)
        const gastrGrad = uctx.createRadialGradient(-15, 0, 0, -15, 0, 30);
        gastrGrad.addColorStop(0, bodyColor);
        gastrGrad.addColorStop(1, darkColor);
        uctx.fillStyle = gastrGrad;
        uctx.beginPath();
        uctx.ellipse(-25, 0, 22, 16, 0, 0, Math.PI * 2);
        uctx.fill();
        
        // Segmentação do gástro
        uctx.strokeStyle = "rgba(255,255,255,0.05)";
        for(let j=1; j<4; j++) {
            uctx.beginPath();
            uctx.ellipse(-25 + (j*5), 0, 20, 14, 0, 1.2, Math.PI*2-1.2);
            uctx.stroke();
        }

        // 3. PECÍOLO (Nózinhos)
        uctx.fillStyle = darkColor;
        uctx.beginPath();
        uctx.arc(-10, 0, 4, 0, Math.PI * 2);
        uctx.arc(-5, 0, 3, 0, Math.PI * 2);
        uctx.fill();

        // 4. TÓRAX
        const thoraxGrad = uctx.createLinearGradient(0, -10, 0, 10);
        thoraxGrad.addColorStop(0, bodyColor);
        thoraxGrad.addColorStop(0.5, "#111");
        thoraxGrad.addColorStop(1, bodyColor);
        uctx.fillStyle = thoraxGrad;
        uctx.beginPath();
        uctx.ellipse(5, 0, 15, 10, 0, 0, Math.PI * 2);
        uctx.fill();

        // 5. CABEÇA
        uctx.translate(22, 0);
        const headGrad = uctx.createRadialGradient(0, 0, 0, 0, 0, 15);
        headGrad.addColorStop(0, "#3d1f00");
        headGrad.addColorStop(1, darkColor);
        uctx.fillStyle = headGrad;
        
        uctx.beginPath();
        uctx.moveTo(0, -8);
        uctx.quadraticCurveTo(12, -12, 12, 0);
        uctx.quadraticCurveTo(12, 12, 0, 8);
        uctx.closePath();
        uctx.fill();

        // MANDÍBULAS SERRILHADAS
        const mOpen = Math.abs(Math.sin(time / 600)) * 0.4;
        [-1, 1].forEach(side => {
            uctx.save();
            uctx.translate(8, side * 3);
            uctx.rotate(side * mOpen);
            uctx.fillStyle = "#0a0500";
            uctx.beginPath();
            uctx.moveTo(0, 0);
            uctx.quadraticCurveTo(side * 15, 5, side * 8, 20);
            for(let d=0; d<4; d++) {
                uctx.lineTo(side * (6 - d*2), 18 - d*4);
                uctx.lineTo(side * (5 - d*2), 16 - d*4);
            }
            uctx.fill();
            uctx.restore();
        });

        // OLHOS E ANTENAS
        uctx.fillStyle = "#000";
        uctx.beginPath(); uctx.arc(4, -5, 3, 0, Math.PI*2); uctx.fill();
        uctx.beginPath(); uctx.arc(4, 5, 3, 0, Math.PI*2); uctx.fill();
        uctx.fillStyle = "#fff"; uctx.globalAlpha = 0.2;
        uctx.beginPath(); uctx.arc(3, -6, 1, 0, Math.PI*2); uctx.fill();
        uctx.globalAlpha = 1.0;

        uctx.strokeStyle = darkColor;
        uctx.lineWidth = 1;
        [-1, 1].forEach(side => {
            uctx.beginPath();
            uctx.moveTo(5, side * 4);
            const ex = 15; const ey = side * 15 + Math.sin(time/300 + side)*5;
            uctx.lineTo(ex, ey);
            uctx.lineTo(ex + 10, ey - side * 5);
            uctx.stroke();
        });

        uctx.restore();
    });
}

function updateEggs() {
    if (currentScene !== "underground" || !queen) return;
    for (let i = eggs.length - 1; i >= 0; i--) {
        const egg = eggs[i];
        egg.timer -= 1/60;
        egg.isHatching = true; 
        
        if (egg.timer<=0) {
            const type = egg.antType || 'worker';
            const w = new Ant(egg.x, egg.y, type);
            w.task='idle';
            workers.push(w);
            eggs.splice(i,1);

            let label = "Operária";
            if (type === 'soldier') label = "Soldada";
            else if (type === 'scout') label = "Exploradora";

            if (workers.length>=2 && !gregCongratulated) {
                gregCongratulated=true;
                setTimeout(()=>showGregMessage(`${label} nasceu!`), 1000);
            }
            updateHUD();
            saveGame();
        }
    }
}
function togglePause() { gamePaused = !gamePaused; document.getElementById('pause-menu').style.display = gamePaused ? 'flex' : 'none'; }
function updateControlMode(m) { controlMode = m; saveGame(); }

// CORREÇÃO: Função switchScene protegida e com salvamento
function switchScene(scene) {
    if (isTransitioning) return;
    isTransitioning = true;
    
    // Salvar antes de trocar, para garantir persistência
    saveGame();

    const transition = document.getElementById('scene-transition');
    transition.classList.add('active');
    setTimeout(() => {
        currentScene = scene; mapName = scene === "surface" ? "A Superfície" : "O Subterrâneo";
        queen.currentMap = currentScene;

        workers.forEach(w => {
            const distW = Math.sqrt(Math.pow(w.x - CX, 2) + Math.pow(w.y - CY, 2));
            if (distW < 100) { 
                w.currentMap = currentScene;
                w.targetX = w.x; w.targetY = w.y;
            }
        });

        const constructionHUD = document.getElementById('construction-hud');
        if (constructionHUD) constructionHUD.style.display = 'none';

        queen.x = CX; queen.y = CY; queen.targetX = CX; queen.targetY = CY;
        if (typeof updateHUD === 'function') updateHUD();
        setTimeout(() => {
            transition.classList.remove('active');
            isTransitioning = false;
        }, 500);
    }, 1000);
}

function toggleConstructionHUD() {
    if (currentScene !== 'underground') {
        alert("Construções só podem ser acessadas no subterrâneo!");
        return;
    }
    const hud = document.getElementById('construction-hud');
    const isVisible = hud.style.display === 'flex';
    hud.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        updateConstructionHUD();
    }
    gamePaused = !isVisible; 
}

function updateConstructionHUD() {
    // Berçário (Eggs)
    const eggsItem = document.getElementById('construct-eggs');
    const eggsBtn = eggsItem.querySelector('.build-btn');
    const eggsCost = eggsItem.querySelector('.cost-display');
    if (chambers.eggs === 0) {
        eggsBtn.innerText = "Fazer câmara de ovos";
        eggsCost.innerText = "Custo: Grátis";
    } else if (chambers.eggs === 1) {
        eggsBtn.innerText = "Expandir Berçário (Lvl 2)";
        eggsCost.innerText = "Custo: 50 Fungos";
    } else {
        eggsItem.style.display = 'none';
    }

    // Depósito (Food)
    const foodItem = document.getElementById('construct-food');
    const foodBtn = foodItem.querySelector('.build-btn');
    const foodCost = foodItem.querySelector('.cost-display');
    if (chambers.food === 0) {
        foodBtn.innerText = "Câmara da comida";
        foodCost.innerText = "Custo: Grátis";
    } else if (chambers.food === 1) {
        foodBtn.innerText = "Expandir Depósito (Lvl 2)";
        foodCost.innerText = "Custo: 30 Folhas";
    } else {
        foodItem.style.display = 'none';
    }

    document.getElementById('construct-fungus').style.display = (chambers.fungus || chambers.eggs === 0 || chambers.food === 0) ? 'none' : 'block';
    document.getElementById('construct-domestication').style.display = chambers.domestication ? 'none' : 'block';
}
function changeZoom(delta) {
    zoom += delta;
    if (zoom < 0.5) zoom = 0.5; 
    if (zoom > 2.0) zoom = 2.0; 
    saveGame(); 
}

function screenToWorld(sx, sy) { 
    const r = canvas.getBoundingClientRect(); 
    return { 
        x: (sx - r.left - canvas.width / 2) / zoom + camera.x, 
        y: (sy - r.top - canvas.height / 2) / zoom + camera.y 
    }; 
}

function displayChatMessage(sender, message, isSystem = false) {
    const chatMessagesDiv = document.getElementById('chat-messages');
    if (!chatMessagesDiv) return;

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    if (isSystem) {
        messageElement.innerHTML = `<span style="color: grey;">[Sistema] ${message}</span>`;
    } else {
        messageElement.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
    }
    chatMessagesDiv.appendChild(messageElement);

    while (chatMessagesDiv.children.length > MAX_CHAT_MESSAGES) {
        chatMessagesDiv.removeChild(chatMessagesDiv.firstChild);
    }
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}


function deleteSaveData() {
    if (confirm("Tem certeza que deseja excluir o mundo? Esta ação é irreversível.")) {
        localStorage.removeItem('osubterraneo_save'); 
        localStorage.removeItem('temp_save_data'); 
        localStorage.removeItem('playerNickname'); 
        alert("Mundo excluído! Voltando para o menu principal.");
        window.location.href = 'index.html';
    }
}





function migrateSaveData(data, loadedVersion) {


    console.log(`Migrating save data from version ${loadedVersion} to ${SAVE_VERSION}`);


    loadedVersion = loadedVersion ?? 0; 





    if (loadedVersion < 1) {


        data.fungusFood = data.fungusFood ?? 0;


        data.chambers = data.chambers ?? { eggs: 0, food: 0, fungus: 0, domestication: 0 }; 


        if (data.workers) {


            data.workers.forEach(w => {


                w.targetLeaf = w.targetLeaf ?? null;


            });


        }


        data.currentScene = data.currentScene ?? "surface";


        data.gameYear = data.gameYear ?? 1;


        data.gameDay = data.gameDay ?? 1;


        data.gameHour = data.gameHour ?? 6;


        data.dayProgress = data.dayProgress ?? 0;


    }


    return data;


}





gameLoop();

