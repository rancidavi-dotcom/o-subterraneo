-- Tabela da Colônia (Recursos)
CREATE TABLE IF NOT EXISTS colony (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50),
    food INT DEFAULT 0,
    materials INT DEFAULT 0,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela das Formigas
CREATE TABLE IF NOT EXISTS ants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    colony_id INT,
    x FLOAT,
    y FLOAT,
    angle FLOAT,
    type VARCHAR(20) DEFAULT 'worker',
    state VARCHAR(20) DEFAULT 'idle'
);

-- Tabela do Mapa (Grid de túneis)
CREATE TABLE IF NOT EXISTS map_tiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    x INT,
    y INT,
    type INT DEFAULT 1 -- 1: Terra, 0: Vazio/Túnel
);

-- Inserir colônia inicial se não existir
INSERT INTO colony (id, name, food, materials) 
SELECT 1, 'Formigueiro Alfa', 10, 0 
WHERE NOT EXISTS (SELECT 1 FROM colony WHERE id = 1);
