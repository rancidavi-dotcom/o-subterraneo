class Creature {
    constructor(x, y, type = 'beetle') {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.type = type;
        this.isMoving = false;
        this.angle = Math.random() * Math.PI * 2;
        
        // Atributos baseados no tipo
        this.hp = 100;
        this.maxHp = 100;
        this.attackPower = 15; // Besouro agora machuca (era 5)
        this.speed = 0.3;
        this.size = 15;
        this.color = '#555';
        this.name = "Besouro Casca-Dura";
        this.description = "Um tanque natural. Pisoteia inimigos e resiste a muito dano.";

        if (type === 'spider') {
            this.hp = 180;
            this.maxHp = 180;
            this.attackPower = 35; // Aranha é letal (era 12)
            this.speed = 0.6;
            this.size = 20;
            this.color = '#111';
            this.name = "Aranha Viúva";
            this.description = "Predadora ágil. Causa muito dano e persegue sem trégua.";
        } else if (type === 'ladybug') {
            this.hp = 50;
            this.maxHp = 50;
            this.attackPower = 5;
            this.speed = 0.4;
            this.size = 12;
            this.color = '#ff0000';
            this.name = "Joaninha";
            this.description = "Passiva, mas se defende se atacada.";
        }

        this.isDead = false;
        this.isTamed = false;
        this.isDefeated = false;
        this.lastAttackTime = 0;
        this.detectionRange = (type === 'spider') ? 400 : 250; // Aranhas enxergam mais longe
        this.isChasing = false;
        this.aggroTimer = 0; // Tempo que permanece agressivo após perder o alvo
        this.currentFocusTarget = null; // Alvo atual da perseguição
    }

    takeDamage(amount, attacker = null) {
        if (this.isDead || this.isDefeated) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDefeated = true; // Ficou atordoada (pronta para capturar ou virar comida)
        }
        
        // Se for atacada, foca em quem atacou (Aggro)
        if (attacker && !attacker.isDead) {
            this.currentFocusTarget = attacker;
            this.aggroTimer = 400; // Foca por mais tempo se for revide
        } else {
            this.aggroTimer = 300; 
        }
    }

    update(potentialTargets = []) {
        if (this.isDead || this.isDefeated) return;

        // IA de Perseguição com Prioridade de Aggro
        let nearestTarget = null;
        let minDist = this.detectionRange;

        // Se já tem um alvo que a atacou, verifica se ele ainda é válido
        if (this.currentFocusTarget && !this.currentFocusTarget.isDead) {
            const distToFocus = Math.sqrt(Math.pow(this.x - this.currentFocusTarget.x, 2) + Math.pow(this.y - this.currentFocusTarget.y, 2));
            // Se o alvo de aggro ainda estiver por perto (dobro do range de visão), continua nele
            if (distToFocus < this.detectionRange * 1.5) {
                nearestTarget = this.currentFocusTarget;
            } else {
                this.currentFocusTarget = null;
            }
        }

        // Se não tem alvo de aggro, procura o mais próximo normalmente
        if (!nearestTarget && !this.isTamed) {
            potentialTargets.forEach(target => {
                if (target && !target.isDead) {
                    const d = Math.sqrt(Math.pow(this.x - target.x, 2) + Math.pow(this.y - target.y, 2));
                    if (d < minDist) {
                        minDist = d;
                        nearestTarget = target;
                    }
                }
            });
        }

        if (nearestTarget && (this.type === 'spider' || this.type === 'beetle')) {
            // Perseguir!
            this.targetX = nearestTarget.x;
            this.targetY = nearestTarget.y;
            this.isChasing = true;
            this.aggroTimer = Math.max(this.aggroTimer, 100);
        }

        if (this.aggroTimer > 0) {
            this.aggroTimer--;
            this.isChasing = true;

            // Movimento de perseguição
            const chaseSpeed = this.speed * 1.8; // Ficou mais rápida na fúria!
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                this.angle = Math.atan2(dy, dx);
                this.x += Math.cos(this.angle) * chaseSpeed;
                this.y += Math.sin(this.angle) * chaseSpeed;
                this.isMoving = true;
            } else {
                this.isMoving = false;
            }
            return; // Pula o movimento errático
        }

        this.isChasing = false;

        // Movimento errático original (IA simples quando não está perseguindo)
        if (Math.random() < 0.01 || Math.abs(this.x - this.targetX) < 10) {
            this.targetX = this.x + (Math.random() - 0.5) * 500;
            this.targetY = this.y + (Math.random() - 0.5) * 500;
        }

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 5) {
            this.angle = Math.atan2(dy, dx);
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
            this.isMoving = true;
        } else {
            this.isMoving = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Barra de Vida
        if (!this.isDead && !this.isTamed && this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.size, -this.size - 10, this.size * 2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.size, -this.size - 10, (this.size * 2) * (this.hp / this.maxHp), 4);
        }

        // Indicador de Agressividade (!)
        if (this.isChasing && !this.isTamed) {
            ctx.fillStyle = 'red';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('!', 0, -this.size - 15);
            
            // Aura de fúria
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.rotate(this.angle);

        // Corpo com textura de gradiente
        const bodyGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, this.size);
        bodyGrad.addColorStop(0, this.color);
        bodyGrad.addColorStop(1, 'black');
        ctx.fillStyle = bodyGrad;

        if (this.type === 'spider') {
            // Desenhar aranha mais realista
            ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size*0.8, 0, 0, Math.PI*2); ctx.fill();
            
            // Olhos brilhantes vermelhos
            ctx.fillStyle = "red";
            ctx.beginPath(); ctx.arc(this.size*0.6, -3, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(this.size*0.6, 3, 2, 0, Math.PI*2); ctx.fill();

            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            for(let i=0; i<8; i++) {
                const a = (i/8) * Math.PI * 2;
                ctx.beginPath(); ctx.moveTo(0,0); 
                ctx.quadraticCurveTo(Math.cos(a)*this.size, Math.sin(a)*this.size, Math.cos(a)*this.size*1.8, Math.sin(a)*this.size*1.8);
                ctx.stroke();
            }
        } else if (this.type === 'ladybug') {
            ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI*2); ctx.fill();
            // Manchas pretas
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(this.size*0.4, -this.size*0.4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(this.size*0.4, this.size*0.4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
        } else {
            // Besouro com carapaça dividida
            ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size*0.7, 0, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-this.size, 0); ctx.lineTo(this.size, 0); ctx.stroke();
        }

        if (this.isDefeated) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Efeito de atordoado
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.beginPath(); ctx.arc(0, 0, this.size + 5, 0, Math.PI*2); ctx.fill();
        }

        ctx.restore();
    }
}
