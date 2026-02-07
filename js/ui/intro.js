const story = [
    { name: "Greg", text: "Ei... você consegue me ouvir? Acorde!" },
    { name: "Greg", text: "Pelas barbas de Darwin, o feitiço daquela feiticeira realmente funcionou..." },
    { name: "Greg", text: "Você deve estar se sentindo estranho. Olhe para suas patas... quer dizer, mãos." },
    { name: "Greg", text: "Ela te transformou em uma Formiga Rainha! E nos baniu para as profundezas do Subterrâneo." },
    { name: "Greg", text: "Mas nem tudo está perdido. Com sua inteligência humana e este novo corpo, podemos construir o maior império que este solo já viu." },
    { name: "Greg", text: "Eu ficarei aqui no meu laboratório improvisado te orientando. Agora vá, comece a cavar!" }
];

let currentStep = 0;
let isTyping = false;

function startIntro() {
    document.getElementById('intro-overlay').style.display = 'flex';
    nextStep();
}

function typeWriter(text, i, fnCallback) {
    if (i < text.length) {
        document.getElementById("dialogue-text").innerHTML = text.substring(0, i+1) +'<span aria-hidden="true"></span>';
        setTimeout(function() {
            typeWriter(text, i + 1, fnCallback)
        }, 50);
    } else if (typeof fnCallback == 'function') {
        setTimeout(fnCallback, 700);
    }
}

function nextStep() {
    if (currentStep >= story.length) {
        document.getElementById('intro-overlay').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('intro-overlay').style.display = 'none';
            // Finalizou a intro de um NOVO JOGO, então mostra o efeito de acordar
            window.dispatchEvent(new CustomEvent('start-game', { detail: { showEffect: true } }));
        }, 1000);
        return;
    }

    const line = story[currentStep];
    isTyping = true;
    typeWriter(line.text, 0, () => {
        isTyping = false;
    });
    currentStep++;
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' && !isTyping) {
        nextStep();
    }
});

function showGregMessage(text) {
    const overlay = document.getElementById('intro-overlay');
    const textEl = document.getElementById("dialogue-text");
    const nameEl = document.getElementById("character-name");
    
    nameEl.innerText = "Dr. Greg";
    textEl.innerHTML = "";
    overlay.style.display = 'flex';
    overlay.style.background = 'rgba(0,0,0,0.7)'; // Fundo semi-transparente
    overlay.style.opacity = '1';

    typeWriter(text, 0, () => {
        isTyping = false;
        // Permite fechar com espaço
        const closeMsg = (e) => {
            if (e.code === 'Space') {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 500);
                window.removeEventListener('keydown', closeMsg);
            }
        };
        window.addEventListener('keydown', closeMsg);
    });
}

// Lógica de Inicialização ao carregar a página
const params = new URLSearchParams(window.location.search);
const introMode = params.get('mode');

if (introMode === 'new') {
    setTimeout(startIntro, 500);
} else {
    // Para modo continue/load/online, inicia o jogo IMEDIATAMENTE sem efeito de acordar
    window.dispatchEvent(new CustomEvent('start-game', { detail: { showEffect: false } }));
}