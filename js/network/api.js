// Quando você hospedar, mude essa URL para: 'https://seu-site.infinityfreeapp.com/api.php'
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost/subterraneo/php/api.php' 
    : 'https://o-subterraneo-seu-site.000webhostapp.com/api.php';

async function getGameState() {
    try {
        const response = await fetch(`${API_URL}?action=get_game_state`);
        if (!response.ok) throw new Error('Falha na conexão com o servidor');
        return await response.json();
    } catch (error) {
        console.warn("Rodando em modo Offline local (Servidor não encontrado)");
        return null;
    }
}

async function updateAntOnServer(ant) {
    const formData = new FormData();
    formData.append('id', ant.id);
    formData.append('x', ant.x);
    formData.append('y', ant.y);
    formData.append('angle', ant.angle);

    await fetch(`${API_URL}?action=update_ant`, {
        method: 'POST',
        body: formData
    });
}

async function createAntOnServer(x, y, angle) {
    const formData = new FormData();
    formData.append('x', x);
    formData.append('y', y);
    formData.append('angle', angle);

    const response = await fetch(`${API_URL}?action=add_ant`, {
        method: 'POST',
        body: formData
    });
    return await response.json();
}
