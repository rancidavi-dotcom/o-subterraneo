class Ant {
    constructor(x, y, type = 'queen', id = null, name = '') { // Added id and name
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.type = type;
        this.isQueen = type === 'queen';
        
        // Atributos de Casta
        this.size = 4;
        this.speed = 0.5;
        this.color = '#8b4513'; // Worker default
        this.maxLoad = 1;

        if (this.isQueen) {
            this.size = 8;
            this.speed = 0.7;
            this.color = '#4a0000';
        } else if (this.type === 'soldier') {
            this.size = 6;
            this.speed = 0.45; // Mais lenta, mas mais forte
            this.color = '#8b0000'; // Vermelho escuro
        } else if (this.type === 'scout') {
            this.size = 3;
            this.speed = 0.8; // Muito rápida
            this.color = '#daa520'; // Amarelo ocre
        }

        this.angle = 0;
        this.legCycle = 0;
        this.isMoving = false;
        this.task = 'idle';
        this.hasFood = false;
        this.hasSeed = false; // Nova propriedade
        this.carriedLeaf = null;
        this.targetLeaf = null;
        this.targetSeed = null; // Nova propriedade
        this.currentMap = "underground";
        this.id = id; // Player ID for multiplayer
        this.name = name; // Player name for multiplayer

        // Atributos de Combate
        this.hp = this.isQueen ? 80 : 50; // Rainha Frágil (80), Operária (50)
        this.maxHp = this.hp;
        this.attackPower = this.isQueen ? 8 : 10; // Rainha bate pouco
        this.isDead = false;
        this.lastAttackTime = 0; // Cooldown de ataque
        this.hunger = 100; // Nova propriedade: Fome individual
        this.maxHunger = 100;

        if (this.type === 'soldier') {
            this.hp = 120; // Tank
            this.maxHp = 120;
            this.attackPower = 18; // Dano bom
        } else if (this.type === 'scout') {
            this.hp = 40;
            this.maxHp = 40;
            this.attackPower = 6;
        }
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            
            // Notifica o sistema que uma formiga morreu
            window.dispatchEvent(new CustomEvent('ant-died', { 
                detail: { 
                    type: this.type, 
                    isQueen: this.isQueen,
                    name: this.name 
                } 
            }));
        }
    }

    update() {
        // Se for a rainha local OU uma operária (id nulo), usa movimento físico.
        // Se tiver ID (jogador remoto), usa interpolação para suavizar o movimento da rede.
        const isLocal = this.id === null;

        if (isLocal) { 
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                this.isMoving = true;
                this.angle = Math.atan2(dy, dx);
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;
                this.legCycle += 0.3; // Animação mais rápida combinando com a velocidade
            } else {
                this.isMoving = false;
            }
        } else { // This is an otherPlayer's ant, smoothly interpolate to target
            const interpolationFactor = 0.2; // Adjust this value for smoother/faster interpolation
                                             // 0.1 for very smooth, 0.5 for quicker snap
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 1) { // Move if target is not reached (tolerance 1 pixel)
                this.isMoving = true;
                this.angle = Math.atan2(dy, dx);
                this.x += dx * interpolationFactor;
                this.y += dy * interpolationFactor;
                this.legCycle += 0.3; // Animate legs during interpolation
            } else {
                this.x = this.targetX; // Snap to final position
                this.y = this.targetY;
                this.isMoving = false;
            }
        }

    }

        draw(ctx) {

            ctx.save();

            

            // Label superior

            ctx.save();

            ctx.translate(this.x, this.y);

            ctx.fillStyle = "rgba(255,255,255,0.8)";

            ctx.font = this.isQueen ? "bold 13px 'Segoe UI', Arial" : "9px Arial";

            ctx.textAlign = "center";

            let label = this.isQueen ? (this.name || "Rainha") : (this.type === 'soldier' ? "Soldada" : (this.type === 'scout' ? "Exploradora" : "Operária"));

            ctx.fillText(label, 0, -30);

            ctx.restore();

    

            ctx.translate(this.x, this.y);

            ctx.rotate(this.angle);

    

            const scale = this.isQueen ? 1.2 : 0.8;

            const bodyColor = this.color;

            const darkColor = "#050505";

    

                    // --- 1. PERNAS ANATÔMICAS (6 Pernas saindo do Tórax) ---

    

                    ctx.strokeStyle = darkColor;

    

                    ctx.lineWidth = this.isQueen ? 1.5 : 1;

    

                    const time = Date.now() / 100;

    

            

    

                    for (let i = 0; i < 3; i++) {

    

                        [1, -1].forEach(side => {

    

                            ctx.save();

    

                            // As pernas reais saem do tórax (centro)

    

                            ctx.translate(0, side * 2);

    

                            

    

                            // Ângulos reais: Frontal (0.6), Média (1.5), Traseira (2.4 radianos)

    

                            // Multiplicamos pelo lado para inverter esquerda/direita

    

                            const angleBase = (0.6 + i * 0.9) * side;

    

                            const legAnim = this.isMoving ? Math.sin(this.legCycle + (i * 2)) * 0.3 : 0;

    

                            const finalAngle = angleBase + legAnim;

    

                            

    

                            ctx.beginPath();

    

                            ctx.moveTo(0, 0);

    

                            

    

                            // FÊMUR (Parte superior da perna)

    

                            const fLength = (i === 2 ? 15 : 12) * scale; // Patas de trás são mais longas

    

                            const fX = Math.cos(finalAngle) * fLength;

    

                            const fY = Math.sin(finalAngle) * fLength;

    

                            ctx.lineTo(fX, fY);

    

                            

    

                            // TÍBIA (Dobra da perna)

    

                            const tLength = 10 * scale;

    

                            const tX = fX + Math.cos(finalAngle + 0.4 * side) * tLength;

    

                            const tY = fY + Math.sin(finalAngle + 0.4 * side) * tLength;

    

                            ctx.lineTo(tX, tY);

    

                            

    

                            // TARSO (Pé/Ponta)

    

                            ctx.lineTo(tX + Math.cos(finalAngle) * 4 * scale, tY + Math.sin(finalAngle) * 4 * scale);

    

                            

    

                            ctx.stroke();

    

                            ctx.restore();

    

                        });

    

                    }

    

            // --- 2. ABDÔMEN (GÁSTRO) ---

            ctx.save();

            const gastrGrad = ctx.createRadialGradient(-this.size*1.5, 0, 0, -this.size*1.5, 0, this.size*2);

            gastrGrad.addColorStop(0, bodyColor);

            gastrGrad.addColorStop(1, darkColor);

            ctx.fillStyle = gastrGrad;

            

            ctx.beginPath();

            // Forma de gota real

            ctx.ellipse(-this.size * 1.8, 0, this.size * 1.6, this.size * 1.2, 0, 0, Math.PI * 2);

            ctx.fill();

            

            // Segmentação (Placas do abdômen)

            ctx.strokeStyle = "rgba(255,255,255,0.05)";

            for(let j=1; j<4; j++) {

                ctx.beginPath();

                ctx.ellipse(-this.size * 1.8 + (j*4), 0, this.size * 1.5, this.size * 1.1, 0, 1.2, Math.PI*2-1.2);

                ctx.stroke();

            }

            ctx.restore();

    

            // --- 3. PECÍOLO (A "Cintura" de Nozinho - Marca registrada da formiga) ---

            ctx.fillStyle = darkColor;

            ctx.beginPath();

            ctx.arc(-this.size * 0.7, 0, this.size * 0.3, 0, Math.PI * 2); // Primeiro nó

            if (this.isQueen) ctx.arc(-this.size * 0.4, 0, this.size * 0.25, 0, Math.PI * 2); // Segundo nó

            ctx.fill();

    

            // --- 4. TÓRAX (MESOSSOMA) ---

            const thoraxGrad = ctx.createLinearGradient(0, -5, 0, 5);

            thoraxGrad.addColorStop(0, bodyColor);

            thoraxGrad.addColorStop(0.5, "#111");

            thoraxGrad.addColorStop(1, bodyColor);

            ctx.fillStyle = thoraxGrad;

            ctx.beginPath();

            ctx.ellipse(0, 0, this.size * 0.9, this.size * 0.7, 0, 0, Math.PI * 2);

            ctx.fill();

    

                    // --- 5. CABEÇA ---

    

                    ctx.save();

    

                    ctx.translate(this.size * 1.2, 0);

    

                    

    

                    // Gradiente da cabeça

    

                    const headG = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);

    

                    headG.addColorStop(0, bodyColor);

    

                    headG.addColorStop(1, darkColor);

    

                    ctx.fillStyle = headG;

    

            

    

                    // Cabeça em formato real (mais larga atrás)

            ctx.beginPath();

            ctx.moveTo(0, -this.size*0.6);

            ctx.quadraticCurveTo(this.size*0.8, -this.size*0.8, this.size*0.8, 0);

            ctx.quadraticCurveTo(this.size*0.8, this.size*0.8, 0, this.size*0.6);

            ctx.closePath();

            ctx.fill();

    

            // Mandíbulas (Pinças)

            ctx.fillStyle = "#000";

            const mAngle = Math.sin(time) * 0.1;

            [-1, 1].forEach(mSide => {

                ctx.beginPath();

                ctx.moveTo(this.size*0.7, mSide * 2);

                ctx.quadraticCurveTo(this.size*1.2, mSide * (5 + mAngle), this.size*0.9, mSide * 8);

                ctx.lineTo(this.size*0.6, mSide * 3);

                ctx.fill();

            });

    

            // Olhos compostos (Laterais e escuros)

            ctx.fillStyle = "#000";

            ctx.beginPath(); ctx.arc(this.size*0.3, -this.size*0.4, 1.5 * scale, 0, Math.PI*2); ctx.fill();

            ctx.beginPath(); ctx.arc(this.size*0.3, this.size*0.4, 1.5 * scale, 0, Math.PI*2); ctx.fill();

    

            // Antenas Geniculadas (Em "L")

            ctx.strokeStyle = darkColor;

            ctx.lineWidth = 0.8;

            [-1, 1].forEach(aSide => {

                ctx.beginPath();

                ctx.moveTo(this.size*0.5, aSide * 3);

                // Escapo (primeira parte longa)

                const scX = this.size*1.2;

                const scY = aSide * 8 + (Math.sin(time + aSide)*2);

                ctx.lineTo(scX, scY);

                // Funículo (dobra)

                ctx.lineTo(scX + 5, scY + aSide * 5);

                ctx.stroke();

            });

            ctx.restore();

    

            // Brilho de carapaça final

            ctx.fillStyle = "rgba(255,255,255,0.1)";

            ctx.beginPath(); ctx.ellipse(0, -2, this.size*0.5, this.size*0.2, 0, 0, Math.PI*2); ctx.fill();

    

            // Comida carregada

            if (this.hasFood) {

                ctx.save();

                ctx.translate(this.size * 2, 0);

                ctx.fillStyle = '#2e8b57';

                ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); ctx.fill();

                ctx.restore();

            }

    

            ctx.restore();

        }
}
