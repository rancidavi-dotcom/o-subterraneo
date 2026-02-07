# 🐜 Guia do Desenvolvedor - O Subterrâneo

Este documento explica a arquitetura do jogo e como adicionar novas funcionalidades (features) mantendo a sincronização multiplayer.

---

## 🏗️ Arquitetura Geral

O jogo é dividido em três partes principais:
1.  **Servidor (`server.js`)**: Gerencia as salas (Lobby), lista de jogadores e retransmite as mensagens de sincronização.
2.  **Motor Core (`js/core/engine.js`)**: Onde a mágica acontece. Contém o loop principal, física, renderização e estado do mundo.
3.  **Sistema Multiplayer (`js/multiplayer.js`)**: A ponte que conecta o motor ao servidor via WebSockets.

---

## 🔄 Como adicionar uma nova Feature Sincronizada

Para que algo novo (ex: uma nova barra de "Sede" ou um novo tipo de recurso) funcione no Multiplayer, siga estes 3 passos no arquivo `js/core/engine.js`:

### 1. Declarar a variável
Crie a variável global no início do arquivo.
```javascript
let waterLevel = 100; // Exemplo de nova mecânica
```

### 2. Enviar pelo Host (`serializeGameState`)
Adicione sua variável no objeto de retorno desta função. Isso garante que o Host mande o dado para os amigos.
```javascript
function serializeGameState() {
    return {
        // ... outras variáveis
        waterLevel: waterLevel 
    };
}
```

### 3. Receber no Cliente (`applyGameState`)
Atualize a variável local com o dado recebido do Host.
```javascript
function applyGameState(data) {
    if (!data || window.multiplayerIsHost()) return;
    // ... outros dados
    waterLevel = data.waterLevel ?? waterLevel;
}
```

---

## 🐜 Criando Novas Entidades (Criaturas/Formigas)

As entidades estão em `js/entities/`.
- **`Ant.js`**: Classe base para a Rainha e Operárias.
- **`Creature.js`**: Classe base para inimigos (aranhas, besouros).

**Regra de Ouro do Multiplayer:** Apenas o **Host** deve processar a lógica de IA (decidir para onde a formiga vai). Os clientes apenas recebem a posição `x` e `y` e desenham a formiga na tela.

---

## 🎨 Interface (UI)

- Os menus principais estão no `index.html`.
- O HUD de jogo está no `game.html`.
- A lógica de abrir/fechar abas está em `js/ui/sidebar.js`.

Se adicionar um botão novo no `game.html` que deve afetar o mundo (ex: "Matar todas as formigas"), use a função:
```javascript
window.sendMultiplayerAction('kill_all_ants', { reason: 'cheat' });
```

---

## 🛠️ Testando Localmente

Para testar o multiplayer no seu PC sem usar o Render:
1.  Abra o terminal e rode: `npm start`.
2.  Vá em **Opções** e clique em **"Copiar Meu Endereço"**.
3.  Abra uma **segunda instância** do jogo.
4.  Na segunda instância, vá em **Opções**, cole o endereço e clique em **Salvar**.
5.  Crie a sala na primeira e entre com o código na segunda.

---

## 🚀 Publicando no Render/GitHub

1.  Faça o commit das mudanças: `git add . && git commit -m "Nova feature"`.
2.  Envie para o GitHub: `git push origin main`.
3.  O Render detectará o push e fará o deploy automático em ~2 minutos.

**Dica:** Sempre verifique o console do navegador (F12) se algo parar de funcionar. 90% dos erros são variáveis não definidas (ReferenceError).
