#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../.."

echo "🔄 Redémarrage complet de l'infrastructure..."
docker compose restart

echo "✅ Infrastructure redémarrée avec succès !"
