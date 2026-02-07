const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let phpServer = null;

function startWebSocketServer() {
    const { fork } = require('child_process');
    const serverPath = path.join(__dirname, 'server.js');
    
    if (phpServer) return; // Já está rodando

    phpServer = fork(serverPath, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    console.log('Servidor WebSocket iniciado automaticamente na porta 8080');
}

function createWindow() {
  const saveDir = path.join(app.getPath('userData'), 'saves');
  if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  // Lógica de Salvamento Automático
  ipcMain.on('auto-save', (event, data) => {
    const filePath = path.join(saveDir, 'ultimo_mundo.sub');
    fs.writeFileSync(filePath, JSON.stringify(data));
    console.log('Jogo salvo automaticamente em:', filePath);
  });

  // Lógica para Excluir Save Rápido
  ipcMain.on('delete-game-save', (event) => {
    const filePath = path.join(saveDir, 'ultimo_mundo.sub');
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log('Arquivo de save rápido excluído:', filePath);
        } catch (error) {
            console.error('Erro ao excluir arquivo de save rápido:', error);
        }
    }
  });

  // Verificar se existe um save rápido
  ipcMain.on('check-auto-save', (event) => {
    const filePath = path.join(saveDir, 'ultimo_mundo.sub');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        event.reply('auto-save-result', JSON.parse(content));
    } else {
        event.reply('auto-save-result', null);
    }
  });

  // Apenas retorna o IP, o servidor já inicia no boot
  ipcMain.on('start-host', (event) => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIp = iface.address;
                break;
            }
        }
    }
    
    event.reply('host-status', `Rodando! IP: ${localIp}`);
    event.reply('local-ip', localIp);
  });

  // Fechar servidor ao fechar o app
  app.on('will-quit', () => {
    if (phpServer) phpServer.kill();
  });

  // Lógica para Salvar Arquivo .sub
  ipcMain.on('save-game', (event, data) => {
    const filePath = dialog.showSaveDialogSync(win, {
        title: 'Salvar Formigueiro',
        defaultPath: 'meu_formigueiro.sub',
        filters: [{ name: 'Arquivo Subterrâneo', extensions: ['sub'] }]
    });

    if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(data));
    }
  });

  // Lógica para Carregar Arquivo .sub
  ipcMain.on('load-game', (event) => {
    const filePaths = dialog.showOpenDialogSync(win, {
        properties: ['openFile'],
        filters: [{ name: 'Arquivo Subterrâneo', extensions: ['sub'] }]
    });

    if (filePaths && filePaths.length > 0) {
        const content = fs.readFileSync(filePaths[0], 'utf-8');
        event.reply('load-game-data', JSON.parse(content));
    }
  });

    // Lógica para Salvar Nickname do Jogador
    ipcMain.on('save-nickname', (event, nickname) => {
        const settingsPath = path.join(app.getPath('userData'), 'user_settings.json');
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            } catch (error) {
                console.error('Erro ao ler user_settings.json:', error);
            }
        }
        settings.playerNickname = nickname;
        fs.writeFileSync(settingsPath, JSON.stringify(settings));
        console.log('Nickname do jogador salvo:', nickname);
    });

    // Lógica para Carregar Nickname do Jogador
    ipcMain.on('load-nickname', (event) => {
        const settingsPath = path.join(app.getPath('userData'), 'user_settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                event.reply('load-nickname-result', settings.playerNickname || null);
            } catch (error) {
                console.error('Erro ao ler user_settings.json:', error);
                event.reply('load-nickname-result', null);
            }
        } else {
            event.reply('load-nickname-result', null);
        }
    });
}

app.whenReady().then(() => {
  startWebSocketServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
