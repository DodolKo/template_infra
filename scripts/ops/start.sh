#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../.."

echo "🚀 Démarrage de l'infrastructure"
docker compose up -d

# Récupérer le port configuré dans .env
DASHBOARD_PORT=$(grep DASHBOARD_PORT .env | cut -d '=' -f2)
DASHBOARD_PORT=${DASHBOARD_PORT:-3010}

# Arrêter une instance précédente du dashboard si active
pkill -f "node tools/dashboard/dashboard.js" 2>/dev/null || true

echo "📊 Lancement du Dashboard Web local..."
nohup node tools/dashboard/dashboard.js > dashboard.log 2>&1 &

echo "✅ Infrastructure et Dashboard démarrés avec succès !"
echo "🌐 Accès Dashboard Web Monitor : http://localhost:${DASHBOARD_PORT}"
