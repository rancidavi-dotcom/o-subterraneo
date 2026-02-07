<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// CONFIGURAÇÕES DO INFINITYFREE (Preencha a senha!)
$host = 'sql301.infinityfree.com';
$dbname = 'if0_41075920_jogo'; 
$username = 'if0_41075920';
$password = 'SUA_SENHA_AQUI'; 

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'Erro de conexão no servidor']);
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'host') {
    $code = strtoupper(substr(md5(uniqid()), 0, 6));
    $ip = $_SERVER['REMOTE_ADDR']; 
    
    $stmt = $pdo->prepare("REPLACE INTO rooms (code, ip) VALUES (?, ?)");
    $stmt->execute([$code, $ip]);
    echo json_encode(['code' => $code, 'ip' => $ip]);
} 

if ($action === 'join') {
    $code = strtoupper($_GET['code'] ?? '');
    $stmt = $pdo->prepare("SELECT ip FROM rooms WHERE code = ?");
    $stmt->execute([$code]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($room) {
        echo json_encode(['success' => true, 'ip' => $room['ip']]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Código não encontrado ou expirado.']);
    }
}
?>
