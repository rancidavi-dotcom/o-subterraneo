#!/bin/bash

PORT=8080

# Verifica se algo já está rodando na porta
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "Servidor já detectado na porta $PORT. Pulando inicialização do Node..."
else
    echo "Iniciando Servidor do Subterrâneo..."
    node server.js &
    sleep 2
fi

echo "Iniciando Túnel Ngrok..."
ngrok http $PORT