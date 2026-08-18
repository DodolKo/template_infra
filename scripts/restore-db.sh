#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "⚠️ Usage: sh scripts/restore-db.sh <nom_du_fichier_backup.sql.gz>"
  echo "Backups disponibles :"
  ls -l ./backups/ 2>/dev/null || echo "Aucun backup local trouvé."
  exit 1
fi

FULL_PATH="./backups/${BACKUP_FILE}"

if [ ! -f "$FULL_PATH" ]; then
  echo "❌ Fichier de sauvegarde introuvable : ${FULL_PATH}"
  exit 1
fi

echo "♻️ [DISASTER RECOVERY] Restauration de la base de données depuis ${BACKUP_FILE}..."

gunzip -c "$FULL_PATH" | docker exec -i melchior psql -U root app_db

echo "✅ [DISASTER RECOVERY] Base de données restaurée avec succès !"
