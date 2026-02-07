#!/bin/bash

PORT=8888

echo "Limpando porta $PORT..."
# Tenta fechar qualquer processo na porta 8888 (exige sudo para processos de outros usuários, mas aqui deve funcionar)
fuser -k $PORT/tcp 2>/dev/null

echo "Iniciando Servidor do Subterrâneo na porta $PORT..."
node server.js &
sleep 2

echo "Iniciando Túnel Ngrok..."
ngrok http $PORT
