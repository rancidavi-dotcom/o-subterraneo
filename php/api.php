<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dbPath = __DIR__ . '/subterraneo.db';
try {
    $pdo = new PDO("sqlite:$dbPath");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Criar tabela de jogadores se não existir
    $pdo->exec("CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, 
        name TEXT, 
        x REAL, 
        y REAL, 
        angle REAL, 
        scene TEXT,
        code TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    // Criar tabela de mensagens de chat se não existir
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    // Criar tabela de estado do jogo se não existir
    $pdo->exec("CREATE TABLE IF NOT EXISTS game_state (
        code TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        state_data TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';

switch($action) {
    case 'sync_player':
        $id = $_POST['id'];
        $name = $_POST['name'];
        $x = $_POST['x'];
        $y = $_POST['y'];
        $angle = $_POST['angle'];
        $scene = $_POST['scene'];
        $code = $_POST['code']; // Get the code
        
        $stmt = $pdo->prepare("REPLACE INTO players (id, name, x, y, angle, scene, code, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $stmt->execute([$id, $name, $x, $y, $angle, $scene, $code]);
        
        // Retorna todos os OUTROS jogadores que foram vistos nos últimos 10 segundos E COM O MESMO CÓDIGO
        $stmt = $pdo->prepare("SELECT * FROM players WHERE id != :id AND code = :code AND last_seen > datetime('now', '-10 seconds')");
        $stmt->execute([':id' => $id, ':code' => $code]);
        $other_players = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Retorna novas mensagens de chat para este código
        // last_message_id is not passed by client yet, so for now return all messages for the code
        // We will filter by last_message_id in a later step
        $stmt = $pdo->prepare("SELECT id, sender_name, message_text, timestamp FROM chat_messages WHERE code = :code ORDER BY id ASC");
        $stmt->execute([':code' => $code]);
        $chat_messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch game state for this code
        $game_state = null;
        $stmt = $pdo->prepare("SELECT state_data, host_id FROM game_state WHERE code = :code");
        $stmt->execute([':code' => $code]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($result) {
            $game_state = json_decode($result['state_data'], true);
            // Optionally, return host_id to client if needed
            $game_state['host_id'] = $result['host_id'];
        }

        echo json_encode(['players' => $other_players, 'chat_messages' => $chat_messages, 'game_state' => $game_state]);
        break;

    case 'send_chat':
        $code = $_POST['code'];
        $sender_name = $_POST['sender_name'];
        $message_text = $_POST['message_text'];
        
        $stmt = $pdo->prepare("INSERT INTO chat_messages (code, sender_name, message_text) VALUES (?, ?, ?)");
        $stmt->execute([$code, $sender_name, $message_text]);
        echo json_encode(['success' => true]);
        break;

    case 'get_game_state':
        $colony = $pdo->query("SELECT * FROM colony WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
        $ants = $pdo->query("SELECT * FROM ants")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['colony' => $colony, 'ants' => $ants]);
        break;
    case 'update_game_state':
        $code = $_POST['code'];
        $host_id = $_POST['host_id'];
        $state_data = $_POST['state_data'];

        $stmt = $pdo->prepare("REPLACE INTO game_state (code, host_id, state_data, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)");
        $stmt->execute([$code, $host_id, $state_data]);
        echo json_encode(['success' => true]);
        break;
    case 'disconnect_player':
        $id = $_POST['id'];
        $code = $_POST['code'];

        $stmt = $pdo->prepare("DELETE FROM players WHERE id = ? AND code = ?");
        $stmt->execute([$id, $code]);
        echo json_encode(['success' => true]);
        break;
}
?>
