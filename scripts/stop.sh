#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

echo "🛑 Arrêt du Dashboard Web local..."
pkill -f "node dashboard.js" 2>/dev/null || true

echo "🛑 Arrêt de l'infrastructure DB MAGI..."
docker compose down

echo "✅ Tous les services et le Dashboard ont été arrêtés proprement."
