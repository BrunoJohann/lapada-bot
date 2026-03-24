#!/bin/sh
set -e

echo "==> Sincronizando schema com o banco..."
node_modules/.bin/prisma db push --accept-data-loss --skip-generate

echo "==> Iniciando o bot..."
exec node dist/bot.js
