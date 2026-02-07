function toggleSidebar(id) {
    const sb = document.getElementById(id);
    const isOpen = sb.classList.contains('open');
    
    document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('open'));
    
    if (!isOpen) {
        sb.classList.add('open');
        updateHUD(); // Atualiza dados ao abrir
    }
}

function updateHUD() {
    if (!workers) return;
    
    const workerCountDetail = document.getElementById('worker-count-detail');
    const soldierCountDetail = document.getElementById('soldier-count-detail');
    const scoutCountDetail = document.getElementById('scout-count-detail');
    const taskFoodDisplay = document.getElementById('task-food-count');
    
    const antCountDisplay = document.getElementById('ant-count');
    const idleWorkersDisplay = document.getElementById('idle-workers-display');

    const wCount = workers.filter(w => w.type === 'worker').length;
    const sCount = workers.filter(w => w.type === 'soldier').length;
    const scCount = workers.filter(w => w.type === 'scout').length;

    if (workerCountDetail) workerCountDetail.innerText = wCount;
    if (soldierCountDetail) soldierCountDetail.innerText = sCount;
    if (scoutCountDetail) scoutCountDetail.innerText = scCount;

    if (antCountDisplay) antCountDisplay.innerText = 1 + workers.length;
    
    const foodWorkers = workers.filter(w => w.task === 'food').length;
    const idleWorkers = workers.filter(w => w.task === 'idle').length;
    const guardWorkers = workers.filter(w => w.task === 'guard').length;

    if (taskFoodDisplay) taskFoodDisplay.innerText = foodWorkers;
    if (idleWorkersDisplay) idleWorkersDisplay.innerText = idleWorkers + (guardWorkers > 0 ? ` (+${guardWorkers} em Escolta)` : "");

    // Atualizar nomes baseados no nickname real
    const uiQueenName = document.getElementById('ui-queen-name');
    const sidebarQueenSection = document.querySelector('#ant-sidebar .sidebar-section');
    const nickname = typeof myPlayerNickname !== 'undefined' ? myPlayerNickname : "Rainha";
    
    if (uiQueenName) uiQueenName.innerText = nickname;

    // Atualizar Lista de Rainhas na Sidebar
    if (sidebarQueenSection) {
        // Encontra o cabeçalho "Rainhas" e limpa apenas os itens abaixo dele
        const header = Array.from(sidebarQueenSection.querySelectorAll('h4')).find(h => h.innerText === 'Rainhas');
        if (header) {
            // Remove todos os unit-items de rainha antigos
            sidebarQueenSection.querySelectorAll('.unit-item-queen').forEach(el => el.remove());
            
            // Adiciona você
            const localQueenItem = document.createElement('div');
            localQueenItem.className = 'unit-item unit-item-queen';
            localQueenItem.innerText = `👑 ${nickname} (Você)`;
            header.after(localQueenItem);

            // Adiciona outros jogadores
            if (typeof otherPlayers !== 'undefined') {
                otherPlayers.forEach(p => {
                    const otherItem = document.createElement('div');
                    otherItem.className = 'unit-item unit-item-queen';
                    otherItem.innerText = `👑 ${p.name}`;
                    localQueenItem.after(otherItem);
                });
            }
        }
    }
}

function changeTask(type, delta) {
    if (delta > 0) {
        // Priorizar Workers e Scouts para tarefas de coleta
        let idleWorker = workers.find(w => w.task === 'idle' && (w.type === 'worker' || w.type === 'scout'));
        if (!idleWorker) {
            // Se não houver, pega qualquer um (Soldiers agem como guardas na IA)
            idleWorker = workers.find(w => w.task === 'idle');
        }

        if (idleWorker) {
            idleWorker.task = type;
        }
    } else {
        const workingWorker = workers.find(w => w.task === type);
        if (workingWorker) {
            workingWorker.task = 'idle';
        }
    }
    
    updateHUD();
    if (typeof saveGame === 'function') saveGame();
}
